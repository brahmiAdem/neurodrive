import { test } from "node:test";
import assert from "node:assert/strict";
import { Track, PRESETS, segIntersect, randomTrackPoints, WORLD_W, WORLD_H } from "../../js/track.js";

test("segIntersect finds crossings and rejects misses", () => {
  assert.equal(segIntersect(0, 0, 10, 0, 5, -5, 5, 5), 0.5);
  assert.equal(segIntersect(0, 0, 10, 0, 20, -5, 20, 5), -1);
  assert.equal(segIntersect(0, 0, 10, 0, 0, 1, 10, 1), -1); // parallel
});

for (const [key, preset] of Object.entries(PRESETS)) {
  test(`preset "${key}" builds a valid closed track`, () => {
    const track = new Track(preset.points, preset.width);
    const n = track.center.length;
    assert.ok(n > 50, "has enough checkpoints");
    assert.equal(track.checkpoints.length, n);
    assert.equal(track.wallCount, n * 2);
    for (const [x, y] of track.center) {
      assert.ok(x > 0 && x < WORLD_W && y > 0 && y < WORLD_H, "centerline stays in the world");
    }
  });
}

test("start position is on the road and clear of walls", () => {
  const track = new Track(PRESETS.circuit.points, 70);
  const { x, y } = track.start;
  const box = [x - 5, y - 5, x + 5, y - 5, x + 5, y + 5, x - 5, y + 5];
  assert.equal(track.polygonHitsWall(box), false);
});

test("sideways rays from the centerline hit a wall at half the track width", () => {
  const width = 80;
  const track = new Track(PRESETS.oval.points, width);
  const { x, y, angle } = track.start;
  const len = 200;
  for (const side of [-1, 1]) {
    const a = angle + (side * Math.PI) / 2;
    const t = track.raycast(x, y, Math.cos(a), Math.sin(a), len);
    assert.ok(Math.abs(t * len - width / 2) < 3, `expected ~${width / 2}, got ${t * len}`);
  }
});

test("grid-accelerated raycast matches a brute-force raycast", () => {
  const track = new Track(PRESETS.serpentine.points, PRESETS.serpentine.width);
  const W = track.walls;
  const len = 220;
  for (let k = 0; k < 500; k++) {
    const ox = 50 + Math.random() * (WORLD_W - 100);
    const oy = 50 + Math.random() * (WORLD_H - 100);
    const a = Math.random() * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let brute = 1;
    for (let s = 0; s < track.wallCount; s++) {
      const o = s * 4;
      const t = segIntersect(ox, oy, ox + dx * len, oy + dy * len, W[o], W[o + 1], W[o + 2], W[o + 3]);
      if (t >= 0 && t < brute) brute = t;
    }
    assert.ok(Math.abs(track.raycast(ox, oy, dx, dy, len) - brute) < 1e-9, `ray ${k} disagrees`);
  }
});

test("random tracks stay inside the world", () => {
  for (let i = 0; i < 20; i++) {
    for (const [x, y] of randomTrackPoints()) {
      assert.ok(x > 0 && x < WORLD_W && y > 0 && y < WORLD_H);
    }
  }
});
