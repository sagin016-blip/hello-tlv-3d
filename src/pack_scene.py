#!/usr/bin/env python3
# Pack scene.bin into scene.q.bin — same splats, ~45% smaller over the wire (GitHub Pages gzip).
#   * positions: float32 -> uint16 per axis, quantised inside each group's own bounding box
#     (project / plans / project ground keep ~1 mm steps; far city ground ~20 cm), stored as
#     byte planes (x lo, x hi, y lo, y hi, z lo, z hi) so gzip finds the redundancy
#   * colours: stored as 4 planes (r, g, b, a) instead of interleaved
#   * scale, rotation, meta, logo data: unchanged
# Writes the dequantisation table + packed size into scene.json ("qpos", "packed", "packed_bytes").
# Usage: python3 src/pack_scene.py            (run from the project root, after build_scene.py)
import json, os, sys
import numpy as np

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
meta = json.load(open(f'{D}/scene.json'))
N, NP = meta['count'], meta['nproj']
raw = open(f'{D}/scene.bin', 'rb').read()
o = 0
pos = np.frombuffer(raw, np.float32, N * 3, o).reshape(-1, 3).astype(np.float64); o += N * 12
scl = np.frombuffer(raw, np.uint8, N * 3, o); o += N * 3
qt = np.frombuffer(raw, np.uint8, N * 4, o); o += N * 4
rgba = np.frombuffer(raw, np.uint8, N * 4, o).reshape(-1, 4); o += N * 4
mt = np.frombuffer(raw, np.uint8, N * 4, o).reshape(-1, 4); o += N * 4
rest = raw[o:]
assert len(rest) == NP * 8, 'unexpected tail size'

grp = mt[:, 0].astype(np.int64)
G = int(grp.max()) + 1
lo = np.zeros((G, 3)); k = np.zeros((G, 3))
q = np.zeros((N, 3), np.uint16)
for g in range(G):
    idx = grp == g
    if not idx.any(): continue
    p = pos[idx]; l = p.min(0); h = p.max(0)
    kk = np.where(h > l, (h - l) / 65535.0, 0.0)
    lo[g], k[g] = l, kk
    q[idx] = np.where(kk > 0, np.round((p - l) / np.where(kk > 0, kk, 1)), 0).astype(np.uint16)

# verify round trip
dec = lo[grp] + q * k[grp]
err = np.abs(dec.astype(np.float32) - pos.astype(np.float32))
worst = {name: float(err[grp == gid].max()) for name, gid in meta['groups'].items() if (grp == gid).any()}
print('max position error per group (m):', {n: round(v, 4) for n, v in worst.items()})

planes = b''.join(q[:, a].astype('<u2').view(np.uint8).reshape(-1, 2)[:, b].tobytes() for a in range(3) for b in range(2))
out = planes + scl.tobytes() + qt.tobytes() + rgba.T.copy().tobytes() + mt.tobytes() + rest
open(f'{D}/scene.q.bin', 'wb').write(out)

meta['qpos'] = {'lo': lo.round(6).tolist(), 'k': k.tolist()}
meta['packed'] = 'scene.q.bin'
meta['packed_bytes'] = len(out)
json.dump(meta, open(f'{D}/scene.json', 'w'), indent=1, ensure_ascii=False)

import zlib
print(f'scene.bin   {len(raw)/1e6:.1f} MB raw · {len(zlib.compress(raw, 6))/1e6:.1f} MB gzip')
print(f'scene.q.bin {len(out)/1e6:.1f} MB raw · {len(zlib.compress(out, 6))/1e6:.1f} MB gzip')
