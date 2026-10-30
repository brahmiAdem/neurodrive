// A car is a simple kinematic body with ray sensors. AI cars feed the sensor
// readings into their neural network; the player car reads the keyboard instead.

export const SENSOR_COUNT = 7;
export const SENSOR_SPREAD = Math.PI; // -90° .. +90°
export const SENSOR_LENGTH = 220;
export const INPUT_COUNT = SENSOR_COUNT + 1; // + current speed
export const OUTPUT_COUNT = 2; // steer, throttle

export const CAR_LENGTH = 22;
export const CAR_WIDTH = 11;

const MAX_SPEED = 7;
const ACCEL = 0.22;
const DRAG = 0.02;
const TURN_RATE = 0.065;
const STALL_FRAMES = 140;

export const SENSOR_ANGLES = Array.from(
  { length: SENSOR_COUNT },
  (_, k) => (k / (SENSOR_COUNT - 1) - 0.5) * SENSOR_SPREAD,
);

export class Car {
  constructor(brain = null) {
    this.brain = brain;
    this.sensors = new Float32Array(SENSOR_COUNT).fill(1);
    this.inputs = new Float32Array(INPUT_COUNT);
    this.poly = new Float32Array(8);
    this.respawnOnCrash = false;
    this.hue = 160;
  }

  reset(track) {
    this.trackSize = track.checkpoints.length;
    this.x = track.start.x;
    this.y = track.start.y;
    this.angle = track.start.angle;
    this.speed = 0;
    this.alive = true;
    this.crashed = false;
    this.finished = false;
    this.checkpoints = 0;
    this.next = 1;
    this.frames = 0;
    this.sinceCheckpoint = 0;
    this.steer = 0;
    this.throttle = 0;
    this.fitness = 0;
    this.finishFrame = 0;
    this.sensors.fill(1);
    this.#updatePoly();
  }

  get laps() {
    return this.checkpoints / this.trackSize;
  }

  sense(track) {
    for (let k = 0; k < SENSOR_COUNT; k++) {
      const a = this.angle + SENSOR_ANGLES[k];
      this.sensors[k] = track.raycast(this.x, this.y, Math.cos(a), Math.sin(a), SENSOR_LENGTH);
    }
  }

  think() {
    for (let k = 0; k < SENSOR_COUNT; k++) this.inputs[k] = 1 - this.sensors[k];
    this.inputs[SENSOR_COUNT] = this.speed / MAX_SPEED;
    const out = this.brain.forward(this.inputs);
    this.steer = out[0];
    this.throttle = out[1];
  }

  step(track, maxLaps) {
    this.speed += this.throttle * ACCEL;
    this.speed -= this.speed * DRAG;
    if (this.speed < 0) this.speed = 0;
    if (this.speed > MAX_SPEED) this.speed = MAX_SPEED;
    this.angle += this.steer * TURN_RATE * Math.min(1, this.speed / 2);

    const px = this.x, py = this.y;
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    this.frames++;
    this.sinceCheckpoint++;

    if (track.crossesCheckpoint(this.next, px, py, this.x, this.y)) {
      this.checkpoints++;
      this.next = (this.next + 1) % this.trackSize;
      this.sinceCheckpoint = 0;
      if (this.checkpoints >= this.trackSize * maxLaps) {
        this.finished = true;
        this.alive = false;
        this.finishFrame = this.frames;
      }
    }

    this.#updatePoly();
    if (track.polygonHitsWall(this.poly)) {
      if (this.respawnOnCrash) this.#respawn(track);
      else { this.alive = false; this.crashed = true; }
    } else if (!this.respawnOnCrash && this.sinceCheckpoint > STALL_FRAMES) {
      this.alive = false;
    }
    this.fitness = this.#computeFitness();
  }

  /** Progress dominates; average pace breaks ties so faster drivers win. */
  #computeFitness() {
    const pace = this.checkpoints / Math.max(1, this.frames);
    return this.checkpoints + pace * 25 + (this.finished ? 50 : 0);
  }

  #respawn(track) {
    const i = (this.next - 1 + this.trackSize) % this.trackSize;
    const c = track.center[i], t = track.tangents[i];
    this.x = c[0];
    this.y = c[1];
    this.angle = Math.atan2(t[1], t[0]);
    this.speed = 0;
    this.#updatePoly();
  }

  #updatePoly() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const hl = CAR_LENGTH / 2, hw = CAR_WIDTH / 2;
    const p = this.poly;
    p[0] = this.x + c * hl - s * hw; p[1] = this.y + s * hl + c * hw;
    p[2] = this.x + c * hl + s * hw; p[3] = this.y + s * hl - c * hw;
    p[4] = this.x - c * hl + s * hw; p[5] = this.y - s * hl - c * hw;
    p[6] = this.x - c * hl - s * hw; p[7] = this.y - s * hl + c * hw;
  }
}
