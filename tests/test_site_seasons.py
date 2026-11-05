import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sync_site_seasons import broadcast_profile, broadcast_day


class BroadcastTests(unittest.TestCase):
    policy = {'long_running_min_episodes': 50}

    def test_episode_numbers_keep_same_day_batch_and_overnight_broadcast(self):
        meta = dict(id=1, type=2, platform='TV', date='2026-07-02', total_episodes=13)
        p = broadcast_profile(meta, {'data': [
            {'sort':1,'airdate':'2026-07-02'}, {'sort':2,'airdate':'2026-07-02'},
            {'sort':3,'airdate':'2026-07-03T01:30:00+09:00'},
            {'sort':4,'airdate':'2026-07-09'}]}, self.policy)
        self.assertEqual([e['number'] for e in p['episodes']], [1,2,3,4])
        self.assertEqual(p['episodes'][2]['broadcast_date'], '2026-07-02')
        self.assertIsNone(p['confirmed_end'])
        self.assertEqual(broadcast_day('2026-07-03T19:30:00+09:00'),'2026-07-03')

    def test_continuation_and_hiatus_follow_actual_episode_dates(self):
        meta = dict(id=1, type=2, platform='TV', date='2026-01-03', total_episodes=12)
        p = broadcast_profile(meta, {'data': [{'airdate':'2026-01-03'}, {'airdate':'2026-07-01'}]}, self.policy)
        self.assertEqual(p['quarters'], ['202601', '202607'])
        self.assertFalse(p['long_running'])

    def test_month_only_schedule_does_not_invent_a_day(self):
        meta = dict(id=1, type=2, platform='TV', date='2026-10-01', total_episodes=26)
        p = broadcast_profile(meta, {'data': [{'airdate':'2027-04'}]}, self.policy)
        self.assertEqual(p['quarters'], ['202610', '202704'])
        self.assertEqual(p['end'], '2027-04')

    def test_unknown_end_does_not_project_weekly_episodes(self):
        meta = dict(id=1, type=2, platform='TV', date='2026-01-03', total_episodes=26)
        p = broadcast_profile(meta, {'data': []}, self.policy)
        self.assertEqual(p['quarters'], ['202601'])
        self.assertEqual(p['basis'], 'premiere_only')
        meta['total_episodes'] = 54
        self.assertTrue(broadcast_profile(meta, {}, self.policy)['long_running'])


if __name__ == '__main__':
    unittest.main()
