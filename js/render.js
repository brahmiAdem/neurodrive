// Canvas drawing: track, cars, sensors, the leader's network and the fitness chart.

import { WORLD_W, WORLD_H } from "./track.js";
import { CAR_LENGTH, CAR_WIDTH, SENSOR_ANGLES, SENSOR_LENGTH } from "./car.js";

export const COLORS = {
  grass: "#0c1220",
  grid: "rgba(120,150,200,0.06)",
  road: "#1b2333",
  roadEdge: "#ff5d7a",
  roadEdgeAlt: "#f1f5ff",
  centerLine: "rgba(255,255,255,0.18)",
  accent: "#3ef0b0",
  accent2: "#5aa9ff",
  danger: "#ff5d7a",
  warn: "#ffc857",
  text: "#e6ebf5",
  muted: "#8a95ab",
};

/** Fits the fixed-size world into the canvas, letterboxed and DPR-aware. */
export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.dpr = dpr;
    this.scale = Math.min(this.canvas.width / WORLD_W, this.canvas.height / WORLD_H);
    this.ox = (this.canvas.width - WORLD_W * this.scale) / 2;
    this.oy = (this.canvas.height - WORLD_H * this.scale) / 2;
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      ((clientX - rect.left) * this.dpr - this.ox) / this.scale,
      ((clientY - rect.top) * this.dpr - this.oy) / this.scale,
    ];
  }

  begin() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
  }
}

function tracePolyline(ctx, pts, close = true) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

/** Pre-renders the static track into an offscreen canvas at the viewport's resolution. */
export function renderTrackLayer(view, track) {
  const layer = document.createElement("canvas");
  layer.width = view.canvas.width;
  layer.height = view.canvas.height;
  const ctx = layer.getContext("2d");
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, layer.width, layer.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);

  // Background grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  for (let y = 0; y <= WORLD_H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  ctx.stroke();

  if (!track) return layer;

  // Road surface: the area between the two border loops
  ctx.beginPath();
  tracePolyline(ctx, track.left);
  tracePolyline(ctx, track.right);
  ctx.fillStyle = COLORS.road;
  ctx.fill("evenodd");

  // Kerbs: alternating red/white stripes along both edges
  ctx.lineWidth = 5;
  ctx.lineCap = "butt";
  for (const side of [track.left, track.right]) {
    for (let i = 0; i < side.length; i++) {
      const a = side[i], b = side[(i + 1) % side.length];
      ctx.strokeStyle = (i >> 1) % 2 ? COLORS.roadEdge : COLORS.roadEdgeAlt;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }

  // Dashed centre line
  ctx.setLineDash([10, 14]);
  ctx.strokeStyle = COLORS.centerLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  tracePolyline(ctx, track.center);
  ctx.stroke();
  ctx.setLineDash([]);

  // Checkered start/finish line
  const [lx, ly, rx, ry] = track.checkpoints[0];
  const squares = 8;
  const [tx, ty] = track.tangents[0];
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < squares; k++) {
      const t0 = k / squares, t1 = (k + 1) / squares;
      const off = row * 6;
      ctx.fillStyle = (k + row) % 2 ? "#ffffff" : "#111111";
      ctx.beginPath();
      ctx.moveTo(lx + (rx - lx) * t0 + tx * off, ly + (ry - ly) * t0 + ty * off);
      ctx.lineTo(lx + (rx - lx) * t1 + tx * off, ly + (ry - ly) * t1 + ty * off);
      ctx.lineTo(lx + (rx - lx) * t1 + tx * (off + 6), ly + (ry - ly) * t1 + ty * (off + 6));
      ctx.lineTo(lx + (rx - lx) * t0 + tx * (off + 6), ly + (ry - ly) * t0 + ty * (off + 6));
      ctx.closePath();
      ctx.fill();
    }
  }
  return layer;
}

