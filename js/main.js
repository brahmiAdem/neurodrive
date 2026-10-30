import { Track, PRESETS, randomTrackPoints } from "./track.js";
import { Car } from "./car.js";
import { NeuralNetwork } from "./nn.js";
import { Population } from "./evolution.js";
import { Viewport, renderTrackLayer, drawCar, drawSensors, drawNetwork, drawChart, COLORS } from "./render.js";

const MAX_LAPS = 3;
const MAX_GEN_FRAMES = 60 * 90;
const ELITISM = 3;
const STORAGE_BRAIN = "neurodrive.brain";
const STORAGE_CUSTOM = "neurodrive.customTrack";

const $ = (id) => document.getElementById(id);

const state = {
  mode: "train", // train | edit | race
  running: true,
  speed: 1,
  trackKey: "circuit",
  track: null,
  trackLayer: null,
  population: null,
  frame: 0,
  leader: null,
  params: { size: 80, mutationRate: 0.1, mutationStrength: 0.4, width: PRESETS.circuit.width },
  editor: { points: [], drag: -1, preview: null },
  race: null,
  keys: new Set(),
};

const view = new Viewport($("sim"));

// ---------------------------------------------------------------------------
// Persistence helpers (storage may be unavailable, e.g. private mode)

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Track & population management

