#!/usr/bin/env python3
# Sales floor plans -> gallery images + 3D dollhouse data (walls, rooms, names, dimensions).
# Usage: python3 build_plans.py <plans_colored.pdf> <strong_color_jpeg_dir> <ocr.jsonl> <labels.json> <out_dir>
import sys, os, json, re, math
import numpy as np, cv2, fitz

PDF, JPG_DIR, OCR, LABELS, OUT = sys.argv[1:6]
os.makedirs(f'{OUT}/plans', exist_ok=True)
os.makedirs(f'{OUT}/plans/thumb', exist_ok=True)
os.makedirs(f'{OUT}/plans/3d', exist_ok=True)

TYPES = {  # page -> (type, building)
    1: ('GRa', 1), 2: ('GRa', 4), 3: ('GRb', 1), 4: ('GRb', 4), 5: ('B', 1), 6: ('B', 4), 7: ('A', 1), 8: ('A', 4),
    9: ('D', 1), 10: ('D', 4), 11: ('C', 1), 12: ('C', 4), 13: ('E', 2), 14: ('E', 3), 15: ('F', 2), 16: ('F', 3),
    17: ('H', 2), 18: ('H', 3), 19: ('G', 2), 20: ('G', 3), 21: ('PHc', 2), 22: ('PHc', 3), 23: ('PHd', 2), 24: ('PHd', 3),
    25: ('D1', 1), 26: ('D1', 4), 27: ('C1', 1), 28: ('C1', 4), 29: ('PHa', 1), 30: ('PHa', 4), 31: ('PHb', 1), 32: ('PHb', 4)}
SPEC = {  # type -> rooms, area, outdoor, floors, unit numbers
    'GRa': (3, 83.3, 'גינה כ-104 מ״ר', 'קרקע', [1]),
    'GRb': (5, 120.3, 'גינה כ-52.7 + 10.7 מ״ר', 'קרקע', [2]),
    'A': (3, 82.0, 'מרפסת כ-12 מ״ר', '1–13', [4 * f - 1 for f in range(1, 14)]),
    'B': (3, 82.7, 'מרפסת כ-12 מ״ר', '1–13', [4 * f for f in range(1, 14)]),
    'C': (4, 100.1, 'מרפסת כ-12 מ״ר', '1–13 (למעט 10)', [4 * f + 1 for f in range(1, 14) if f != 10]),
    'D': (5, 124.4, 'מרפסת כ-12 מ״ר', '1–13 (למעט 10)', [4 * f + 2 for f in range(1, 14) if f != 10]),
    'C1': (4, 104.2, 'מרפסת כ-12 מ״ר', '10', [41]),
    'D1': (5, 120.3, 'מרפסת כ-12 מ״ר', '10', [42]),
    'PHa': (5, 143.0, 'מרפסת גג כ-43.6 מ״ר', '14 · פנטהאוז', [55]),
    'PHb': (5, 162.4, 'מרפסת גג כ-42.3 + 10.1 מ״ר', '14 · פנטהאוז', [56]),
    'E': (3, 82.4, 'מרפסת כ-12 מ״ר', '1–7', [4 * f - 3 for f in range(1, 8)]),
    'F': (3, 82.9, 'מרפסת כ-12.2 מ״ר', '1–7', [4 * f - 2 for f in range(1, 8)]),
    'G': (3, 82.9, 'מרפסת כ-12.2 מ״ר', '1–7', [4 * f - 1 for f in range(1, 8)]),
    'H': (5, 118.6, 'מרפסת כ-12 מ״ר', '1–7', [4 * f for f in range(1, 8)]),
    'PHc': (4, 153.4, 'מרפסת גג כ-42.4 + 6.6 מ״ר', '8 · פנטהאוז', [29]),
    'PHd': (5, 147.2, 'מרפסת גג כ-49.6 מ״ר', '8 · פנטהאוז', [30]),
}
EXPO = {
    'GRa': 'צפון-מערב · צפון-מזרח', 'GRb': 'צפון-מזרח · דרום-מזרח · דרום-מערב', 'A': 'דרום-מערב · צפון-מערב',
    'B': 'צפון-מערב · צפון-מזרח', 'C': 'צפון-מזרח · דרום-מזרח · דרום-מערב', 'D': 'דרום-מערב · דרום-מזרח',
    'C1': 'צפון-מזרח · דרום-מזרח · דרום-מערב', 'D1': 'דרום-מערב · דרום-מזרח', 'PHa': 'צפון-מערב · דרום-מערב · דרום-מזרח',
    'PHb': 'צפון-מערב · צפון-מזרח · דרום-מזרח', 'E': 'דרום-מערב · צפון-מערב', 'F': 'צפון-מערב · צפון-מזרח',
    'G': 'צפון-מזרח · דרום-מזרח', 'H': 'דרום-מערב · דרום-מזרח', 'PHc': 'צפון-מזרח · צפון-מערב · דרום-מערב',
    'PHd': 'צפון-מזרח · דרום-מזרח · דרום-מערב'}
