// Track geometry: a closed centerline spline turned into two walls, checkpoints
// and a uniform spatial grid used to accelerate ray casts and collision tests.

export const WORLD_W = 1200;
export const WORLD_H = 760;

const CHECKPOINT_SPACING = 18;
const CELL = 48;

/** Returns t along AB where AB crosses CD, or -1 if the segments don't intersect. */
export function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) return -1;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

function catmullRomClosed(pts, samplesPerSeg) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

/** Resample a closed polyline to points spaced evenly along its arc length. */
function resampleClosed(pts, spacing) {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[n];
  const count = Math.max(8, Math.round(total / spacing));
  const out = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (cum[seg + 1] < d) seg++;
    const a = pts[seg], b = pts[(seg + 1) % n];
    const t = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { points: out, length: total };
}

export class Track {
  constructor(controlPoints, width = 70) {
    this.control = controlPoints.map((p) => [p[0], p[1]]);
    this.width = width;
    this.#build();
  }

  #build() {
    const dense = catmullRomClosed(this.control, 24);
    const { points, length } = resampleClosed(dense, CHECKPOINT_SPACING);
    this.center = points;
    this.length = length;
    const n = points.length;
    const half = this.width / 2;

    this.left = [];
    this.right = [];
    this.tangents = [];
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
      let tx = next[0] - prev[0], ty = next[1] - prev[1];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      this.tangents.push([tx, ty]);
      const c = points[i];
      this.left.push([c[0] - ty * half, c[1] + tx * half]);
      this.right.push([c[0] + ty * half, c[1] - tx * half]);
    }

    // Walls: one segment per sample on each side, packed as x1,y1,x2,y2.
    this.walls = new Float32Array(n * 2 * 4);
    let w = 0;
    for (const side of [this.left, this.right]) {
      for (let i = 0; i < n; i++) {
        const a = side[i], b = side[(i + 1) % n];
        this.walls[w++] = a[0]; this.walls[w++] = a[1];
        this.walls[w++] = b[0]; this.walls[w++] = b[1];
      }
    }
    this.wallCount = n * 2;

    this.checkpoints = this.left.map((l, i) => [l[0], l[1], this.right[i][0], this.right[i][1]]);
    this.start = { x: points[0][0], y: points[0][1], angle: Math.atan2(this.tangents[0][1], this.tangents[0][0]) };
    this.#buildGrid();
  }

  #buildGrid() {
    this.cols = Math.ceil(WORLD_W / CELL) + 2;
    this.rows = Math.ceil(WORLD_H / CELL) + 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.stamp = new Uint32Array(this.wallCount);
    this.queryId = 0;
    const W = this.walls;
    for (let s = 0; s < this.wallCount; s++) {
      const o = s * 4;
      const x0 = this.#cx(Math.min(W[o], W[o + 2])), x1 = this.#cx(Math.max(W[o], W[o + 2]));
      const y0 = this.#cy(Math.min(W[o + 1], W[o + 3])), y1 = this.#cy(Math.max(W[o + 1], W[o + 3]));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) this.cells[cy * this.cols + cx].push(s);
      }
    }
  }

  // Grid is offset by one cell so slightly out-of-world geometry still lands somewhere valid.
  #cx(x) { return Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL) + 1)); }
  #cy(y) { return Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL) + 1)); }

  /**
   * Cast a ray and return the hit distance as a fraction of `len` (1 = nothing hit).
   * Walks grid cells in order (Amanatides–Woo) and stops as soon as the closest hit is known.
   */
  raycast(ox, oy, dx, dy, len) {
    let cx = Math.floor(ox / CELL), cy = Math.floor(oy / CELL);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const tDeltaX = adx > 1e-9 ? CELL / adx : Infinity;
    const tDeltaY = ady > 1e-9 ? CELL / ady : Infinity;
    let tMaxX = adx > 1e-9 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / adx : Infinity;
    let tMaxY = ady > 1e-9 ? (dy > 0 ? (cy + 1) * CELL - oy : oy - cy * CELL) / ady : Infinity;
    const ex = ox + dx * len, ey = oy + dy * len;
    const id = ++this.queryId;
    const W = this.walls;
    let best = 1;

    for (;;) {
      const gx = cx + 1, gy = cy + 1;
      if (gx >= 0 && gy >= 0 && gx < this.cols && gy < this.rows) {
        const cell = this.cells[gy * this.cols + gx];
        for (let k = 0; k < cell.length; k++) {
          const s = cell[k];
          if (this.stamp[s] === id) continue;
          this.stamp[s] = id;
          const o = s * 4;
          const t = segIntersect(ox, oy, ex, ey, W[o], W[o + 1], W[o + 2], W[o + 3]);
          if (t >= 0 && t < best) best = t;
        }
      }
      const tExit = Math.min(tMaxX, tMaxY);
      if (best * len <= tExit || tExit > len) break;
      if (tMaxX < tMaxY) { tMaxX += tDeltaX; cx += stepX; } else { tMaxY += tDeltaY; cy += stepY; }
    }
    return best;
  }

  /** True if the closed polygon (flat [x0,y0,x1,y1,...]) touches any wall. */
  polygonHitsWall(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      if (poly[i] < minX) minX = poly[i];
      if (poly[i] > maxX) maxX = poly[i];
      if (poly[i + 1] < minY) minY = poly[i + 1];
      if (poly[i + 1] > maxY) maxY = poly[i + 1];
    }
    const id = ++this.queryId;
    const W = this.walls;
    const m = poly.length;
    for (let gy = this.#cy(minY); gy <= this.#cy(maxY); gy++) {
      for (let gx = this.#cx(minX); gx <= this.#cx(maxX); gx++) {
        const cell = this.cells[gy * this.cols + gx];
        for (let k = 0; k < cell.length; k++) {
          const s = cell[k];
          if (this.stamp[s] === id) continue;
          this.stamp[s] = id;
          const o = s * 4;
          for (let i = 0; i < m; i += 2) {
            const j = (i + 2) % m;
            if (segIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1], W[o], W[o + 1], W[o + 2], W[o + 3]) >= 0) return true;
          }
        }
      }
    }
    return false;
  }

  crossesCheckpoint(index, x0, y0, x1, y1) {
    const c = this.checkpoints[index];
    return segIntersect(x0, y0, x1, y1, c[0], c[1], c[2], c[3]) >= 0;
  }
}

