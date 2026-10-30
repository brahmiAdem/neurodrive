import { test } from "node:test";
import assert from "node:assert/strict";
import { Car, SENSOR_COUNT } from "../../js/car.js";
import { Track, PRESETS } from "../../js/track.js";

const track = new Track(PRESETS.oval.points, PRESETS.oval.width);

test("reset places the car on the start line", () => {
  const car = new Car();
  car.reset(track);
  assert.equal(car.x, track.start.x);
  assert.equal(car.y, track.start.y);
  assert.equal(car.alive, true);
  assert.equal(car.checkpoints, 0);
});

test("sensors read values in [0, 1]", () => {
  const car = new Car();
  car.reset(track);
  car.sense(track);
  assert.equal(car.sensors.length, SENSOR_COUNT);
  for (const s of car.sensors) assert.ok(s >= 0 && s <= 1);
});

test("driving straight with full throttle passes checkpoints", () => {
  const car = new Car();
  car.reset(track);
  for (let i = 0; i < 40 && car.alive; i++) {
    car.throttle = 1;
    car.steer = 0;
    car.step(track, 3);
  }
  assert.ok(car.checkpoints > 0);
  assert.ok(car.fitness > 0);
});

test("steering hard into a wall crashes the car", () => {
  const car = new Car();
  car.reset(track);
  for (let i = 0; i < 400 && car.alive; i++) {
    car.throttle = 1;
    car.steer = 1;
    car.step(track, 3);
  }
  assert.equal(car.alive, false);
  assert.equal(car.crashed, true);
});

test("a car that never moves stalls out", () => {
  const car = new Car();
  car.reset(track);
  for (let i = 0; i < 1000 && car.alive; i++) car.step(track, 3);
  assert.equal(car.alive, false);
  assert.equal(car.crashed, false);
});

test("race cars respawn instead of dying", () => {
  const car = new Car();
  car.respawnOnCrash = true;
  car.reset(track);
  for (let i = 0; i < 400; i++) {
    car.throttle = 1;
    car.steer = 1;
    car.step(track, 3);
  }
  assert.equal(car.alive, true);
});