# label templates: cluster ids from the OCR clustering pass -> room class
TPL = {'master': [43], 'safe': [0, 46, 88, 13, 60], 'bed': [11, 96, 102], 'kitchen': [9, 64, 83],
       'bath': [4, 7, 31, 49, 55, 2, 20, 32, 91], 'wc': [85, 14, 37], 'laundry': [29, 59, 101, 38], 'screen': [8, 16]}
NAMES = {'master': 'חדר הורים', 'safe': 'ממ״ד / חדר שינה', 'bed': 'חדר שינה', 'kitchen': 'מטבח', 'living': 'סלון ופינת אוכל',
         'livkit': 'סלון, פינת אוכל ומטבח', 'bath': 'חדר רחצה', 'wc': 'שירותי אורחים', 'laundry': 'חדר כביסה',
         'screen': 'מסתור כביסה', 'balcony': 'מרפסת שמש', 'roof': 'מרפסת גג', 'garden': 'גינה פרטית', 'hall': 'מבואה ומעבר'}

doc = fitz.open(PDF)
ocr = {}
for l in open(OCR):
    d = json.loads(l)
    ocr[int(d['file'][-6:-4])] = d['items']
labels = json.load(open(LABELS))
crop_dir = os.path.dirname(OCR)
crops = json.load(open(os.path.join(crop_dir, 'crops.json')))
TXH = {}
for pg_, its in ocr.items():
    hs = [it['h'] for it in its if re.match(r'^\s*\d{2,4}\s*/\s*\d{2,4}', it['t'])]
    v = float(np.median(hs)) if hs else 25.0
    TXH[pg_] = v if 15 <= v <= 35 else 25.0


def binz(g):
    return np.where(g < 150, 0, 255).astype(np.uint8)


