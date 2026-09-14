import copy
import csv
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_archive_csv import build_catalog, target

ROOT = Path(__file__).resolve().parents[1]


class ArchiveImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / '上传作品信息.csv').open(encoding='utf-8-sig', newline='') as handle:
            cls.rows = list(csv.DictReader(handle))
        cls.catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))

    def test_every_source_row_is_preserved(self):
        d = self.catalog
        self.assertEqual((len(d['subjects']), len(d['videos']), len(d['segments'])), (206, 32, 589))
        self.assertEqual({e['source']['row'] for e in d['segments']}, set(range(2, len(self.rows) + 2)))
        for entry in d['segments']:
            row = self.rows[entry['source']['row'] - 2]
            t = entry['targets'][0]
            self.assertEqual(entry['subject_ids'], [int(row['作品ID'])])
            self.assertEqual((entry['bvid'], t['p'], t['seconds']), target(row['开始时间']))
            self.assertEqual((entry['bvid'], t['p'], t['end_seconds']), target(row['结束时间']))
            self.assertNotIn('obscured', entry)

    def test_no_invented_dates_or_video_metadata(self):
        for video in self.catalog['videos']:
            self.assertIsNone(video['live_date'])
            for page in video['pages']:
                self.assertIsNone(page['cid'])
                self.assertIsNone(page['duration'])
        self.assertTrue(all('obscured' not in e for e in self.catalog['segments']))
        self.assertEqual(len([s for s in self.catalog['subjects'] if s['name'] == '航海王']), 2)

    def test_bad_ranges_and_mismatched_part_fail(self):
        for column, value in [('结束时间', self.rows[0]['开始时间']), ('p数', '2'), ('开始时间（剪辑）', '00:00:00.000')]:
            row = copy.deepcopy(self.rows[0])
            row[column] = value
            with self.assertRaises(ValueError):
                build_catalog([row], {}, 'test')

    def test_duplicate_rows_fail(self):
        with self.assertRaises(ValueError):
            build_catalog([self.rows[0], self.rows[0]], {}, 'test')


if __name__ == '__main__':
    unittest.main()
