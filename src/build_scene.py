#!/usr/bin/env python3
# HELLO TLV — procedural Gaussian-splat scene builder.
# Usage: python3 build_scene.py <osm_dir> <out_dir> <logo_png>
import json, math, sys, os, glob
import numpy as np
import cv2

OSM_DIR, OUT_DIR, LOGO = sys.argv[1], sys.argv[2], sys.argv[3]
rng = np.random.default_rng(20261118)

# ---------------------------------------------------------------- geo frame
LAT0, LON0 = 32.06396, 34.80434            # Amishav reference point
KX, KY = 94330.0, 110860.0                 # metres per degree lon / lat at 32.06N
OE, ON = -24.95, -47.25                    # plot centre (midpoint of old blocks 87/89)


def en(lat, lon):
    return (lon - LON0) * KX - OE, (lat - LAT0) * KY - ON


def w3(e, n, y=0.0):
    return np.array([e, y, -n], np.float32)


# ---------------------------------------------------------------- splat buffer
G = dict(GROUND=0, ROAD=1, GRASS=2, TREE=3, CITY=4, PROJ=5, CAR=6, LIGHT=7,
         WATER=8, RAIL=9, RING=10, DUST=11, PGROUND=12, PLAN=13)
parts = []


def bc(v, n, k):
    a = np.asarray(v, np.float32)
    if a.ndim == 1:
        a = np.broadcast_to(a, (n, k))
    return np.ascontiguousarray(a.reshape(n, k), np.float32)


def add(pos, scale, quat, rgb, alpha, group, flag=0, delay=0, logo=None):
    pos = np.asarray(pos, np.float32).reshape(-1, 3)
    n = len(pos)
    if n == 0:
        return
    parts.append(dict(
        pos=pos, scale=bc(scale, n, 3), quat=bc(quat, n, 4), rgb=bc(rgb, n, 3),
        a=np.broadcast_to(np.asarray(alpha, np.float32), (n,)).copy(),
        g=np.full(n, group, np.uint8),
        f=np.broadcast_to(np.asarray(flag, np.uint8), (n,)).copy(),
        d=np.broadcast_to(np.asarray(delay, np.uint8), (n,)).copy()))


def mat2quat(t, b, nrm):
    R = np.stack([t, b, nrm], axis=2)  # columns
    m00, m11, m22 = R[:, 0, 0], R[:, 1, 1], R[:, 2, 2]
    w = np.sqrt(np.maximum(0, 1 + m00 + m11 + m22)) / 2
    x = np.sqrt(np.maximum(0, 1 + m00 - m11 - m22)) / 2
    y = np.sqrt(np.maximum(0, 1 - m00 + m11 - m22)) / 2
    z = np.sqrt(np.maximum(0, 1 - m00 - m11 + m22)) / 2
    x = np.copysign(x, R[:, 2, 1] - R[:, 1, 2])
    y = np.copysign(y, R[:, 0, 2] - R[:, 2, 0])
    z = np.copysign(z, R[:, 1, 0] - R[:, 0, 1])
    q = np.stack([w, x, y, z], 1)
    return q / np.linalg.norm(q, axis=1, keepdims=True)


UPQ = np.array([0.70710678, -0.70710678, 0, 0], np.float32)  # local z -> world +y (flat on ground)


def flat_quat(n, ang=None):
    """Quaternions for ground-lying splats, local z = up, rotated by ang around up."""
    if ang is None:
        ang = rng.uniform(0, np.pi, n)
    t = np.stack([np.cos(ang), np.zeros(n), np.sin(ang)], 1)
    up = np.tile([0.0, 1.0, 0.0], (n, 1))
    b = np.cross(up, t)
    return mat2quat(t, b, up)


def wall_quat(tx, tz, n):
    t = np.tile([tx, 0.0, tz], (n, 1))
    b = np.tile([0.0, 1.0, 0.0], (n, 1))
    return mat2quat(t, b, np.cross(t, b))


def rand_quat(n):
    q = rng.normal(size=(n, 4))
    return q / np.linalg.norm(q, axis=1, keepdims=True)


def dist2d(e, n):
    return np.hypot(e, n)


def hsh(*a):
    h = 0
    for v in a:
        h = (h * 1000003 + int(v)) & 0xFFFFFFFF
    return (h * 2654435761 % 4294967296) / 4294967296.0


def jitter_col(rgb, n, amt):
    return np.clip(np.asarray(rgb, np.float32) + rng.normal(0, amt, (n, 3)), 0, 255)


# ---------------------------------------------------------------- OSM load
area = json.load(open(os.path.join(OSM_DIR, 'area.json')))['elements']
area_ids = set(e['id'] for e in area)
sky = []
for f in sorted(glob.glob(os.path.join(OSM_DIR, 'sky', '*.json'))):
    try:
        for e in json.load(open(f))['elements']:
            if e['id'] not in area_ids:
                sky.append(e)
                area_ids.add(e['id'])
    except Exception:
        pass


def geom_en(e):
    g = e.get('geometry') or []
    return np.array([en(p['lat'], p['lon']) for p in g if p], np.float64)


def pfloat(v):
    try:
        return float(str(v).replace('m', '').replace(',', '.').split(';')[0].strip())
    except Exception:
        return None


# ---------------------------------------------------------------- project plan (key plan, half-res px)
MPP = 0.09703
ANG = math.radians(25.5)
UX = np.array([math.cos(ANG), math.sin(ANG)])     # plan +x in (e,n)
DN = np.array([math.sin(ANG), -math.cos(ANG)])    # plan +y (down) in (e,n)
PCX, PCY = 420.0, 479.0


def plan2en(px, py):
    px = np.asarray(px, np.float64) - PCX
    py = np.asarray(py, np.float64) - PCY
    e = (px * UX[0] + py * DN[0]) * MPP
    n = (px * UX[1] + py * DN[1]) * MPP
    return e, n


PLOT_PX = [(62, 183), (778, 220), (778, 765), (62, 775)]
BUILDINGS = [
    dict(id=1, kind='tower', rects=[(110, 230, 372, 408), (275, 408, 372, 450), (372, 240, 390, 312)],
         balc=[(95, 262, 110, 398), (372, 318, 388, 408)], lobby='e'),
    dict(id=2, kind='mid', rects=[(522, 250, 748, 460), (505, 310, 522, 372)],
         balc=[(748, 292, 762, 430), (505, 380, 522, 450)], lobby='w'),
    dict(id=3, kind='mid', rects=[(522, 525, 748, 730), (505, 610, 522, 672)],
         balc=[(748, 556, 762, 694), (505, 540, 522, 602)], lobby='w'),
    dict(id=4, kind='tower', rects=[(110, 567, 368, 735), (278, 520, 368, 567)],
         balc=[(95, 598, 110, 722), (368, 600, 386, 700)], lobby='e'),
]
FLOOR_H = 3.2
G_H = 5.0
PH_H = 3.4


def levels_for(kind):
    top = 13 if kind == 'tower' else 7
    lv = [('G', 0, 0.0, G_H)]
    y = G_H
    for i in range(1, top + 1):
        lv.append(('T', i, y, FLOOR_H))
        y += FLOOR_H
    lv.append(('PH', top + 1, y, PH_H))
    y += PH_H
    return lv, y


def mask_for(rects, pad=40):
    xs = [r[0] for r in rects] + [r[2] for r in rects]
    ys = [r[1] for r in rects] + [r[3] for r in rects]
    x0, y0 = min(xs) - pad, min(ys) - pad
    W, H = max(xs) - x0 + pad, max(ys) - y0 + pad
    m = np.zeros((int(H) * 4, int(W) * 4), np.uint8)
    for r in rects:
        cv2.rectangle(m, (int((r[0] - x0) * 4), int((r[1] - y0) * 4)),
                      (int((r[2] - x0) * 4) - 1, int((r[3] - y0) * 4) - 1), 255, -1)
    return m, x0, y0