templates = []
for cls, cids in TPL.items():
    for lab in labels:
        if lab['c'] in cids:
            g = cv2.imread(f"{crop_dir}/c{lab['pg']:02d}.png", 0)
            x, y, w, h = lab['box']
            t = binz(g[max(0, y - 2):y + h + 2, max(0, x - 2):x + w + 2])
            if t.shape[0] > 8 and t.shape[1] > 12:
                for rot in (None, cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
                    templates.append((cls, t if rot is None else cv2.rotate(t, rot), TXH.get(lab['pg'], 25.0)))
print('templates', len(templates))


def find_labels(g, bounds, txh):
    bx, by, bw, bh = bounds
    b = binz(g[by:by + bh, bx:bx + bw])
    hits = []
    for cls, t, th0 in templates:
        for s in (txh / th0 * 0.92, txh / th0, txh / th0 * 1.08):
            tt = cv2.resize(t, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            if tt.shape[0] >= b.shape[0] or tt.shape[1] >= b.shape[1] or min(tt.shape) < 8:
                continue
            r = cv2.matchTemplate(b, tt, cv2.TM_CCOEFF_NORMED)
            ys, xs = np.nonzero(r > 0.74)
            for y, x in zip(ys, xs):
                hits.append((float(r[y, x]), cls, x + bx, y + by, tt.shape[1], tt.shape[0]))
    hits.sort(key=lambda h: -h[0])
    keep = []
    for h in hits:
        cx, cy = h[2] + h[4] / 2, h[3] + h[5] / 2
        ok = True
        for k in keep:
            kx, ky = k[2] + k[4] / 2, k[3] + k[5] / 2
            if abs(cx - kx) < (h[4] + k[4]) / 2 * 0.8 and abs(cy - ky) < (h[5] + k[5]) / 2 * 0.9:
                ok = False
                break
        if ok:
            keep.append(h)
    return keep


def greedy_rects(m):
    m = m.copy().astype(bool)
    H, W = m.shape
    out = []
    for y in range(H):
        x = 0
        while x < W:
            if not m[y, x]:
                x += 1
                continue
            x1 = x
            while x1 < W and m[y, x1]:
                x1 += 1
            y1 = y + 1
            while y1 < H and m[y1, x:x1].all():
                y1 += 1
            m[y:y1, x:x1] = False
            out.append([x, y, x1 - x, y1 - y])
            x = x1
    return out


DIMRE = re.compile(r'^\s*(\d{2,4})\s*/\s*(\d{2,4})')
meta = []
for pg in range(1, 33):
    typ, bld = TYPES[pg]
    rooms_n, area, outdoor, floors, units = SPEC[typ]
    # ---- gallery images (strong-colour JPEG where supplied)
    jp = os.path.join(JPG_DIR, f'{pg}.jpeg')
    if pg <= 10 and os.path.exists(jp):
        gal = cv2.imread(jp)
    else:
        pm = doc[pg - 1].get_pixmap(matrix=fitz.Matrix(2, 2))
        gal = cv2.imdecode(np.frombuffer(pm.tobytes('png'), np.uint8), cv2.IMREAD_COLOR)
    cv2.imwrite(f'{OUT}/plans/p{pg:02d}.jpg', gal, [cv2.IMWRITE_JPEG_QUALITY, 84])
    th = cv2.resize(gal, (560, int(560 * gal.shape[0] / gal.shape[1])), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f'{OUT}/plans/thumb/p{pg:02d}.jpg', th, [cv2.IMWRITE_JPEG_QUALITY, 80])

    # ---- analysis on the PDF render crop
    im = cv2.imread(f'{crop_dir}/c{pg:02d}.png')
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    H, W = g.shape
    walls = ((g < 120) & (hsv[:, :, 1] < 60)).astype(np.uint8)
    walls = cv2.morphologyEx(walls, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    # keep only the main wall network (drop key-plan / legends)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(walls, np.ones((25, 25), np.uint8)))
    ox, oy = crops[str(pg)][:2]
    keepc = np.zeros(n, bool)
    for c_ in range(1, n):
        x_, y_, w_, h_, a_ = st[c_]
        in_key = (x_ + ox + w_ < 560) and (y_ + oy + h_ < 560)
        keepc[c_] = a_ > 2500 and not in_key
    walls &= keepc[lab].astype(np.uint8)
    ys_, xs_ = np.nonzero(walls)
    wx, wy = int(xs_.min()), int(ys_.min())
    ww, wh = int(xs_.max() - wx + 1), int(ys_.max() - wy + 1)

    # floor colours
    B_, G_, R_ = [im[:, :, i].astype(int) for i in range(3)]
    wood = (R_ > G_ + 25) & (G_ > B_ + 10) & (R_ > 110) & (R_ < 215)
    green = (G_ > R_ + 18) & (G_ > B_ + 8)
    nonwhite = (g < 246) | wood | green
    fp = cv2.morphologyEx(nonwhite.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    ff = fp.copy() * 255
    msk = np.zeros((H + 2, W + 2), np.uint8)
    for sx, sy in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        if ff[sy, sx] == 0:
            cv2.floodFill(ff, msk, (sx, sy), 128)
    footprint = (ff != 128).astype(np.uint8)
    py_, px_ = np.mgrid[0:H, 0:W]
    footprint[((px_ + ox < 560) & (py_ + oy < 560)) | ((px_ + ox > 1550) & (py_ + oy < 500))] = 0

    # scale from dimension labels (cm)
    dims = []
    for it in ocr.get(pg, []):
        mm = DIMRE.match(it['t'])
        if mm:
            a_, b_ = int(mm.group(1)), int(mm.group(2))
            if 80 <= a_ <= 1500 and 80 <= b_ <= 1500:
                dims.append(dict(w=a_, l=b_, cx=it['x'] + it['w'] / 2, cy=it['y'] + it['h'] / 2))
    # doors: bridge straight-wall gaps
    k = 125
    closed = walls | cv2.morphologyEx(walls, cv2.MORPH_CLOSE, np.ones((1, k), np.uint8)) | \
        cv2.morphologyEx(walls, cv2.MORPH_CLOSE, np.ones((k, 1), np.uint8))
    outdoor_m = cv2.morphologyEx((wood | green).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    outdoor_m = cv2.morphologyEx(outdoor_m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    free = footprint & (1 - cv2.dilate(closed, np.ones((3, 3), np.uint8)))
    free_in = free & (1 - cv2.dilate(outdoor_m, np.ones((5, 5), np.uint8)))
    free_out = (outdoor_m & footprint & (1 - closed)).astype(np.uint8)
    n1, rl1, rs1, rc1 = cv2.connectedComponentsWithStats(free_in, connectivity=4)
    n2, rl2, rs2, rc2 = cv2.connectedComponentsWithStats(free_out, connectivity=4)
    rl = rl1.copy(); rl[rl2 > 0] = rl2[rl2 > 0] + n1 - 1
    rs = np.concatenate([rs1, rs2[1:]]); rc = np.concatenate([rc1, rc2[1:]]); n = n1 + n2 - 1

    # scale estimate: px per cm from rooms with a dims label
    ratios = []
    for d in dims:
        x, y = int(d['cx']), int(d['cy'])
        if 0 <= y < H and 0 <= x < W and rl[y, x] > 0:
            r = rl[y, x]
            bw, bh = rs[r, 2], rs[r, 3]
            big, small = max(d['w'], d['l']), min(d['w'], d['l'])
            ratios.append(max(bw, bh) / big)
            ratios.append(min(bw, bh) / small)
    pxcm = float(np.median(ratios)) if len(ratios) >= 4 else None
    fallback = pxcm is None
    if fallback:
        pxcm = 0.8
    mpp = 0.01 / pxcm

    lbls = find_labels(g, (wx, wy, ww, wh), TXH.get(pg, 25.0))
    rooms = []
    idmap = np.zeros((H, W), np.uint8)
    for r in range(1, n):
        a_m2 = rs[r, 4] * mpp * mpp
        if a_m2 < 1.2:
            continue
        m = rl == r
        if r < n1:
            ring = cv2.dilate(m.astype(np.uint8), np.ones((15, 15), np.uint8)) & (1 - m.astype(np.uint8))
            if ring.sum() and (outdoor_m[ring > 0].mean() > 0.45 or (free_out[ring > 0].mean() > 0.3 and a_m2 < 6)):
                continue
        cols = im[m]
        bgr = cols.mean(0)
        frac_wood = wood[m].mean()
        frac_green = green[m].mean()
        cls = None
        names = [l[1] for l in lbls if m[min(H - 1, int(l[3] + l[5] / 2)), min(W - 1, int(l[2] + l[4] / 2))]]
        if frac_green > 0.35:
            cls = 'garden'
        elif frac_wood > 0.35:
            cls = 'roof' if typ.startswith('PH') and a_m2 > 20 else 'balcony'
        elif names:
            pri = ['safe', 'master', 'bed', 'kitchen', 'wc', 'bath', 'laundry', 'screen']
            cls = sorted(names, key=lambda c: pri.index(c))[0]
            if cls == 'kitchen' and a_m2 > 16:
                cls = 'livkit'
        rd = [d for d in dims if 0 <= int(d['cy']) < H and 0 <= int(d['cx']) < W and rl[int(d['cy']), int(d['cx'])] == r]
        rooms.append(dict(r=r, cls=cls, area=a_m2, dims=rd, bbox=rs[r, :4].tolist(), c=rc[r].tolist(), m=m))
    # unlabelled: biggest beige with dims -> living; rest -> hall / skip
    if not any(x['cls'] in ('livkit', 'living') for x in rooms):
        cand = [x for x in rooms if x['cls'] in (None, 'kitchen')]
        if cand:
            big = max(cand, key=lambda x: x['area'])
            big['cls'] = 'livkit' if big['cls'] == 'kitchen' else 'living'
    out_rooms = []
    for x in rooms:
        if x['cls'] is None:
            if x['area'] < 3.0:
                continue
            mc = im[x['m']].mean(0)
            cool = mc[0] >= mc[2] - 2
            x['cls'] = 'bath' if cool and x['area'] < 9 else ('bed' if x['dims'] and x['area'] >= 7 else 'hall')
        idx = len(out_rooms) + 1
        idmap[x['m']] = idx
        d = x['dims'][0] if x['dims'] else None
        ys, xs = np.nonzero(x['m'])
        # interior point closest to centroid
        cx, cy = x['c']
        j = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
        out_rooms.append(dict(id=idx, kind=x['cls'], name=NAMES[x['cls']], area=round(x['area'], 1),
                              dims=f"{d['w'] / 100:.2f}×{d['l'] / 100:.2f}" if d else '',
                              c=[int(xs[j]), int(ys[j])], bbox=x['bbox']))
    # tour order: entrance-ish -> living first, then by angle around the plan centre
    pc = np.array([wx + ww / 2, wy + wh / 2])
    order = sorted(out_rooms, key=lambda r: (0 if r['kind'] in ('livkit', 'living') else 1,
                                            math.atan2(r['c'][1] - pc[1], r['c'][0] - pc[0])))
    for i, r in enumerate(order):
        r['tour'] = i

    # outputs for 3D: texture, id map, walls
    tex = im.copy()
    hsv2 = cv2.cvtColor(tex, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv2[:, :, 1] = np.clip(hsv2[:, :, 1] * 1.25, 0, 255)
    tex = cv2.cvtColor(hsv2.astype(np.uint8), cv2.COLOR_HSV2BGR)
    tex[walls > 0] = (96, 102, 108)
    cv2.imwrite(f'{OUT}/plans/3d/p{pg:02d}.jpg', tex, [cv2.IMWRITE_JPEG_QUALITY, 86])
    cv2.imwrite(f'{OUT}/plans/3d/p{pg:02d}_id.png', idmap)
    ds = 3
    wm = cv2.resize(walls, (W // ds, H // ds), interpolation=cv2.INTER_AREA) > 0
    rects = greedy_rects(wm)
    meta.append(dict(page=pg, type=typ, building=bld, rooms=rooms_n, area=area, outdoor=outdoor, floors=floors,
                     units=units, expo=EXPO[typ], w=W, h=H, mpp=round(mpp, 5), ds=ds, walls=rects,
                     spaces=out_rooms, bounds=[int(wx), int(wy), int(ww), int(wh)], fallback=fallback))
    kinds = ', '.join(f"{r['name']}" for r in order)
    print(f'p{pg:02d} {typ:4s} b{bld} cm/px={1 / pxcm:.2f} labels={len(lbls)} walls={len(rects)} rooms={len(out_rooms)}: {kinds}')


def fix_scale(meta):
    # pages without enough dimension labels borrow the scale of their mirrored twin
    for m in meta:
        if not m.get('fallback'):
            continue
        tw = [x for x in meta if x['type'] == m['type'] and x['page'] != m['page'] and not x.get('fallback')]
        if not tw:
            continue
        k = tw[0]['mpp'] / m['mpp']
        m['mpp'] = tw[0]['mpp']
        for r in m['spaces']:
            r['area'] = round(r['area'] * k * k, 1)
        m['fallback'] = False
    return meta


fix_scale(meta)
json.dump(meta, open(f'{OUT}/plans/plans.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok')
