import importlib.util
from pathlib import Path
import tempfile
import unittest
import json

spec = importlib.util.spec_from_file_location('roster', Path(__file__).parents[1] / 'tools/calendar-build/import_roster.py')
roster = importlib.util.module_from_spec(spec)
spec.loader.exec_module(roster)


class CalendarRosterTests(unittest.TestCase):
    def test_consults_clinic_exclusion_and_midnight_year_boundary(self):
        tab = dict(month='2026-12', sheet='202612', values=[
            ['日期', None, '12/31', None, '1/1'],
            ['照會', None, '其家', None, '其家'],
            ['AM', None, '門診Leader', '其家'],
            [None, None, '法鑑（杜）', '其家'],
            ['PM', None, '14:00-15:30 聯討', '其家'],
            [None, None, '不是本人', '其家庭'],
        ])
        events = roster.convert(tab)
        self.assertEqual({e['title'] for e in events}, {'照會', '法鑑（杜）', '14:00-15:30 聯討'})
        self.assertTrue(all(e['date'] == '2026-12-31' for e in events))
        self.assertEqual(next(e['startTime'] for e in events if '聯討' in e['title']), '14:00')

    def test_month_replacement_is_idempotent_and_retains_other_months(self):
        nov = dict(month='2026-11', sheet='202611', values=[['日期', None, '11/2'], ['照會', None, '其家']])
        dec = dict(month='2026-12', sheet='202612', values=[['日期', None, '12/1'], ['照會', None, '其家']])
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'roster.json'
            roster.update([nov,dec], output)
            first = output.read_text()
            self.assertFalse(roster.update([nov], output))
            self.assertEqual(first, output.read_text())
            self.assertEqual(len(json.loads(output.read_text())['events']), 2)
            roster.update([{**nov, 'values':[]}], output)
            self.assertEqual([e['sourceMonth'] for e in json.loads(output.read_text())['events']], ['2026-12'])


if __name__ == '__main__':
    unittest.main()