def contour_en(m, x0, y0):
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float64)
    px, py = c[:, 0] / 4 + x0, c[:, 1] / 4 + y0
    e, n = plan2en(px, py)
    P = np.stack([e, n], 1)
    # merge collinear
    keep = []
    for i in range(len(P)):
        a, b, cpt = P[i - 1], P[i], P[(i + 1) % len(P)]
        if abs(np.cross(b - a, cpt - b)) > 1e-3 * np.linalg.norm(b - a) * np.linalg.norm(cpt - b) + 1e-9:
            keep.append(b)
    P = np.array(keep)
    if signed_area(P) < 0:
        P = P[::-1]
    return P


def signed_area(P):
    x, y = P[:, 0], P[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def pts_in_poly(P, step, jit=0.35):
    """Jittered grid points inside polygon P (e,n)."""
    lo, hi = P.min(0), P.max(0)
    W = int((hi[0] - lo[0]) / step) + 2
    H = int((hi[1] - lo[1]) / step) + 2
    if W * H > 4e7:
        return np.zeros((0, 2))
    m = np.zeros((H, W), np.uint8)
    q = ((P - lo) / step).astype(np.int32)
    cv2.fillPoly(m, [q.reshape(-1, 1, 2)], 1)
    yy, xx = np.nonzero(m)
    pts = np.stack([xx, yy], 1).astype(np.float64) * step + lo
    pts += rng.uniform(-jit, jit, pts.shape) * step
    return pts


def inside(P, pts):
    path = P.astype(np.float32).reshape(-1, 1, 2)
    return np.array([cv2.pointPolygonTest(path, (float(x), float(y)), False) >= 0 for x, y in pts], bool)


STONE = np.array([214, 203, 186])
STONE_L = np.array([236, 230, 219])
GLASS = np.array([50, 64, 76])
BRONZE = np.array([118, 92, 68])
WOOD = np.array([150, 104, 68])
GREEN = np.array([72, 108, 52])


def emit_wall(P, y0, y1, step, offset, colfn, group, flagfn, delayfn, alpha=1.0, thick=0.03, extra=None):
    """Splats on the vertical faces of polygon P between heights y0..y1."""
    out = []
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        d = b - a
        L = np.linalg.norm(d)
        if L < 0.05:
            continue
        t = d / L
        nrm = np.array([t[1], -t[0]])
        nu = max(1, int(round(L / step)))
        nv = max(1, int(round((y1 - y0) / step)))
        uu, vv = np.meshgrid((np.arange(nu) + 0.5) / nu * L, (np.arange(nv) + 0.5) / nv * (y1 - y0) + y0)
        uu, vv = uu.ravel(), vv.ravel()
        m = len(uu)
        ex = a[0] + t[0] * uu + nrm[0] * offset
        nx = a[1] + t[1] * uu + nrm[1] * offset
        col, flag, keep, push = colfn(uu, vv, L, i, ex, nx, nrm)
        sel = keep
        if not sel.any():
            continue
        ex, nx, vv2 = ex[sel] + nrm[0] * push[sel], nx[sel] + nrm[1] * push[sel], vv[sel]
        k = sel.sum()
        pos = np.stack([ex, vv2, -nx], 1)
        sc = np.tile([L / nu * 0.62, (y1 - y0) / nv * 0.62, thick], (k, 1))
        q = wall_quat(t[0], -t[1], k)
        add(pos, sc, q, col[sel], alpha if np.isscalar(alpha) else alpha[sel], group,
            flagfn(vv2) if callable(flagfn) else flag[sel], delayfn(vv2))
    return out


proj_meta = []
plot_e, plot_n = plan2en([p[0] for p in PLOT_PX], [p[1] for p in PLOT_PX])
PLOT = np.stack([plot_e, plot_n], 1)
if signed_area(PLOT) < 0:
    PLOT = PLOT[::-1]

STEP = 0.42


def floor_delay(fl, nfl):
    def f(vv):
        return np.clip((fl * 16 + rng.integers(0, 16, len(vv))), 0, 255).astype(np.uint8)
    return f


for B in BUILDINGS:
    bi = B['id'] - 1
    m, x0, y0 = mask_for(B['rects'])
    P = contour_en(m, x0, y0)
    ph_px = 22  # PH setback ~2.1 m
    m_ph = cv2.erode(m, np.ones((ph_px * 4, ph_px * 4), np.uint8))
    P_ph = contour_en(m_ph, x0, y0)
    lv, top = levels_for(B['kind'])
    balc_en = []
    for r in B['balc']:
        be, bn = plan2en([r[0], r[2], r[2], r[0]], [r[1], r[1], r[3], r[3]])
        Q = np.stack([be, bn], 1)
        if signed_area(Q) < 0:
            Q = Q[::-1]
        balc_en.append(Q)
    cen = P.mean(0)
    lobby_dir = UX if B['lobby'] == 'e' else -UX
    nfl = len(lv)

    def in_balc_zone(ex, nx, nrm):
        hit = np.zeros(len(ex), bool)
        for Q in balc_en:
            pe = ex + nrm[0] * 0.8
            pn = nx + nrm[1] * 0.8
            hit |= inside(Q, np.stack([pe, pn], 1))
        return hit

    for (kind, fl, ly0, lh) in lv:
        if kind == 'PH':
            poly = P_ph
        else:
            poly = P

        def colfn(uu, vv, L, ei, ex, nx, nrm, kind=kind, fl=fl, ly0=ly0, lh=lh):
            m_ = len(uu)
            rel = vv - ly0
            col = np.zeros((m_, 3))
            flag = np.full(m_, bi, np.uint8)
            push = np.zeros(m_)
            facing_lobby = np.dot(nrm, lobby_dir) > 0.7
            balz = in_balc_zone(ex, nx, nrm) if kind == 'T' else np.zeros(m_, bool)
            if kind == 'G':
                mod = 3.4
                ph = np.mod(uu + ei * 1.3, mod)
                pier = ph < 0.9
                glass = ~pier & (rel > 0.25) & (rel < lh - 0.45)
                if facing_lobby:
                    glass = (rel > 0.2) & (rel < lh - 0.5) & (np.mod(uu, 2.2) > 0.12)
                col[:] = STONE
                col[glass] = GLASS * 0.9 + 20
                col[(rel > lh - 0.45)] = STONE_L
                flag[glass] |= 4
                if facing_lobby:
                    flag[glass] |= 8
                push[pier] = 0.08
            elif kind == 'T':
                mod = 2.9 if B['kind'] == 'tower' else 2.7
                ph = np.mod(uu + ei * 0.7, mod)
                slab = rel < 0.36
                pier = (ph < 0.78) & ~balz
                frame = (np.abs(ph - 0.78) < 0.1) | (np.abs(ph - mod) < 0.1)
                glass = ~slab & ~pier & (rel < lh - 0.15)
                sill = ~slab & ~pier & (rel < 0.95) & ~balz
                col[:] = STONE
                col[glass] = GLASS
                col[sill] = STONE * 0.82
                col[frame & ~slab] = BRONZE
                col[slab] = STONE_L
                push[slab] = 0.14
                push[pier] = 0.06
                flag[glass] |= 4
            else:  # penthouse
                ph = np.mod(uu, 2.4)
                frame = ph < 0.16
                col[:] = GLASS * 1.05 + 8
                col[frame] = BRONZE
                col[rel < 0.3] = STONE_L
                flag[~frame & (rel > 0.3)] |= 4
            col = np.clip(col + rng.normal(0, 4.5, col.shape), 0, 255)
            return col, flag, np.ones(m_, bool), push

        emit_wall(poly, ly0, ly0 + lh, STEP, 0.0, colfn, G['PROJ'], None, floor_delay(fl, nfl))

        # balconies (typical floors): slab + glass rail + plants
        if kind == 'T':
            for Q in balc_en:
                pts = pts_in_poly(Q, 0.42, 0.3)
                k = len(pts)
                if k:
                    pos = np.stack([pts[:, 0], np.full(k, ly0 + 0.12), -pts[:, 1]], 1)
                    add(pos, (0.27, 0.27, 0.04), flat_quat(k), jitter_col(STONE_L, k, 5), 1.0,
                        G['PROJ'], bi, floor_delay(fl, nfl)(pos))
                    # underside darker
                    pos2 = pos.copy(); pos2[:, 1] = ly0 + 0.0
                    add(pos2, (0.28, 0.28, 0.04), flat_quat(k), jitter_col(STONE * 0.7, k, 5), 1.0,
                        G['PROJ'], bi, floor_delay(fl, nfl)(pos2))
                # outer railing on edges not touching the wall
                cQ = Q.mean(0)
                def railcol(uu, vv, L, ei, ex, nx, nrm):
                    m_ = len(uu)
                    toward = np.dot(nrm, cen - cQ) > 0.3
                    keep = np.full(m_, not toward)
                    col = np.tile([175, 196, 204], (m_, 1)).astype(np.float64)
                    top_ = (vv - ly0) > 1.0
                    col[top_] = BRONZE
                    return col, np.full(m_, bi, np.uint8), keep, np.zeros(m_)
                alpha_fn = 0.3
                emit_wall(Q, ly0 + 0.2, ly0 + 1.12, 0.38, 0.0, railcol, G['PROJ'], None,
                          floor_delay(fl, nfl), alpha=0.32)
                # plants
                if hsh(bi, fl, int(cQ[0] * 10)) < 0.55 and len(pts):
                    sel = pts[rng.random(len(pts)) < 0.12]
                    k = len(sel)
                    if k:
                        pos = np.stack([sel[:, 0], ly0 + 0.5 + rng.random(k) * 0.6, -sel[:, 1]], 1)
                        add(pos, np.c_[rng.uniform(.25, .45, k), rng.uniform(.25, .5, k), rng.uniform(.25, .45, k)],
                            rand_quat(k), jitter_col(GREEN, k, 14), 0.95, G['PROJ'], bi, floor_delay(fl, nfl)(pos))

        # penthouse terrace on ring between P and P_ph
        if kind == 'PH':
            ring = pts_in_poly(P, 0.42, 0.3)
            ring = ring[~inside(P_ph, ring)]
            k = len(ring)
            pos = np.stack([ring[:, 0], np.full(k, ly0 + 0.05), -ring[:, 1]], 1)
            add(pos, (0.27, 0.27, 0.04), flat_quat(k), jitter_col(WOOD, k, 10), 1.0, G['PROJ'], bi,
                floor_delay(fl, nfl)(pos))
            # planters along the outer edge + glass rail
            def tcol(uu, vv, L, ei, ex, nx, nrm):
                m_ = len(uu)
                col = np.tile([175, 196, 204], (m_, 1)).astype(np.float64)
                col[(vv - ly0) > 1.05] = BRONZE
                return col, np.full(m_, bi, np.uint8), np.ones(m_, bool), np.zeros(m_)
            emit_wall(P, ly0 + 0.1, ly0 + 1.15, 0.4, 0.0, tcol, G['PROJ'], None, floor_delay(fl, nfl), alpha=0.3)
            pl = ring[rng.random(k) < 0.09]
            kk = len(pl)
            pos = np.stack([pl[:, 0], ly0 + 0.4 + rng.random(kk) * 0.9, -pl[:, 1]], 1)
            add(pos, np.c_[rng.uniform(.3, .6, kk), rng.uniform(.3, .7, kk), rng.uniform(.3, .6, kk)],
                rand_quat(kk), jitter_col(GREEN * 1.1, kk, 16), 0.95, G['PROJ'], bi, floor_delay(fl, nfl)(pos))
            # pergola beams
            for j in range(0, len(P)):
                a, b2 = P[j], P[(j + 1) % len(P)]
                L = np.linalg.norm(b2 - a)
                if L < 3:
                    continue
                t = (b2 - a) / L
                nrm = np.array([t[1], -t[0]])
                if hsh(bi, j) > 0.5:
                    continue
                us = np.arange(0.6, L - 0.3, 0.55)
                for u in us:
                    s0 = a + t * u
                    s1 = s0 - nrm * 2.0
                    ss = np.linspace(0, 1, 6)[:, None]
                    seg = s0 + (s1 - s0) * ss
                    kk = len(seg)
                    pos = np.stack([seg[:, 0], np.full(kk, ly0 + PH_H - 0.25), -seg[:, 1]], 1)
                    add(pos, (0.1, 0.22, 0.08), wall_quat(-nrm[0], nrm[1], kk), jitter_col(BRONZE * 0.8, kk, 6),
                        1.0, G['PROJ'], bi, floor_delay(fl, nfl)(pos))

    # parapet + roof
    roofP = P_ph
    def parcol(uu, vv, L, ei, ex, nx, nrm):
        m_ = len(uu)
        return jitter_col(STONE_L, m_, 4), np.full(m_, bi, np.uint8), np.ones(m_, bool), np.zeros(m_)
    emit_wall(roofP, top, top + 1.1, STEP, 0.0, parcol, G['PROJ'], None, floor_delay(nfl, nfl))
    rp = pts_in_poly(roofP, 0.42, 0.3)
    k = len(rp)
    rc = np.tile([150, 147, 142], (k, 1)).astype(np.float64)
    loc_u = (rp - cen) @ UX
    loc_v = (rp - cen) @ DN
    if B['kind'] == 'mid':
        green = (np.abs(loc_u) > 3.5) | (np.abs(loc_v) > 6.0)
        rc[green] = GREEN * 1.05
        solar = ~green & (np.mod(loc_v, 1.6) < 1.05)
    else:
        green = np.hypot(loc_u, loc_v) > 9.5
        rc[green] = GREEN
        solar = ~green & (np.mod(loc_v, 1.7) < 1.1) & (np.abs(loc_u) > 2.8)
    rc[solar] = [32, 44, 70]
    rc = np.clip(rc + rng.normal(0, 7, rc.shape), 0, 255)
    pos = np.stack([rp[:, 0], np.full(k, top + 0.1) + solar * 0.45, -rp[:, 1]], 1)
    add(pos, (0.27, 0.27, 0.05), flat_quat(k), rc, 1.0, G['PROJ'], (bi | np.where(solar, 4, 0) * 0).astype(np.uint8),
        floor_delay(nfl, nfl)(pos))
    if B['kind'] == 'mid':
        gp = rp[green & (rng.random(k) < 0.18)]
        kk = len(gp)
        pos = np.stack([gp[:, 0], top + 0.4 + rng.random(kk) * 0.8, -gp[:, 1]], 1)
        add(pos, np.c_[rng.uniform(.3, .7, kk), rng.uniform(.3, .8, kk), rng.uniform(.3, .7, kk)], rand_quat(kk),
            jitter_col([80, 120, 55], kk, 18), 0.95, G['PROJ'], bi, floor_delay(nfl, nfl)(pos))
    # lift / stair overrun box
    box = np.array([cen + UX * a + DN * b for a, b in [(-2.6, -3.2), (2.6, -3.2), (2.6, 3.2), (-2.6, 3.2)]])
    if signed_area(box) < 0:
        box = box[::-1]
    emit_wall(box, top, top + 3.0, STEP, 0, parcol, G['PROJ'], None, floor_delay(nfl, nfl))
    bp = pts_in_poly(box, 0.42, 0.3)
    add(np.stack([bp[:, 0], np.full(len(bp), top + 3.0), -bp[:, 1]], 1), (0.27, 0.27, 0.05), flat_quat(len(bp)),
        jitter_col(STONE_L, len(bp), 4), 1.0, G['PROJ'], bi, floor_delay(nfl, nfl)(bp[:, :1].repeat(3, 1)))

    proj_meta.append(dict(id=B['id'], kind=B['kind'], height=round(top, 2), floors=nfl,
                          footprint=[[round(x, 2), round(y, 2)] for x, y in P],
                          center=[round(cen[0], 2), round(cen[1], 2)],
                          levels=[dict(kind=k_, floor=f_, y0=round(a_, 2), h=b_) for k_, f_, a_, b_ in lv]))

# ---- project landscape (plot)
foot = [np.array(b['footprint']) for b in proj_meta]
gp = pts_in_poly(PLOT, 0.5, 0.35)
ins = np.zeros(len(gp), bool)
for F in foot:
    ins |= inside(F, gp)
gp = gp[~ins]
lu = gp @ UX
lv_ = gp @ DN
k = len(gp)
col = np.tile([222, 212, 196], (k, 1)).astype(np.float64)
path_mask = (np.abs(lv_) < 1.4) | (np.abs(lu + 2) < 1.4)
lawn = ~path_mask & (np.abs(lv_) < 9.5) & (np.abs(lu + 2) < 8.5)
garden_edge = ~path_mask & ((lu < -30.0) | (lu > 31.5))
col[lawn] = [92, 128, 62]
col[garden_edge] = [84, 118, 58]
col[path_mask] = [232, 224, 210]
col = np.clip(col + rng.normal(0, 7, col.shape), 0, 255)
pos = np.stack([gp[:, 0], np.full(k, 0.06), -gp[:, 1]], 1)
add(pos, (0.33, 0.33, 0.04), flat_quat(k), col, 1.0, G['PGROUND'], 0, rng.integers(0, 40, k).astype(np.uint8))
# reflecting pool at the heart of the courtyard
pool = np.array([UX * a + DN * b for a, b in [(-5, -1.3), (1, -1.3), (1, 1.3), (-5, 1.3)]]) + 0
pool = pool + UX * 0.5
if signed_area(pool) < 0:
    pool = pool[::-1]
pp = pts_in_poly(pool, 0.35, 0.2)
add(np.stack([pp[:, 0], np.full(len(pp), 0.12), -pp[:, 1]], 1), (0.25, 0.25, 0.03), flat_quat(len(pp)),
    jitter_col([40, 70, 85], len(pp), 4), 1.0, G['WATER'], 1, 0)

trees_proj = []
for a in np.linspace(-26, 26, 6):
    trees_proj.append((UX * a + DN * 26.6, 'canopy'))
    trees_proj.append((UX * a - DN * 26.0, 'canopy'))
for b in np.linspace(-20, 20, 7):
    trees_proj.append((UX * 33.2 + DN * b, 'cypress'))
for a, b in [(-7, -6), (3, -6), (-7, 6), (3, 6)]:
    trees_proj.append((UX * a + DN * b, 'olive'))


def make_tree(c, kind, n_spl, group=G['TREE'], flag=0, delay=0, scale=1.0, seed=None):
    e, nn = c
    if kind == 'cypress':
        h = 9.0 * scale
        k = max(4, n_spl)
        yy = rng.uniform(1.0, h, k)
        r = 0.9 * (1 - (yy / h) ** 1.6) + 0.15
        th = rng.uniform(0, 2 * np.pi, k)
        off = np.c_[np.cos(th) * r * 0.6, yy, np.sin(th) * r * 0.6]
        sc = np.c_[r * 0.6 + 0.15, np.full(k, 0.9 * scale), r * 0.6 + 0.15]
        base = np.array([26, 52, 30])
    elif kind == 'palm':
        h = 11 * scale
        k = max(5, n_spl)
        th = rng.uniform(0, 2 * np.pi, k)
        rr = rng.uniform(0.5, 3.0, k)
        off = np.c_[np.cos(th) * rr, h - rr * 0.35 + rng.normal(0, .3, k), np.sin(th) * rr]
        sc = np.c_[np.full(k, 1.3), np.full(k, 0.18), np.full(k, 0.35)]
        base = np.array([70, 96, 48])
    else:
        rad = (3.2 if kind == 'canopy' else 2.2) * scale * rng.uniform(0.8, 1.25)
        h = (6.5 if kind == 'canopy' else 4.2) * scale * rng.uniform(0.85, 1.2)
        k = max(3, n_spl)
        d = rng.normal(size=(k, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        d[:, 1] = np.abs(d[:, 1]) * 0.75 + 0.05
        rr = rng.uniform(0.35, 1.0, k) ** 0.5 * rad
        off = d * rr[:, None] + [0, h - rad * 0.4, 0]
        s = rad * (0.62 if k < 8 else 0.42) * rng.uniform(0.7, 1.2, k)
        sc = np.c_[s, s * 0.8, s]
        base = np.array([62, 92, 44]) if kind == 'canopy' else np.array([108, 122, 82])
    pos = off + [e, 0, -nn]
    # radial normals for volumetric shading
    cc = np.array([e, (h * 0.75), -nn])
    nr = pos - cc
    nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-6
    tt = np.cross(nr, np.tile([0, 1, 0.001], (k, 1)))
    tt /= np.linalg.norm(tt, axis=1, keepdims=True) + 1e-6
    bb = np.cross(nr, tt)
    q = mat2quat(tt, bb, nr)
    shade = rng.uniform(0.75, 1.2, (k, 1))
    col = np.clip(base * shade + rng.normal(0, 8, (k, 3)), 0, 255)
    add(pos, sc, q, col, 0.92, group, flag, delay)
    # trunk
    if kind != 'cypress':
        tpos = np.array([[e, 1.2 * scale, -nn], [e, 2.6 * scale, -nn]] if kind != 'palm' else
                        [[e, y, -nn] for y in np.linspace(1, h - 1, 5)])
        add(tpos, (0.18, 0.9 * scale, 0.18), np.tile([1, 0, 0, 0], (len(tpos), 1)), [74, 58, 44], 1.0, group, flag, delay)


for c, kind in trees_proj:
    make_tree(c, kind, 34 if kind != 'cypress' else 22, G['PGROUND'], 0, int(rng.integers(30, 60)))

# bollard lights along courtyard paths (night)
lamps = []
for a in np.arange(-28, 30, 5.0):
    lamps.append(UX * a + DN * 1.9)
    lamps.append(UX * a - DN * 1.9)
for b in np.arange(-22, 24, 5.0):
    lamps.append(UX * -2 + UX * 1.9 + DN * b)
lamps = np.array(lamps)
add(np.stack([lamps[:, 0], np.full(len(lamps), 0.8), -lamps[:, 1]], 1), (0.12, 0.12, 0.12),
    np.tile([1, 0, 0, 0], (len(lamps), 1)), [255, 200, 140], 1.0, G['LIGHT'], 1, 0)
add(np.stack([lamps[:, 0], np.full(len(lamps), 0.08), -lamps[:, 1]], 1), (1.6, 1.6, 0.04),
    flat_quat(len(lamps)), [255, 190, 120], 0.35, G['LIGHT'], 2, 0)

NPROJ = sum(len(p['pos']) for p in parts)
print('project splats', NPROJ)

# ---- typical-floor plans from the sales key plans -> splats shown inside an opened floor
PLAN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plans')
for B in BUILDINGS:
    bi = B['id'] - 1
    fn, off = (('keyplan_typical_towers.png', (0, 0)) if B['kind'] == 'tower' else ('keyplan_typical_mid.png', (80, -42)))
    im = cv2.imread(os.path.join(PLAN_DIR, fn), cv2.IMREAD_GRAYSCALE)
    if im is None:
        continue
    m, x0, y0 = mask_for(B['rects'] + B['balc'], pad=40)
    ys, xs = np.mgrid[0:im.shape[0]:2, 0:im.shape[1]:2]
    xs, ys = xs.ravel(), ys.ravel()
    hx = (xs + off[0]) / 2.0
    hy = (ys + off[1]) / 2.0
    mx = ((hx - x0) * 4).astype(int)
    my = ((hy - y0) * 4).astype(int)
    ok = (mx >= 0) & (my >= 0) & (mx < m.shape[1]) & (my < m.shape[0])
    ok[ok] = m[my[ok], mx[ok]] > 0
    v = im[ys, xs]
    wall = ok & (v < 105)
    fill = ok & (v >= 105) & (rng.random(len(v)) < 0.22)
    for sel_, col_, sc_, y_ in ((fill, [226, 214, 196], 0.17, 0.04), (wall, [58, 44, 34], 0.075, 0.09)):
        e_, n_ = plan2en(hx[sel_], hy[sel_])
        k_ = len(e_)
        c_ = jitter_col(col_, k_, 3)
        if col_[0] > 200:
            balc = np.zeros(k_, bool)
            for r in B['balc']:
                balc |= (hx[sel_] >= r[0]) & (hx[sel_] <= r[2]) & (hy[sel_] >= r[1]) & (hy[sel_] <= r[3])
            c_[balc] = jitter_col(WOOD, balc.sum(), 6)
        add(np.stack([e_, np.full(k_, y_), -n_], 1), (sc_, sc_, 0.02), flat_quat(k_), c_, 1.0, G['PLAN'], bi, 0)
print('plan splats', sum(len(p['pos']) for p in parts) - NPROJ)

# ---------------------------------------------------------------- city buildings
PAL = np.array([[232, 226, 214], [224, 214, 196], [210, 201, 186], [196, 192, 186], [218, 204, 180],
                [204, 182, 160], [180, 188, 192], [226, 220, 206], [214, 206, 196]], np.float64)
WIN = np.array([70, 80, 92])
ROOF = np.array([172, 168, 160])


def bld_height(t, area_m2, hshv):
    h = pfloat(t.get('height'))
    lv = pfloat(t.get('building:levels'))
    mh = pfloat(t.get('min_height'))
    ml = pfloat(t.get('building:min_level'))
    base = mh if mh is not None else (ml * 3.1 if ml is not None else 0.0)
    if h is not None and h > 2.5 and not (lv and lv > 10 and h < lv * 1.5):
        top = h
    elif lv is not None:
        top = lv * 3.1 + 1.0
    else:
        b = t.get('building', 'yes')
        if b in ('garage', 'shed', 'roof', 'kiosk', 'hut', 'service', 'transformer_tower'):
            top = 3.0
        elif area_m2 < 50:
            top = 3.2
        elif area_m2 < 150:
            top = 7.0 + hshv * 3
        else:
            top = 13.5 + (hshv - 0.5) * 6.0
    return base, max(top, base + 2.5)


def spacing_at(d, h):
    s = np.clip(0.95 + d * 0.0052, 0.95, 10.0)
    if h > 50:
        s = min(s, 2.2 + d * 0.0012)
    return float(s)


EDGE_FADE = lambda e, n: np.clip(np.minimum.reduce([(e + 2460) / 300, (1500 - e) / 300, (n + 1280) / 300, (1930 - n) / 300]), 0, 1)


def city_building(Pp, t, far=False):
    if len(Pp) < 4:
        return
    Pp = Pp[:-1] if np.allclose(Pp[0], Pp[-1]) else Pp
    if len(Pp) < 3:
        return
    sa = signed_area(Pp)
    if abs(sa) < 6:
        return
    if sa < 0:
        Pp = Pp[::-1]
    c = Pp.mean(0)
    # remove old blocks on the project plot
    if cv2.pointPolygonTest(PLOT.astype(np.float32).reshape(-1, 1, 2), (float(c[0]), float(c[1])), True) > -2.5:
        return
    hv = hsh(int(abs(c[0]) * 7), int(abs(c[1]) * 7))
    base, top = bld_height(t, abs(sa), hv)
    d = float(dist2d(*c))
    s = spacing_at(d, top) * (1.6 if far else 1.0)
    if far:
        s = max(s, 6.0 + d * 0.001)
    glassy = top > 55 or t.get('building') in ('office', 'commercial') and top > 30
    alb = PAL[int(hv * len(PAL)) % len(PAL)].copy()
    if glassy:
        alb = np.array([120, 138, 150]) if hv < 0.6 else np.array([150, 160, 165])
    fade = float(EDGE_FADE(*c))
    if fade <= 0.01:
        return
    dly = int(np.clip(d / 2600 * 255, 0, 255))
    flH = 3.1

    def colfn(uu, vv, L, ei, ex, nx, nrm):
        m_ = len(uu)
        col = np.tile(alb, (m_, 1)).astype(np.float64)
        flag = np.zeros(m_, np.uint8)
        if s < 1.7:
            fr = np.mod(vv - base, flH) / flH
            cell = np.mod(uu, 3.0) / 3.0
            win = (fr > 0.32) & (fr < 0.82) & (cell > 0.18) & (cell < 0.78) & (vv > base + 2.5)
        else:
            win = rng.random(m_) < (0.55 if glassy else 0.32)
            win &= vv > base + 2.5
        col[win] = (WIN if not glassy else alb * 0.55) if s < 1.7 else (col[win] * 0.55 + (WIN if not glassy else alb * 0.55) * 0.45)
        flag[win] = 1
        if glassy:
            flag |= 2
        ao = 0.72 + 0.28 * np.clip((vv - base) / 14, 0, 1)
        col = col * ao[:, None]
        col = np.clip(col + rng.normal(0, 6, col.shape), 0, 255)
        return col, flag, np.ones(m_, bool), np.zeros(m_)

    emit_wall(Pp, base, top, s, 0, colfn, G['CITY'], None, lambda vv: np.full(len(vv), dly, np.uint8),
              alpha=fade, thick=0.06)
    rp = pts_in_poly(Pp, s, 0.3)
    k = len(rp)
    if k == 0:
        rp = c[None, :]
        k = 1
    rc = np.tile(ROOF if not glassy else alb * 0.8, (k, 1)).astype(np.float64)
    if not glassy and top < 40:
        sol = rng.random(k) < 0.08
        rc[sol] = [232, 234, 236]
        dark = rng.random(k) < 0.08
        rc[dark] = [90, 92, 96]
    rc = np.clip(rc + rng.normal(0, 8, rc.shape), 0, 255)
    add(np.stack([rp[:, 0], np.full(k, top), -rp[:, 1]], 1), (s * 0.62, s * 0.62, 0.06), flat_quat(k), rc, fade,
        G['CITY'], 4, dly)


nb = 0
for e in area:
    t = e.get('tags', {})
    if 'building' in t or 'building:part' in t:
        if t.get('building') == 'construction' and 'building:levels' not in t:
            pass
        P_ = geom_en(e)
        if len(P_):
            city_building(P_, t)
            nb += 1
print('city buildings', nb, 'splats so far', sum(len(p['pos']) for p in parts))
ns = 0
for e in sky:
    t = e.get('tags', {})
    P_ = geom_en(e)
    if len(P_) < 3:
        continue
    c = P_.mean(0)
    if -2460 < c[0] < 1500 and -1280 < c[1] < 1930:
        continue
    lv = pfloat(t.get('building:levels')) or 0
    h = pfloat(t.get('height')) or 0
    if max(lv * 3.1, h) < 24:
        continue
    d = dist2d(*c)
    if d > 7500:
        continue
    Pp = P_[:-1] if np.allclose(P_[0], P_[-1]) else P_
    sa = signed_area(Pp)
    if abs(sa) < 30:
        continue
    if sa < 0:
        Pp = Pp[::-1]
    base, top = bld_height(t, abs(sa), 0.5)
    s = max(5.0, d * 0.0028)
    glassy = top > 55
    alb = np.array([150, 158, 168]) if glassy else np.array([206, 198, 186])
    dly = int(np.clip(d / 7500 * 255, 0, 255))

    def colfn(uu, vv, L, ei, ex, nx, nrm, glassy=glassy, alb=alb):
        m_ = len(uu)
        col = np.tile(alb, (m_, 1)).astype(np.float64)
        win = rng.random(m_) < 0.45
        col[win] *= 0.6
        flag = np.where(win, 1, 0).astype(np.uint8) | (2 if glassy else 0)
        return np.clip(col + rng.normal(0, 6, col.shape), 0, 255), flag, np.ones(m_, bool), np.zeros(m_)
    emit_wall(Pp, base, top, s, 0, colfn, G['CITY'], None, lambda vv, dly=dly: np.full(len(vv), dly, np.uint8),
              alpha=0.9, thick=0.1)
    rp = pts_in_poly(Pp, s, 0.3)
    if len(rp):
        add(np.stack([rp[:, 0], np.full(len(rp), top), -rp[:, 1]], 1), (s * .62, s * .62, .1), flat_quat(len(rp)),
            jitter_col(alb * 0.85, len(rp), 6), 0.9, G['CITY'], 4, dly)
    ns += 1
print('skyline buildings', ns, 'splats so far', sum(len(p['pos']) for p in parts))

# ---------------------------------------------------------------- roads, lights, cars
RW = dict(motorway=26, trunk=18, primary=15, secondary=13, tertiary=10, residential=7.0,
          motorway_link=8, trunk_link=8, primary_link=7)
MAJOR = ('motorway', 'trunk', 'primary', 'secondary')
road_len = 0
car_rows = []
lamp_pts = []
street_tree_pts = []


def polyline_samples(Pl, step):
    seg = np.diff(Pl, axis=0)
    L = np.linalg.norm(seg, axis=1)
    out_p, out_t, out_l = [], [], []
    for i in range(len(seg)):
        if L[i] < 0.1:
            continue
        nst = max(1, int(L[i] / step))
        u = (np.arange(nst) + rng.uniform(0.2, 0.8, nst)) / nst
        out_p.append(Pl[i] + seg[i] * u[:, None])
        out_t.append(np.tile(seg[i] / L[i], (nst, 1)))
    if not out_p:
        return np.zeros((0, 2)), np.zeros((0, 2))
    return np.concatenate(out_p), np.concatenate(out_t)


for e in area:
    t = e.get('tags', {})
    hw = t.get('highway')
    if hw not in RW:
        continue
    Pl = geom_en(e)
    if len(Pl) < 2:
        continue
    W = RW[hw]
    mid = Pl.mean(0)
    dmid = float(dist2d(*mid))
    step = float(np.clip(1.2 + dmid * 0.004, 1.2, 9.0))
    pts, tan = polyline_samples(Pl, step)
    if len(pts) == 0:
        continue
    k = len(pts)
    fade = EDGE_FADE(pts[:, 0], pts[:, 1])
    nacross = 1 if W < 11 else (2 if W < 20 else 3)
    for j in range(nacross):
        off = ((j + 0.5) / nacross - 0.5) * W
        nrm = np.c_[tan[:, 1], -tan[:, 0]]
        pp = pts + nrm * off
        ang = np.arctan2(-tan[:, 1], tan[:, 0])
        col = np.tile([64, 62, 63] if hw != 'motorway' else [92, 92, 94], (k, 1)).astype(np.float64)
        col = np.clip(col + rng.normal(0, 4, col.shape), 0, 255)
        add(np.stack([pp[:, 0], np.full(k, 0.1), -pp[:, 1]], 1),
            np.c_[np.full(k, step * 0.75), np.full(k, W / nacross * 0.5), np.full(k, 0.04)],
            flat_quat(k, ang), col, fade, G['ROAD'], 1 if hw in MAJOR else 0, 0)
    road_len += sum(np.linalg.norm(np.diff(Pl, axis=0), axis=1))
    if hw in MAJOR or hw == 'tertiary':
        lp, lt = polyline_samples(Pl, 34.0 if hw in MAJOR else 48.0)
        for sgn in (1, -1):
            nrm = np.c_[lt[:, 1], -lt[:, 0]] * sgn
            lamp_pts.append(lp + nrm * (W / 2 + 1.0))
    if hw in ('residential', 'tertiary', 'secondary') and dmid < 2600:
        sp, stn = polyline_samples(Pl, 15.0)
        if len(sp):
            sgn = np.where(rng.random(len(sp)) < 0.5, 1, -1)[:, None]
            nrm = np.c_[stn[:, 1], -stn[:, 0]] * sgn
            keep = rng.random(len(sp)) < 0.62
            street_tree_pts.append((sp + nrm * (W / 2 + 2.2))[keep])
    if hw in MAJOR or hw.endswith('_link'):
        oneway = t.get('oneway') in ('yes', '1', 'true') or hw == 'motorway'
        spacing = 30.0 if hw in ('motorway', 'trunk') else 52.0
        speed = 4 if hw in ('motorway', 'trunk') else 2
        dirs = [1] if oneway else [1, -1]
        for dsg in dirs:
            Pd = Pl if dsg == 1 else Pl[::-1]
            for i in range(len(Pd) - 1):
                a, b = Pd[i], Pd[i + 1]
                L = float(np.linalg.norm(b - a))
                if L < 6:
                    continue
                nsub = int(np.ceil(L / 220.0))
                for sub in range(nsub):
                    a2 = a + (b - a) * (sub / nsub)
                    L2 = L / nsub
                    tt = (b - a) / L
                    nrm = np.array([tt[1], -tt[0]])
                    lane_off = (W * 0.28) if not oneway else rng.uniform(-W * 0.3, W * 0.3)
                    ncar = max(1, int(L2 / spacing * rng.uniform(0.6, 1.4)))
                    for _ in range(ncar):
                        car_rows.append((a2[0] + nrm[0] * lane_off, a2[1] + nrm[1] * lane_off, tt[0], tt[1], L2,
                                         speed, rng.random()))

lamp_pts = np.concatenate(lamp_pts) if lamp_pts else np.zeros((0, 2))
lamp_pts = lamp_pts[EDGE_FADE(lamp_pts[:, 0], lamp_pts[:, 1]) > 0.2]
k = len(lamp_pts)
add(np.stack([lamp_pts[:, 0], np.full(k, 7.5), -lamp_pts[:, 1]], 1), (0.35, 0.35, 0.35),
    np.tile([1, 0, 0, 0], (k, 1)), [255, 196, 120], 1.0, G['LIGHT'], 1, 0)
add(np.stack([lamp_pts[:, 0], np.full(k, 0.15), -lamp_pts[:, 1]], 1), (7.0, 7.0, 0.05), flat_quat(k),
    [255, 170, 90], 0.22, G['LIGHT'], 2, 0)
print('road km', round(road_len / 1000, 1), 'lamps', k, 'cars', len(car_rows))

# cars: head splat + 3 trail splats (trail visible mostly at night)
CARCOL = np.array([[214, 214, 212], [46, 46, 50], [140, 142, 146], [96, 100, 108], [60, 66, 80], [190, 190, 186]])
cr = np.array(car_rows) if car_rows else np.zeros((0, 7))
for j, (back, alpha, sc) in enumerate([(0.0, 1.0, (1.9, 0.75, 0.85)), (3.0, 0.55, (2.6, 0.5, 0.5)),
                                      (6.5, 0.32, (3.2, 0.4, 0.4)), (10.5, 0.18, (3.8, 0.35, 0.35))]):
    k = len(cr)
    tx, tn = cr[:, 2], cr[:, 3]
    pos = np.stack([cr[:, 0] - tx * back, np.full(k, 0.9), -(cr[:, 1] - tn * back)], 1)
    tvec = np.stack([tx, np.zeros(k), -tn], 1)
    up = np.tile([0, 1.0, 0], (k, 1))
    q = mat2quat(tvec, up, np.cross(tvec, up))
    col = CARCOL[rng.integers(0, len(CARCOL), k)].astype(np.float64)
    lenb = np.clip(cr[:, 4], 6, 255).astype(np.uint8)
    phase = (cr[:, 6] * 255).astype(np.uint8)
    flag = (cr[:, 5].astype(np.uint8) & 7) | (8 if j > 0 else 0)
    # pack phase into rgb.b for trails? keep phase in colour alpha-less channel: use separate encoding below
    add(pos, sc, q, col, alpha, G['CAR'], flag, lenb)
    parts[-1]['phase'] = phase

# ---------------------------------------------------------------- rail
for e in area:
    t = e.get('tags', {})
    if t.get('railway') not in ('rail', 'light_rail', 'subway'):
        continue
    if t.get('tunnel') in ('yes',) or t.get('layer', '0').startswith('-'):
        continue
    Pl = geom_en(e)
    if len(Pl) < 2:
        continue
    pts, tan = polyline_samples(Pl, 2.5)
    k = len(pts)
    if not k:
        continue
    ang = np.arctan2(-tan[:, 1], tan[:, 0])
    fade = EDGE_FADE(pts[:, 0], pts[:, 1])
    add(np.stack([pts[:, 0], np.full(k, 0.25), -pts[:, 1]], 1), np.c_[np.full(k, 2.0), np.full(k, 2.4), np.full(k, .05)],
        flat_quat(k, ang), jitter_col([112, 102, 92], k, 6), fade, G['RAIL'], 0, 0)
    for off in (-0.75, 0.75):
        nrm = np.c_[tan[:, 1], -tan[:, 0]]
        pp = pts + nrm * off
        add(np.stack([pp[:, 0], np.full(k, 0.45), -pp[:, 1]], 1), np.c_[np.full(k, 1.6), np.full(k, 0.08), np.full(k, .05)],
            flat_quat(k, ang), [150, 150, 156], fade, G['RAIL'], 1, 0)

# ---------------------------------------------------------------- parks, water, trees
park_polys = []
tree_pts = []
for e in area:
    t = e.get('tags', {})
    kind = None
    if t.get('leisure') in ('park', 'garden'):
        kind = 'park'
    elif t.get('leisure') == 'pitch':
        kind = 'pitch'
    elif t.get('landuse') in ('grass', 'recreation_ground', 'forest') or t.get('natural') in ('wood', 'scrub'):
        kind = 'park' if t.get('landuse') != 'forest' and t.get('natural') != 'wood' else 'wood'
    elif t.get('natural') == 'water':
        kind = 'water'
    if not kind:
        continue
    P_ = geom_en(e)
    if len(P_) < 4:
        continue
    if signed_area(P_) < 0:
        P_ = P_[::-1]
    c = P_.mean(0)
    d = float(dist2d(*c))
    step = float(np.clip(1.6 + d * 0.004, 1.6, 9.0))
    pts = pts_in_poly(P_, step, 0.4)
    if not len(pts):
        continue
    k = len(pts)
    fade = EDGE_FADE(pts[:, 0], pts[:, 1])
    if kind == 'water':
        add(np.stack([pts[:, 0], np.full(k, 0.12), -pts[:, 1]], 1), (step * .7, step * .7, .03), flat_quat(k),
            jitter_col([38, 66, 80], k, 4), fade, G['WATER'], 1, 0)
        continue
    base = {'park': [96, 130, 62], 'pitch': [86, 136, 70], 'wood': [70, 98, 52]}[kind]
    col = jitter_col(base, k, 11)
    # sun-dried patches
    dry = rng.random(k) < 0.12
    col[dry] = jitter_col([150, 146, 100], dry.sum(), 10)
    add(np.stack([pts[:, 0], np.full(k, 0.13), -pts[:, 1]], 1), (step * .7, step * .7, .04), flat_quat(k), col, fade,
        G['GRASS'], 0, int(np.clip(d / 2600 * 255, 0, 255)))
    if kind in ('park', 'wood') and abs(signed_area(P_)) > 300:
        dens = 1 / 140.0 if kind == 'park' else 1 / 70.0
        ntree = int(abs(signed_area(P_)) * dens)
        tp = pts_in_poly(P_, math.sqrt(1 / dens), 0.45)
        tree_pts.append(tp)
    if t.get('name'):
        park_polys.append(dict(name=t['name'], c=c.tolist(), area=abs(signed_area(P_))))

for e in area:
    if e.get('tags', {}).get('natural') == 'tree' and 'lat' in e:
        tree_pts.append(np.array([en(e['lat'], e['lon'])]))
tree_pts += street_tree_pts
allt = np.concatenate([t for t in tree_pts if len(t)]) if tree_pts else np.zeros((0, 2))
# drop trees inside project plot and inside buildings (rough: plot only)
pl32 = PLOT.astype(np.float32).reshape(-1, 1, 2)
allt = np.array([p for p in allt if cv2.pointPolygonTest(pl32, (float(p[0]), float(p[1])), True) < -1.0])
nt = 0
for p in allt:
    d = float(dist2d(*p))
    fade = float(EDGE_FADE(*p))
    if fade < 0.05:
        continue
    nspl = 18 if d < 300 else (9 if d < 800 else (5 if d < 1500 else 3))
    kind = 'palm' if hsh(int(p[0] * 3), int(p[1] * 3)) < 0.06 else 'canopy'
    make_tree(p, kind, nspl, G['TREE'], 0, int(np.clip(d / 2600 * 255, 0, 255)),
              scale=rng.uniform(0.8, 1.25))
    nt += 1
print('trees', nt)

# ---------------------------------------------------------------- ground + far ground + sea
gpts = []
for lvl, (s, r0, r1) in enumerate([(2.3, 0, 260), (5.0, 260, 700), (10.0, 700, 1500), (18.0, 1500, 4000)]):
    xs = np.arange(-2470, 1510, s)
    ns_ = np.arange(-1290, 1940, s)
    X, N = np.meshgrid(xs, ns_)
    X = X.ravel() + rng.uniform(-.4, .4, X.size) * s
    N = N.ravel() + rng.uniform(-.4, .4, N.size) * s
    d = np.hypot(X, N)
    m_ = (d >= r0) & (d < r1)
    gpts.append((X[m_], N[m_], s))
for X, N, s in gpts:
    k = len(X)
    fade = EDGE_FADE(X, N)
    col = np.tile([112, 104, 95], (k, 1)).astype(np.float64)
    yard = rng.random(k) < 0.38
    col[yard] = [92, 100, 70]
    col = np.clip(col + rng.normal(0, 7, col.shape), 0, 255)
    add(np.stack([X, np.zeros(k), -N], 1), (s * .72, s * .72, .05), flat_quat(k), col, fade, G['GROUND'], 0,
        np.clip(np.hypot(X, N) / 2600 * 255, 0, 255).astype(np.uint8))

# far ground beyond the detailed area (soft, hazy, painterly)
s = 48.0
xs = np.arange(-7600, 6000, s)
ns_ = np.arange(-6500, 8000, s)
X, N = np.meshgrid(xs, ns_)
X = X.ravel() + rng.uniform(-.45, .45, X.size) * s
N = N.ravel() + rng.uniform(-.45, .45, N.size) * s
coast = -3617 + 0.255 * (N + ON) - OE
inner = (X > -2470) & (X < 1510) & (N > -1290) & (N < 1940)
edge_in = EDGE_FADE(X, N)
land = (X > coast) & (np.hypot(X, N) < 8200) & (edge_in < 0.99)
k = land.sum()
col = np.tile([118, 110, 100], (k, 1)).astype(np.float64)
col = np.clip(col + rng.normal(0, 9, col.shape), 0, 255)
add(np.stack([X[land], np.full(k, -0.3), -N[land]], 1), (s * .75, s * .75, .2), flat_quat(k), col,
    1.0 - edge_in[land] * 0.0, G['GROUND'], 1, 255)
# beach strip
bn = np.arange(-6500, 8000, 14.0)
be = -3617 + 0.255 * (bn + ON) - OE + rng.uniform(-20, 25, len(bn))
add(np.stack([be, np.full(len(bn), -0.2), -bn], 1), (30, 30, .2), flat_quat(len(bn)), jitter_col([226, 206, 170], len(bn), 6),
    1.0, G['GROUND'], 1, 255)
sea = (X < coast - 30) & (X > -9000) & (np.abs(N) < 8000)
sx = X[sea]
sn = N[sea]
k = len(sx)
add(np.stack([sx, np.full(k, -0.4), -sn], 1), (s * .85, s * .85, .1), flat_quat(k), jitter_col([40, 82, 108], k, 4), 1.0,
    G['WATER'], 2, 0)
print('ground done', sum(len(p['pos']) for p in parts))

# ---------------------------------------------------------------- walking rings + dust
for ri, R in enumerate([500.0, 1000.0, 1500.0, 2000.0]):
    nseg = int(2 * np.pi * R / 3.2)
    th = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    pos = np.stack([np.cos(th) * R, np.full(nseg, 1.2), -np.sin(th) * R], 1)
    tvec = np.stack([-np.sin(th), np.zeros(nseg), -np.cos(th)], 1)
    up = np.tile([0, 1.0, 0], (nseg, 1))
    q = mat2quat(tvec, np.cross(up, tvec), up)
    pos[:, 1] = 2.0
    add(pos, (2.6, 2.4 + R * 0.0012, 0.05), q, [255, 196, 140], 0.9, G['RING'], ri, (th / (2 * np.pi) * 255).astype(np.uint8))
k = 7000
r = rng.uniform(0, 1, k) ** 0.6 * 190
th = rng.uniform(0, 2 * np.pi, k)
pos = np.stack([np.cos(th) * r, rng.uniform(2, 140, k) ** 1.0, np.sin(th) * r], 1)
add(pos, np.c_[np.full(k, 0.18), np.full(k, 0.18), np.full(k, 0.18)] * rng.uniform(0.6, 1.6, (k, 1)),
    np.tile([1, 0, 0, 0], (k, 1)), jitter_col([255, 214, 160], k, 12), 0.85, G['DUST'], 0,
    rng.integers(0, 255, k).astype(np.uint8))

# ---------------------------------------------------------------- pack
N_ = sum(len(p['pos']) for p in parts)
print('TOTAL splats', N_)
pos = np.concatenate([p['pos'] for p in parts]).astype(np.float32)
scale = np.concatenate([p['scale'] for p in parts])
quat = np.concatenate([p['quat'] for p in parts])
rgb = np.concatenate([p['rgb'] for p in parts])
alpha = np.concatenate([p['a'] for p in parts])
grp = np.concatenate([p['g'] for p in parts])
flg = np.concatenate([p['f'] for p in parts])
dly = np.concatenate([p['d'] for p in parts])
aux = np.concatenate([p.get('phase', np.zeros(len(p['pos']), np.uint8)) for p in parts])

# log-encoded scales
ls = np.clip((np.log(np.maximum(scale, 1e-4)) + 7.0) / 12.0 * 255, 0, 255).astype(np.uint8)
qn = quat / np.linalg.norm(quat, axis=1, keepdims=True)
qq = np.clip(qn * 127.5 + 127.5, 0, 255).astype(np.uint8)
col = np.concatenate([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)[:, None] * 255], 1).astype(np.uint8)
meta = np.stack([grp, flg, dly, aux], 1).astype(np.uint8)

# logo for project splats
lg = cv2.imread(LOGO, cv2.IMREAD_UNCHANGED)
a = lg[:, :, 3].astype(np.float32)
bgr = lg[:, :, :3].astype(np.float32)
lum = bgr.mean(2)
ys, xs = np.nonzero((a > 200) & (lum > 120))
cols = bgr[ys, xs][:, ::-1]
cx, cy = xs.mean(), ys.mean()
wdt = xs.max() - xs.min()
pick = rng.integers(0, len(xs), NPROJ)
lx = ((xs[pick] - cx) / wdt * 2 * 16000 + rng.uniform(-0.5, 0.5, NPROJ) / wdt * 32000).astype(np.int16)
ly = (-(ys[pick] - cy) / wdt * 2 * 16000).astype(np.int16)
lcol = np.concatenate([cols[pick], np.full((NPROJ, 1), 255)], 1).astype(np.uint8)

os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, 'scene.bin'), 'wb') as fh:
    for arr in (pos, ls, qq, col, meta, np.stack([lx, ly], 1).astype(np.int16), lcol):
        fh.write(np.ascontiguousarray(arr).tobytes())