function setTrack(track, key) {
  state.track = track;
  state.trackKey = key;
  state.trackLayer = renderTrackLayer(view, track);
  document.querySelectorAll("#track-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.track === key));
  restartGeneration();
}

function loadTrack(key) {
  let points, width;
  if (key === "random") {
    points = randomTrackPoints();
    width = state.params.width;
  } else if (key === "custom") {
    const saved = JSON.parse(storageGet(STORAGE_CUSTOM) || "null");
    if (!saved) return enterEditor(true);
    points = saved.points;
    width = saved.width;
  } else {
    points = PRESETS[key].points;
    width = PRESETS[key].width;
  }
  state.params.width = width;
  syncParamInputs();
  setTrack(new Track(points, width), key);
}

function restartGeneration() {
  if (!state.population) return;
  state.population.reset(state.track);
  state.frame = 0;
  hideBanner();
}

function newPopulation(seedBrain = null) {
  state.population = new Population(state.params.size, seedBrain);
  restartGeneration();
  drawChart($("chart"), state.population.history);
  updateBestMeta();
}

function nextGeneration() {
  const pop = state.population;
  pop.evolve({
    size: state.params.size,
    mutationRate: state.params.mutationRate,
    mutationStrength: state.params.mutationStrength,
    elitism: ELITISM,
  });
  restartGeneration();
  drawChart($("chart"), pop.history);
  updateBestMeta();
}

// ---------------------------------------------------------------------------
// Simulation

/** Advances training by one tick. Returns true if a new generation started. */
function trainStep() {
  const { track, population } = state;
  let alive = 0;
  for (const car of population.cars) {
    if (!car.alive) continue;
    car.sense(track);
    car.think();
    car.step(track, MAX_LAPS);
    if (car.alive) alive++;
  }
  state.frame++;
  if (alive === 0 || state.frame >= MAX_GEN_FRAMES) {
    nextGeneration();
    return true;
  }
  return false;
}

function raceStep() {
  const r = state.race;
  if (r.countdown > 0) { r.countdown--; return; }
  if (r.result) return;
  const { track } = state;

  const k = state.keys;
  const p = r.player;
  if (p.alive) {
    p.steer = (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0) - (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0);
    p.throttle = k.has("ArrowUp") || k.has("KeyW") ? 1 : k.has("ArrowDown") || k.has("KeyS") ? -1.5 : 0;
    p.sense(track);
    p.step(track, MAX_LAPS);
  }
  if (r.ai.alive) {
    r.ai.sense(track);
    r.ai.think();
    r.ai.step(track, MAX_LAPS);
  }
  if (p.finished || r.ai.finished) {
    const playerWon = p.finished && (!r.ai.finished || p.finishFrame <= r.ai.finishFrame);
    const t = ((playerWon ? p.finishFrame : r.ai.finishFrame) / 60).toFixed(2);
    r.result = playerWon ? `🏆 You beat the AI! ${t}s` : `🤖 The AI wins in ${t}s`;
    showBanner(r.result, playerWon ? "win" : "lose");
  }
}

function pickLeader() {
  let best = null;
  for (const car of state.population.cars) {
    if (car.alive && (!best || car.fitness > best.fitness)) best = car;
  }
  if (!best) for (const car of state.population.cars) if (!best || car.fitness > best.fitness) best = car;
  return best;
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  const { ctx } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(state.trackLayer, 0, 0);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);

  if (state.mode === "edit") return renderEditor(ctx);

  if (state.mode === "race") {
    const { player, ai, countdown } = state.race;
    drawSensors(ctx, ai);
    drawCar(ctx, ai, { color: COLORS.accent, glow: true, label: "AI" });
    drawCar(ctx, player, { color: COLORS.warn, glow: true, label: "YOU" });
    if (countdown > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `700 ${Math.round(110 * view.dpr)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(230,235,245,0.92)";
      ctx.fillText(String(Math.ceil(countdown / 60)), view.canvas.width / 2, view.canvas.height / 2);
      ctx.restore();
    }
    return;
  }

  const leader = state.leader;
  for (const car of state.population.cars) {
    if (!car.alive || car === leader) continue;
    drawCar(ctx, car, { color: COLORS.accent2, alpha: 0.38 });
  }
  if (leader) {
    drawSensors(ctx, leader);
    drawCar(ctx, leader, { color: COLORS.accent, glow: true });
  }
}

function renderEditor(ctx) {
  const pts = state.editor.points;
  if (pts.length >= 2) {
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(90,169,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    if (pts.length >= 3) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], i === state.editor.drag ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? COLORS.warn : COLORS.accent2;
    ctx.fill();
    ctx.strokeStyle = "#0b0f17";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  if (pts.length < 4) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `500 ${Math.round(15 * view.dpr)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Place at least 4 points to make a loop (${pts.length}/4)`, view.canvas.width / 2, view.canvas.height / 2);
    ctx.restore();
  }
}

let uiTick = 0;
function updatePanels() {
  const pop = state.population;
  if (state.mode === "race") {
    const { player, ai } = state.race;
    const lap = (c) => Math.min(MAX_LAPS, Math.floor(c.laps) + 1);
    $("hud").innerHTML =
      `<span class="pill you">YOU · lap ${lap(player)}/${MAX_LAPS}</span>` +
      `<span class="pill ai">AI · lap ${lap(ai)}/${MAX_LAPS}</span>`;
    drawNetwork($("network"), ai.brain);
    setMeters(ai);
    return;
  }

  const leader = state.leader;
  const alive = pop.cars.reduce((n, c) => n + (c.alive ? 1 : 0), 0);
  if (uiTick++ % 4 === 0) {
    $("st-gen").textContent = pop.generation;
    $("st-alive").textContent = `${alive}/${pop.cars.length}`;
    $("st-laps").textContent = leader ? leader.laps.toFixed(2) : "0.00";
    $("st-best").textContent = Math.round(Math.max(pop.bestEverFitness, leader ? leader.fitness : 0, 0));
    const secs = (state.frame / 60).toFixed(1);
    $("hud").innerHTML =
      `<span class="pill">GEN ${pop.generation}</span>` +
      `<span class="pill">${alive} alive</span>` +
      `<span class="pill muted">${secs}s</span>` +
      (state.running ? "" : `<span class="pill warn">PAUSED</span>`);
  }
  if (state.mode === "train") {
    drawNetwork($("network"), leader?.brain ?? null);
    setMeters(leader);
  }
}

function setMeters(car) {
  const set = (el, v) => {
    const pct = Math.abs(v) * 50;
    el.style.width = `${pct}%`;
    el.style.left = v >= 0 ? "50%" : `${50 - pct}%`;
    el.classList.toggle("neg", v < 0);
  };
  set($("m-steer"), car ? car.steer : 0);
  set($("m-gas"), car ? car.throttle : 0);
}

function updateBestMeta() {
  const pop = state.population;
  $("best-meta").textContent = pop.bestEver
    ? `gen ${pop.bestEverGeneration} · fitness ${Math.round(pop.bestEverFitness)}`
    : "none yet";
  $("btn-race").disabled = !pop.bestEver;
}

// ---------------------------------------------------------------------------
// Main loop

function loop() {
  if (state.mode === "train" && state.running) {
    if (state.speed === "max") {
      const t0 = performance.now();
      while (performance.now() - t0 < 14) trainStep();
    } else {
      for (let i = 0; i < state.speed; i++) trainStep();
    }
  } else if (state.mode === "race" && state.running) {
    raceStep();
  }
  if (state.mode !== "edit") state.leader = state.mode === "train" ? pickLeader() : null;
  render();
  if (state.mode !== "edit") updatePanels();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Track editor

function enterEditor(fresh = false) {
  state.mode = "edit";
  const saved = JSON.parse(storageGet(STORAGE_CUSTOM) || "null");
  state.editor.points = fresh ? (saved ? saved.points.map((p) => p.slice()) : []) : state.track.control.map((p) => p.slice());
  state.editor.prevKey = state.trackKey;
  $("editor-bar").hidden = false;
  $("hud").innerHTML = "";
  hideBanner();
  document.querySelectorAll("#track-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.track === "custom"));
  refreshEditorPreview();
}

function exitEditor() {
  state.mode = "train";
  $("editor-bar").hidden = true;
}

function refreshEditorPreview() {
  const pts = state.editor.points;
  state.editor.preview = pts.length >= 4 ? new Track(pts, state.params.width) : null;
  state.trackLayer = renderTrackLayer(view, state.editor.preview);
}

/** Insert a new point into the loop edge where it adds the least length. */
function insertPoint(pts, p) {
  if (pts.length < 3) return pts.push(p);
  let bestI = 0, bestCost = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cost = Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(p[0] - b[0], p[1] - b[1]) - Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (cost < bestCost) { bestCost = cost; bestI = i; }
  }
  pts.splice(bestI + 1, 0, p);
}

function hitPoint(world) {
  const pts = state.editor.points;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (Math.hypot(pts[i][0] - world[0], pts[i][1] - world[1]) < 16) return i;
  }
  return -1;
}

const canvas = $("sim");
canvas.addEventListener("pointerdown", (e) => {
  if (state.mode !== "edit" || e.button !== 0) return;
  const w = view.toWorld(e.clientX, e.clientY);
  let i = hitPoint(w);
  if (i < 0) {
    insertPoint(state.editor.points, w);
    i = state.editor.points.indexOf(w);
    refreshEditorPreview();
  }
  state.editor.drag = i;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (state.mode !== "edit") return;
  const w = view.toWorld(e.clientX, e.clientY);
  canvas.style.cursor = hitPoint(w) >= 0 ? "grab" : "crosshair";
  if (state.editor.drag < 0) return;
  state.editor.points[state.editor.drag] = w;
  refreshEditorPreview();
});
canvas.addEventListener("pointerup", () => { state.editor.drag = -1; });
canvas.addEventListener("contextmenu", (e) => {
  if (state.mode !== "edit") return;
  e.preventDefault();
  const i = hitPoint(view.toWorld(e.clientX, e.clientY));
  if (i >= 0) {
    state.editor.points.splice(i, 1);
    refreshEditorPreview();
  }
});

$("ed-clear").onclick = () => { state.editor.points = []; refreshEditorPreview(); };
$("ed-cancel").onclick = () => {
  exitEditor();
  setTrack(state.track, state.editor.prevKey);
};
$("ed-apply").onclick = () => {
  const pts = state.editor.points;
  if (pts.length < 4) return toast("Add at least 4 points first");
  storageSet(STORAGE_CUSTOM, JSON.stringify({ points: pts, width: state.params.width }));
  exitEditor();
  setTrack(new Track(pts, state.params.width), "custom");
  toast("Custom track ready. The current population keeps its brains.");
};

// ---------------------------------------------------------------------------
// Race mode

function startRace() {
  const brain = state.population.bestEver;
  if (!brain) return toast("Let the AI evolve for at least one generation first");
  if (state.mode === "edit") exitEditor();
  const ai = new Car(brain.clone());
  const player = new Car(null);
  for (const c of [ai, player]) { c.respawnOnCrash = true; c.reset(state.track); }
  state.race = { ai, player, countdown: 180, result: null };
  state.mode = "race";
  state.running = true;
  syncPlayButton();
  hideBanner();
  $("race-bar").hidden = false;
  $("canvas-wrap").focus({ preventScroll: true });
  $("canvas-wrap").scrollIntoView({ behavior: "smooth", block: "center" });
}

function exitRace() {
  state.mode = "train";
  state.race = null;
  $("race-bar").hidden = true;
  restartGeneration();
}

$("btn-race").onclick = startRace;
$("race-restart").onclick = startRace;
$("race-exit").onclick = exitRace;

// ---------------------------------------------------------------------------
// Controls

document.querySelectorAll("#track-tabs button").forEach((btn) => {
  btn.onclick = () => {
    if (state.mode === "race") exitRace();
    const key = btn.dataset.track;
    if (key === "custom") {
      if (state.mode === "edit") return;
      return enterEditor(state.trackKey !== "custom");
    }
    if (state.mode === "edit") exitEditor();
    loadTrack(key);
  };
});

function setSpeed(speed) {
  state.speed = speed;
  document.querySelectorAll("#speed-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.speed === String(speed)));
}
document.querySelectorAll("#speed-tabs button").forEach((btn) => {
  btn.onclick = () => setSpeed(btn.dataset.speed === "max" ? "max" : Number(btn.dataset.speed));
});

function syncPlayButton() {
  $("btn-play").classList.toggle("paused", !state.running);
}
function togglePlay() {
  state.running = !state.running;
  syncPlayButton();
}
$("btn-play").onclick = togglePlay;
$("btn-skip").onclick = () => {
  if (state.mode !== "train") return;
  nextGeneration();
};

function bindRange(id, outId, key, fmt, onChange) {
  const input = $(id);
  input.addEventListener("input", () => {
    state.params[key] = Number(input.value);
    $(outId).textContent = fmt(state.params[key]);
    onChange?.();
  });
}
function syncParamInputs() {
  const set = (id, outId, v, fmt) => { $(id).value = v; $(outId).textContent = fmt(v); };
  set("p-pop", "o-pop", state.params.size, (v) => v);
  set("p-rate", "o-rate", state.params.mutationRate, (v) => `${Math.round(v * 100)}%`);
  set("p-strength", "o-strength", state.params.mutationStrength, (v) => v.toFixed(2));
  set("p-width", "o-width", state.params.width, (v) => `${v}px`);
}
bindRange("p-pop", "o-pop", "size", (v) => v);
bindRange("p-rate", "o-rate", "mutationRate", (v) => `${Math.round(v * 100)}%`);
bindRange("p-strength", "o-strength", "mutationStrength", (v) => v.toFixed(2));
bindRange("p-width", "o-width", "width", (v) => `${v}px`, () => {
  if (state.mode === "edit") return refreshEditorPreview();
  if (state.mode === "race") exitRace();
  setTrack(new Track(state.track.control, state.params.width), state.trackKey);
});

$("btn-reset").onclick = () => {
  if (state.mode === "race") exitRace();
  newPopulation();
  toast("New random population created");
};

// Brain persistence
$("btn-save").onclick = () => {
  const brain = state.population.bestEver;
  if (!brain) return toast("No brain to save yet");
  const ok = storageSet(STORAGE_BRAIN, JSON.stringify(brain));
  toast(ok ? "Best brain saved in this browser" : "Storage unavailable, use Export instead");
};
$("btn-load").onclick = () => {
  const raw = storageGet(STORAGE_BRAIN);
  if (!raw) return toast("No saved brain found");
  seedFrom(raw, "Loaded saved brain");
};
$("btn-export").onclick = () => {
  const brain = state.population.bestEver;
  if (!brain) return toast("No brain to export yet");
  const blob = new Blob([JSON.stringify({ app: "neurodrive", ...brain.toJSON() })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `neurodrive-brain-gen${state.population.bestEverGeneration}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$("btn-import").onclick = () => $("file-import").click();
$("file-import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  seedFrom(await file.text(), `Imported ${file.name}`);
  e.target.value = "";
};

function seedFrom(json, message) {
  try {
    const brain = NeuralNetwork.fromJSON(JSON.parse(json));
    if (state.mode === "race") exitRace();
    newPopulation(brain);
    state.population.bestEver = brain.clone();
    state.population.bestEverFitness = 0;
    updateBestMeta();
    toast(`${message}. The population is seeded from it.`);
  } catch (err) {
    toast(`Could not load brain: ${err.message}`);
  }
}

// Keyboard
const RACE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (state.mode === "race" && RACE_KEYS.has(e.code)) {
    state.keys.add(e.code);
    e.preventDefault();
    return;
  }
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (e.code === "KeyN" && state.mode === "train") nextGeneration();
  else if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) setSpeed([1, 3, 10, "max"][Number(e.code.slice(-1)) - 1]);
});
window.addEventListener("keyup", (e) => state.keys.delete(e.code));
window.addEventListener("blur", () => state.keys.clear());

// About dialog
$("btn-about").onclick = () => $("about").showModal();
$("about").addEventListener("click", (e) => { if (e.target === $("about")) $("about").close(); });

// Toasts & banner
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function showBanner(text, kind) {
  const el = $("banner");
  el.textContent = text;
  el.className = `banner ${kind}`;
  el.hidden = false;
}
function hideBanner() { $("banner").hidden = true; }

// Resize
new ResizeObserver(() => {
  view.resize();
  state.trackLayer = renderTrackLayer(view, state.mode === "edit" ? state.editor.preview : state.track);
  if (state.population) drawChart($("chart"), state.population.history);
}).observe($("canvas-wrap"));

// ---------------------------------------------------------------------------
// Boot

syncParamInputs();
setSpeed(1);
syncPlayButton();
loadTrack("circuit");
newPopulation();
requestAnimationFrame(loop);

if (!storageGet("neurodrive.visited")) {
  storageSet("neurodrive.visited", "1");
  setTimeout(() => $("about").showModal(), 400);
}