// ---------------------------------------------------------------------------
// Preset layouts (control points in world space)

export const PRESETS = {
  oval: {
    name: "Oval",
    width: 80,
    points: [[190, 380], [250, 170], [600, 110], [950, 170], [1010, 380], [950, 590], [600, 650], [250, 590]],
  },
  circuit: {
    name: "Circuit",
    width: 70,
    points: [
      [140, 600], [130, 330], [210, 150], [420, 120], [520, 260], [640, 320], [760, 190],
      [960, 120], [1090, 240], [1070, 450], [890, 520], [770, 640], [500, 670], [280, 660],
    ],
  },
  serpentine: {
    name: "Serpentine",
    width: 62,
    points: [
      [100, 640], [100, 260], [150, 120], [225, 85], [300, 120], [350, 250], [350, 450], [400, 555],
      [475, 580], [550, 555], [600, 450], [600, 250], [650, 120], [725, 85], [800, 120], [850, 250],
      [850, 450], [910, 560], [1040, 570], [1120, 640], [1060, 705], [600, 712], [170, 712],
    ],
  },
};

/** Star-shaped random loop: guaranteed not to self-intersect. */
export function randomTrackPoints() {
  const n = 10 + Math.floor(Math.random() * 6);
  const radii = [];
  for (let i = 0; i < n; i++) radii.push(0.55 + Math.random() * 0.45);
  const smooth = radii.map((r, i) => (radii[(i - 1 + n) % n] + r * 2 + radii[(i + 1) % n]) / 4);
  const phase = Math.random() * Math.PI * 2;
  return smooth.map((r, i) => {
    const a = phase + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / n) * 0.6;
    return [WORLD_W / 2 + Math.cos(a) * r * 500, WORLD_H / 2 + Math.sin(a) * r * 300];
  });
}