# ---------------------------------------------------------------- landmarks & metadata
def L(name, lat, lon, h, sub=''):
    e_, n_ = en(lat, lon)
    return dict(name=name, sub=sub, pos=[round(e_, 1), h, round(-n_, 1)], dist=round(float(np.hypot(e_, n_))))


stations = {}
for e in area:
    t = e.get('tags', {})
    if t.get('railway') == 'station' and 'lat' in e:
        stations[t.get('name', '')] = (e['lat'], e['lon'])
lm = []
if 'תל אביב השלום' in stations:
    lm.append(L('תחנת רכבת השלום', *stations['תל אביב השלום'], 22, 'רכבת ישראל'))
lm += [L('קניון עזריאלי', 32.07440, 34.79195, 195, 'מרכז עזריאלי'),
       L('מגדל אלקטרה', 32.07023, 34.79404, 172),
       L('מתחם שרונה', 32.07069, 34.78491, 34, 'שרונה מרקט · בילוי וקולינריה'),
       L('רחוב הארבעה', 32.07010, 34.78640, 168),
       L('קניון גבעתיים', 32.06646, 34.81060, 40),
       L('מגדלי אלון', 32.06876, 34.79363, 158),
       L('מרכז רפואי אסותא', 32.08040, 34.79560, 60) if False else None]
