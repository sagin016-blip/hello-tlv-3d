#!/usr/bin/env python3
# Light-rail chapter data -> assets/rail.json
# Sources (cached in src/rail/):
#   purple_ways.json / purple_gap.json  OSM ways of the Purple Line (railway=construction, light_rail), Nov 2026
#   rail_area.json                      OSM Red Line ways around the site
#   walk_maavak.json                    OSM foot routing (routing.openstreetmap.de) home -> HaMaavak station
# Station positions: NTA route maps (Purple Line residents' presentations 2021/2023) snapped to the OSM
# alignment at the named junctions. HaMaavak is "on Derech HaShalom" (Tel Aviv municipality plan
# 507-0951863, 2025) -> placed at Derech HaShalom / Aluf Sadeh / Amishav. Positions are approximate.
import json, math, os
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = f'{D}/src/rail'
O = json.load(open(f'{D}/scene.json'))['origin']; KX, KY = 94330.0, 110860.0
xz = lambda lat, lon: [round((lon - O['lon']) * KX, 1), round(-(lat - O['lat']) * KY, 1)]

ways = {}
for f in ('purple_ways.json', 'purple_gap.json'):
    for e in json.load(open(f'{R}/{f}'))['elements']:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('construction') == 'light_rail' and (t.get('name') == 'הקו הסגול' or e['id'] in (389737613, 389737617)):
            ways[e['id']] = [(p['lat'], p['lon']) for p in e['geometry']]

def chain(ws):
    """Join way polylines that share endpoints into continuous lines."""
    segs = [list(w) for w in ws]; out = []
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    while segs:
        cur = segs.pop(0); grown = True
        while grown:
            grown = False
            for i, s in enumerate(segs):
                if key(s[0]) == key(cur[-1]): cur += s[1:]
                elif key(s[-1]) == key(cur[-1]): cur += s[::-1][1:]
                elif key(s[-1]) == key(cur[0]): cur = s[:-1] + cur
                elif key(s[0]) == key(cur[0]): cur = s[::-1][:-1] + cur
                else: continue
                segs.pop(i); grown = True; break
        out.append(cur)
    return out

purple = [[xz(*p) for p in L] for L in chain(ways.values())]
red = []
for e in json.load(open(f'{R}/rail_area.json'))['elements']:
    if e['type'] == 'way' and e.get('tags', {}).get('name') == 'הקו האדום':
        red.append([(p['lat'], p['lon']) for p in e['geometry']])
red = [[xz(*p) for p in L] for L in chain(red)]

ST = [  # name, sub, lat, lon, kind
    ('המאבק', 'התחנה הקרובה לבית', 32.05925, 34.80860, 'home'),
    ('פארק וולפסון', '', 32.05646, 34.80630, ''),
    ('משה דיין', '', 32.05332, 34.80022, ''),
    ('גבעתי', '', 32.05363, 34.79634, ''),
    ('האצ״ל', '', 32.05404, 34.79087, ''),
    ('ההגנה', 'רכבת ישראל', 32.05418, 34.78559, 'x'),
    ('כורזין', '', 32.05850, 34.81505, ''),
    ('רזיאל', '', 32.05983, 34.82113, ''),
    ('הירדן', '', 32.05891, 34.82816, ''),
]
stations = [dict(name=n, sub=s, kind=k, p=xz(la, lo), lat=la, lon=lo) for n, s, la, lo, k in ST]

r = json.load(open(f'{R}/walk_maavak.json'))['routes'][0]
walk = dict(dist=round(r['distance'] / 10) * 10, min=round(r['distance'] / 80),
            path=[xz(lat, lon) for lon, lat in r['geometry']['coordinates']])

json.dump(dict(purple=purple, red=red, stations=stations, walk=walk), open(f'{D}/assets/rail.json', 'w'), ensure_ascii=False)
print('purple lines', len(purple), [len(l) for l in purple], '| red', len(red), '| walk', walk['dist'], 'm', walk['min'], 'min')
for s in stations: print(' ', s['name'], s['p'])
