#!/usr/bin/env python3
# Walking routes (OSM foot routing) from the project to key destinations -> assets/walks.json
import json, sys, subprocess, time, os
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
meta = json.load(open(f'{D}/scene.json'))
O = meta['origin']; KX, KY = 94330.0, 110860.0
HOME = (32.063556, 34.803764)  # Derech HaShalom 87
DEST = [
    dict(id='park', name='פארק וולפסון', sub='כמאה דונם של מדשאות, עצי שקמה ואגם', lat=32.05897, lon=34.80608, q='פארק אדית וולפסון, תל אביב'),
    dict(id='station', name='רכבת השלום', sub='רכבת ישראל', lat=32.07356, lon=34.79292, q='תחנת רכבת תל אביב השלום'),
    dict(id='azrieli', name='קניון עזריאלי', sub='שופינג, מסעדות ותצפית', lat=32.07440, lon=34.79195, q='קניון עזריאלי, תל אביב'),
    dict(id='sarona', name='שרונה מרקט', sub='מתחם שרונה · קולינריה ובילוי', lat=32.07110, lon=34.78706, q='שרונה מרקט, תל אביב'),
    dict(id='beach', name='חוף הים', sub='חוף ירושלים · הטיילת', lat=32.07443, lon=34.76453, q='חוף ירושלים, תל אביב'),
]
out = dict(home=dict(lat=HOME[0], lon=HOME[1], q='דרך השלום 87, תל אביב'), routes=[])
for d in DEST:
    url = f'https://routing.openstreetmap.de/routed-foot/route/v1/driving/{HOME[1]},{HOME[0]};{d["lon"]},{d["lat"]}?overview=full&geometries=geojson'
    r = json.loads(subprocess.check_output(['curl', '-s', '-m', '40', '-A', 'walk-client/1.0', url]))['routes'][0]
    pts = [[round((lon - O['lon']) * KX, 1), round(-(lat - O['lat']) * KY, 1)] for lon, lat in r['geometry']['coordinates']]
    out['routes'].append(dict(d, dist=round(r['distance']), min=round(r['distance'] / 80), path=pts))  # 80 m/min ≈ 4.8 km/h
    print(d['name'], round(r['distance']), 'm', round(r['distance'] / 80), 'min', len(pts), 'pts')
    time.sleep(1)
json.dump(out, open(f'{D}/assets/walks.json', 'w'), ensure_ascii=False)