lm = [x for x in lm if x]
for pp_ in park_polys:
    if pp_['name'] in ('פארק אדית וולפסון', 'גן חיל האויר'):
        c = pp_['c']
        lm.append(dict(name='פארק וולפסון' if 'וולפסון' in pp_['name'] else 'גן חיל האוויר',
                       sub='כמאה דונם של ירוק ואגם' if 'וולפסון' in pp_['name'] else 'חורשת אורנים וברושים',
                       pos=[round(c[0], 1), 18, round(-c[1], 1)], dist=round(float(np.hypot(*c)))))
# Ayalon / Derech HaShalom anchor points
best = None
for e in area:
    t = e.get('tags', {})
    if t.get('highway') == 'motorway':
        for p in geom_en(e):
            d = np.hypot(*p)
            if best is None or d < best[0]:
                best = (d, p)
if best:
    lm.append(dict(name='נתיבי איילון', sub='', pos=[round(best[1][0], 1), 12, round(-best[1][1], 1)], dist=round(float(best[0]))))
lm.append(dict(name='דרך השלום', sub='', pos=[-44.0, 6, 60.0], dist=0, street=True))
lm.append(dict(name='עמישב', sub='', pos=[30.0, 6, -50.0], dist=0, street=True))

counts = {}
for gname, gi in G.items():
    counts[gname] = int((grp == gi).sum())
