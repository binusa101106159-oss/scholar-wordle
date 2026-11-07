"""Convert bounded Google Sheets range results into this owner's calendar feed.

Input: [{month: '2026-11', sheet: '202611', provisional: false, values: [...]}].
Never commit raw input: it contains other staff's assignments.
"""
import argparse
import calendar
import datetime as dt
import hashlib
import json
from pathlib import Path
import re

OWNER = '其家'
SOURCE = 'https://docs.google.com/spreadsheets/d/1h9E8meiqYRY_9Ux03lE2J6FDCuOH4zE7cqDEb2aL_M8/edit'


def assigned(value):
    return OWNER in re.split(r'[、,，/／\s]+', str(value or '').strip())


def convert(tab):
    month = tab['month']
    if month < '2026-11':
        raise ValueError('Calendar starts November 2026')
    year, mon = map(int, month.split('-'))
    end = f'{month}-{calendar.monthrange(year, mon)[1]:02d}'
    events, dates, period = {}, {}, ''

    def add(title, date, finish, slot, cell, monthly=False):
        title = str(title).strip()
        if not title or '門診' in title:
            return
        identity = '|'.join([month, date, finish, slot, title])
        ident = 'roster-' + hashlib.sha256(identity.encode()).hexdigest()[:20]
        match = re.search(r'(\d{1,2}:\d{2})\s*[-–～~]\s*(\d{1,2}:\d{2})', title)
        events[ident] = dict(id=ident, title=title, date=date, endDate=finish,
                             startTime=match[1].zfill(5) if match else '',
                             endTime=match[2].zfill(5) if match else '',
                             period=slot, notes='月份職務（未指定日期）' if monthly else '',
                             source='roster', sourceMonth=month, sheet=tab['sheet'],
                             sourceCell=cell, provisional=bool(tab.get('provisional')))

    for index, row in enumerate(tab['values'], 1):
        row = list(row) + [None] * (18 - len(row))
        if row[0] == '日期':
            dates = {}
            period = ''
            for col in (2, 4, 6, 8, 10):
                value = re.fullmatch(r'(\d{1,2})/(\d{1,2})', str(row[col] or '').strip())
                if value:
                    m, d = map(int, value.groups())
                    y = year + (1 if mon == 12 and m == 1 else -1 if mon == 1 and m == 12 else 0)
                    dates[col] = dt.date(y, m, d).isoformat()
        if row[0] in ('AM', 'PM', '照會'):
            period = row[0]
        for col, date in dates.items():
            if date[:7] == month and assigned(row[col] if row[0] == '照會' else row[col + 1]):
                title = '照會' if row[0] == '照會' else row[col]
                add(title, date, date, '' if row[0] == '照會' else period,
                    f'{chr(65 + col)}{index}')
        # The right-hand summary duplicates dated duties. Only explicit monthly
        # roles are imported here; pending task summaries aren't invented dates.
        for col in (13, 16):
            if col + 1 < len(row) and assigned(row[col + 1]) and row[col] in ('法鑑', '教學', '行政', '實務/臨場'):
                add(row[col], month + '-01', end, '', f'{chr(65 + col)}{index}', True)
    return sorted(events.values(), key=lambda event: (event['date'], event['period'], event['title']))


def update(tabs, output):
    previous = json.loads(output.read_text()) if output.exists() else {'version': 1, 'events': [], 'months': {}}
    original = json.dumps(previous, sort_keys=True)
    for tab in tabs:
        events = convert(tab)
        previous['events'] = [e for e in previous['events'] if e['sourceMonth'] != tab['month']] + events
        previous['months'][tab['month']] = dict(sheet=tab['sheet'], provisional=bool(tab.get('provisional')), count=len(events))
    previous.update(owner=OWNER, sourceUrl=SOURCE)
    previous['events'].sort(key=lambda e: (e['date'], e['period'], e['title']))
    if json.dumps(previous, sort_keys=True) == original:
        return False
    previous['updatedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + '\n')
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, default=Path('calendar/roster.json'))
    args = parser.parse_args()
    update(json.loads(args.input.read_text()), args.output)
