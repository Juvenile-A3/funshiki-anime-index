import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

spec = importlib.util.spec_from_file_location('sync_site_assets', Path(__file__).resolve().parents[1] / 'scripts/sync_site_assets.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class AssetSyncTests(unittest.TestCase):
    def setUp(self):
        test_root = (Path(__file__).resolve().parents[1] / 'output/site-sync-tests').resolve()
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        assert Path(self.temp.name).resolve().parent == test_root
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        assets = self.root / 'site/assets'
        (assets / 'covers').mkdir(parents=True)
        for key, value in [('ROOT', self.root), ('ASSETS', assets), ('MANIFEST', assets / 'subjects.json')]:
            patcher = patch.object(sync, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.subject = dict(id=12, name='人工旧名', original_name='Old', aliases=['昵称'], image='https://lain.bgm.tv/old.jpg')
        self.detail = dict(id=12, name='New', name_cn='新名称', type=2, date='2027-02-01', platform='TV',
                           summary='完整简介', infobox=[{'key': '别名', 'value': [{'v': '新别名'}]}],
                           images={'large': 'https://lain.bgm.tv/new.jpg'}, rating={'score': 8.5, 'total': 12, 'rank': 1})

    def image(self, color='red'):
        output = io.BytesIO()
        Image.new('RGB', (800, 1200), color).save(output, 'PNG')
        return output.getvalue()

    def fetch(self, url):
        return json.dumps(self.detail).encode() if 'api.bgm.tv' in url else self.image()

    def initial(self):
        with patch.object(sync, 'download', side_effect=self.fetch):
            return sync.sync_subject(self.subject, {}, True, {})

    def test_live_metadata_two_sizes_and_old_names(self):
        entry = self.initial()
        self.assertEqual(entry['metadata']['name'], '新名称')
        self.assertEqual(entry['metadata']['quarter'], '202701')
        self.assertIn('人工旧名', entry['metadata']['aliases'])
        self.assertEqual([v['width'] for v in entry['image_variants']], [320, 640])
        self.assertTrue(sync.usable(entry))

    def test_same_url_changed_image_content_is_detected(self):
        previous = self.initial()
        with patch.object(sync, 'download', side_effect=lambda url: json.dumps(self.detail).encode() if 'api.bgm.tv' in url else self.image('blue')):
            updated = sync.sync_subject(self.subject, previous, True, {})
        self.assertEqual(updated['image_source'], previous['image_source'])
        self.assertNotEqual(updated['image'], previous['image'])
        self.assertIn('cover_content', sync.changes_for(self.subject, previous, updated))

    def test_unchanged_refresh_keeps_image_names_and_no_false_changes(self):
        previous = self.initial()
        with patch.object(sync, 'download', side_effect=self.fetch), patch.object(sync, 'write_variants') as write:
            updated = sync.sync_subject(self.subject, previous, True, {})
        write.assert_not_called()
        self.assertEqual(updated['image'], previous['image'])
        self.assertEqual(sync.changes_for(self.subject, previous, updated), {})

    def test_incremental_run_needs_no_network_and_applies_overrides(self):
        previous = self.initial()
        with patch.object(sync, 'download', side_effect=AssertionError('Unexpected network')):
            updated = sync.sync_subject(self.subject, previous, False, {'name': '固定名称'})
        self.assertEqual(updated['metadata']['name'], '固定名称')
        self.assertEqual(updated['upstream']['name'], '新名称')

    def test_failed_download_never_mutates_previous_snapshot(self):
        previous = self.initial()
        original = copy.deepcopy(previous)
        self.detail['name_cn'] = '另一名称'
        with patch.object(sync, 'download', side_effect=lambda url: json.dumps(self.detail).encode() if 'api.bgm.tv' in url else (_ for _ in ()).throw(OSError('offline'))):
            with self.assertRaises(OSError):
                sync.sync_subject(self.subject, previous, True, {})
        self.assertEqual(previous, original)

    def test_cleanup_removes_only_unreferenced_generated_files(self):
        entry = self.initial()
        orphan = sync.local_file('assets/covers/99-0123456789abcdef.webp')
        orphan.write_bytes(b'old')
        keep = sync.ASSETS / 'covers/manual.webp'
        keep.write_bytes(b'manual')
        removed = sync.prune_covers({'subjects': {'12': entry}})
        self.assertEqual(removed, ['assets/covers/99-0123456789abcdef.webp'])
        self.assertTrue(keep.exists())
        self.assertTrue(sync.usable(entry))
        with self.assertRaises(ValueError):
            sync.local_file('assets/covers/../../outside.webp')

    def test_stale_mode_reports_outage_and_blocks_missing_assets(self):
        entry = self.initial()
        (self.root / 'data').mkdir()
        (self.root / 'config').mkdir()
        (self.root / 'data/catalog.json').write_text(json.dumps({'subjects': [self.subject]}), encoding='utf-8')
        (self.root / 'config/subject-overrides.json').write_text('{}', encoding='utf-8')
        sync.save_manifest({'subjects': {'12': entry}})
        with patch('sys.argv', ['sync', '--refresh', '--allow-stale']), patch.object(sync, 'download', side_effect=OSError('offline')), patch.dict('os.environ', {}, clear=True):
            sync.main()
            report = json.loads((self.root / 'output/site-sync/changes.json').read_text(encoding='utf-8'))
            self.assertTrue(report['failures'][0]['fallback'])
            self.assertEqual(json.loads(sync.MANIFEST.read_text(encoding='utf-8'))['subjects']['12'], entry)
            (self.root / 'config/subject-overrides.json').write_text(json.dumps({'12': {'name': '断网时仍保留人工修改'}}), encoding='utf-8')
            sync.main()
            self.assertEqual(json.loads(sync.MANIFEST.read_text(encoding='utf-8'))['subjects']['12']['metadata']['name'], '断网时仍保留人工修改')
            sync.local_file(entry['image']).unlink()
            with self.assertRaises(SystemExit):
                sync.main()


if __name__ == '__main__':
    unittest.main()