meta_json = dict(
    count=int(N_), nproj=int(NPROJ), groups=G, counts=counts,
    layout=['pos f32x3', 'scale u8x3 log', 'quat u8x4', 'rgba u8x4', 'meta u8x4 (group,flag,delay,aux)',
            'logo i16x2 (nproj)', 'logo rgba u8x4 (nproj)'],
    scale_enc=dict(off=7.0, range=12.0),
    plot=[[round(x, 2), round(-y, 2)] for x, y in PLOT],
    buildings=proj_meta, landmarks=lm, ux=UX.tolist(), dn=DN.tolist(),
    origin=dict(lat=LAT0 + ON / KY, lon=LON0 + OE / KX),
)
json.dump(meta_json, open(os.path.join(OUT_DIR, 'scene.json'), 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- standard 3DGS .ply (golden-hour bake)
keep = ~np.isin(grp, [G['CAR'], G['LIGHT'], G['RING'], G['DUST'], G['PLAN']]) & (np.hypot(pos[:, 0], pos[:, 2]) < 1100)
qk = qn[keep]
w_, x_, y_, z_ = qk[:, 0], qk[:, 1], qk[:, 2], qk[:, 3]
nrm = np.stack([2 * (x_ * z_ + w_ * y_), 2 * (y_ * z_ - w_ * x_), 1 - 2 * (x_ * x_ + y_ * y_)], 1)
az, el = math.radians(234), math.radians(14)
sun = np.array([math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el)])
alb = (rgb[keep] / 255.0) ** 2
ndl = np.clip(nrm @ sun, 0, 1)[:, None]
lin = alb * (np.array([0.16, 0.18, 0.3]) * (0.6 + 0.4 * np.clip(nrm[:, 1:2], 0, 1)) + np.array([3.0, 1.5, 0.66]) * ndl) * 0.9
srgb = np.clip((lin * (2.51 * lin + 0.03)) / (lin * (2.43 * lin + 0.59) + 0.14), 0, 1) ** (1 / 2.2)
f_dc = (srgb - 0.5) / 0.28209479
op = np.clip(alpha[keep], 0.01, 0.995)
op = np.log(op / (1 - op))
lsc = np.log(np.maximum(scale[keep], 1e-4))
P_ = pos[keep]
ply_pos = np.stack([P_[:, 0], -P_[:, 1], P_[:, 2]], 1)  # y-down for common 3DGS viewers
ply_rot = np.stack([w_, -x_, y_, -z_], 1)
fl = np.concatenate([ply_pos, np.zeros_like(ply_pos), f_dc, op[:, None], lsc, ply_rot], 1).astype(np.float32)
names = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
hdr = 'ply\nformat binary_little_endian 1.0\nelement vertex %d\n' % len(fl) + ''.join('property float %s\n' % n for n in names) + 'end_header\n'
with open(os.path.join(OUT_DIR, 'HELLO-TLV_gaussian-splats.ply'), 'wb') as fh:
    fh.write(hdr.encode('ascii'))
    fh.write(fl.tobytes())
print('ply splats', len(fl))
print('written', os.path.getsize(os.path.join(OUT_DIR, 'scene.bin')) / 1e6, 'MB')
print(counts)