export function drawSensors(ctx, car) {
  for (let k = 0; k < SENSOR_ANGLES.length; k++) {
    const a = car.angle + SENSOR_ANGLES[k];
    const d = car.sensors[k] * SENSOR_LENGTH;
    const ex = car.x + Math.cos(a) * d, ey = car.y + Math.sin(a) * d;
    const danger = 1 - car.sensors[k];
    ctx.strokeStyle = `rgba(${Math.round(90 + 165 * danger)}, ${Math.round(240 - 150 * danger)}, ${Math.round(176 - 60 * danger)}, 0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(car.x, car.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (car.sensors[k] < 1) {
      ctx.fillStyle = danger > 0.6 ? COLORS.danger : COLORS.warn;
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawCar(ctx, car, { color, alpha = 1, glow = false, label = null }) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = color;
  roundRect(ctx, -CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 3.5);
  ctx.fill();
  ctx.shadowBlur = 0;
  // windshield
  ctx.fillStyle = "rgba(10,15,25,0.75)";
  roundRect(ctx, 1, -CAR_WIDTH / 2 + 2, 5, CAR_WIDTH - 4, 1.5);
  ctx.fill();
  ctx.restore();

  if (label) {
    ctx.save();
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(label, car.x, car.y - 16);
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Network diagram

const INPUT_LABELS = ["L 90°", "L 60°", "L 30°", "front", "R 30°", "R 60°", "R 90°", "speed"];
const OUTPUT_LABELS = ["steer", "gas"];

export function drawNetwork(canvas, nn) {
  const ctx = fitCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (!nn) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No car on track", w / 2, h / 2);
    return;
  }

  const layers = nn.layers;
  const padL = 52, padR = 44, padY = 14;
  const colX = (l) => padL + (l / (layers.length - 1)) * (w - padL - padR);
  const rowY = (l, i) => {
    const n = layers[l];
    const span = Math.min(h - padY * 2, n * 24);
    return h / 2 - span / 2 + (n === 1 ? span / 2 : (i / (n - 1)) * span);
  };

  for (let l = 0; l < layers.length - 1; l++) {
    for (let i = 0; i < layers[l]; i++) {
      for (let j = 0; j < layers[l + 1]; j++) {
        const wt = nn.weight(l, i, j);
        const signal = Math.abs(nn.activations[l][i]);
        const a = Math.min(0.85, Math.abs(wt) * 0.35) * (0.25 + 0.75 * signal);
        ctx.strokeStyle = wt > 0 ? `rgba(62,240,176,${a})` : `rgba(255,93,122,${a})`;
        ctx.lineWidth = Math.min(2.5, 0.4 + Math.abs(wt));
        ctx.beginPath();
        ctx.moveTo(colX(l), rowY(l, i));
        ctx.lineTo(colX(l + 1), rowY(l + 1, j));
        ctx.stroke();
      }
    }
  }

  ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
  for (let l = 0; l < layers.length; l++) {
    for (let i = 0; i < layers[l]; i++) {
      const v = nn.activations[l][i];
      const x = colX(l), y = rowY(l, i);
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0b111c";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = v >= 0 ? `rgba(62,240,176,${Math.abs(v)})` : `rgba(255,93,122,${Math.abs(v)})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (l === 0) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(INPUT_LABELS[i] ?? "", x - 11, y + 3);
      } else if (l === layers.length - 1) {
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = "left";
        ctx.fillText(OUTPUT_LABELS[i] ?? "", x + 11, y + 3);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fitness history chart

export function drawChart(canvas, history) {
  const ctx = fitCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;

  const maxY = Math.max(10, ...history.map((d) => d.best)) * 1.08;
  const maxX = Math.max(5, history.length);

  ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.fillStyle = COLORS.muted;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  for (let k = 0; k <= 3; k++) {
    const v = (maxY * k) / 3;
    const y = pad.t + ph - (v / maxY) * ph;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillText(Math.round(v).toString(), pad.l - 6, y + 3);
  }
  ctx.textAlign = "center";
  ctx.fillText("generation", pad.l + pw / 2, h - 5);

  if (history.length === 0) {
    ctx.fillText("Waiting for first generation…", pad.l + pw / 2, pad.t + ph / 2);
    return;
  }

  const px = (i) => pad.l + (history.length === 1 ? pw / 2 : (i / (maxX - 1)) * pw);
  const py = (v) => pad.t + ph - (v / maxY) * ph;

  const line = (key, color, fill) => {
    ctx.beginPath();
    history.forEach((d, i) => (i ? ctx.lineTo(px(i), py(d[key])) : ctx.moveTo(px(i), py(d[key]))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    if (fill) {
      ctx.lineTo(px(history.length - 1), py(0));
      ctx.lineTo(px(0), py(0));
      ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
      g.addColorStop(0, "rgba(62,240,176,0.25)");
      g.addColorStop(1, "rgba(62,240,176,0)");
      ctx.fillStyle = g;
      ctx.fill();
    }
  };
  line("avg", COLORS.accent2, false);
  line("best", COLORS.accent, true);

  const last = history[history.length - 1];
  ctx.beginPath();
  ctx.arc(px(history.length - 1), py(last.best), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fill();
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
