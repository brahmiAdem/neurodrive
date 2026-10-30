import { test } from "node:test";
import assert from "node:assert/strict";
import { NeuralNetwork } from "../../js/nn.js";

const LAYERS = [8, 10, 6, 2];

test("parameter count matches (inputs + bias) * outputs per layer", () => {
  const nn = new NeuralNetwork(LAYERS);
  assert.equal(nn.size, (8 + 1) * 10 + (10 + 1) * 6 + (6 + 1) * 2);
  assert.equal(nn.weights.length, nn.size);
});

test("forward pass returns outputs bounded by tanh", () => {
  const nn = new NeuralNetwork(LAYERS);
  const out = nn.forward(new Float32Array(8).fill(1));
  assert.equal(out.length, 2);
  for (const v of out) assert.ok(v >= -1 && v <= 1);
});

test("forward pass is deterministic for the same weights", () => {
  const nn = new NeuralNetwork(LAYERS);
  const input = Float32Array.from([0.1, 0.5, 0.9, 0, 0.3, 0.7, 1, 0.2]);
  const a = Array.from(nn.forward(input));
  const b = Array.from(nn.clone().forward(input));
  assert.deepEqual(a, b);
});

test("weight(l, i, j) reads the matching flat weight", () => {
  const nn = new NeuralNetwork([2, 1]);
  nn.weights.set([0.5, 2, -3]); // bias, w0, w1
  assert.equal(nn.weight(0, 0, 0), 2);
  assert.equal(nn.weight(0, 1, 0), -3);
  const out = nn.forward([1, 1]);
  assert.ok(Math.abs(out[0] - Math.tanh(0.5 + 2 - 3)) < 1e-6);
});

test("clone is independent of the original", () => {
  const nn = new NeuralNetwork(LAYERS);
  const copy = nn.clone();
  copy.weights[0] += 10;
  assert.notEqual(copy.weights[0], nn.weights[0]);
});

test("JSON round-trip preserves the network", () => {
  const nn = new NeuralNetwork(LAYERS);
  const restored = NeuralNetwork.fromJSON(JSON.parse(JSON.stringify(nn)));
  assert.deepEqual(restored.layers, LAYERS);
  assert.deepEqual(Array.from(restored.weights), Array.from(nn.weights));
});

test("fromJSON rejects malformed or mismatched data", () => {
  assert.throws(() => NeuralNetwork.fromJSON(null), /Invalid/);
  assert.throws(() => NeuralNetwork.fromJSON({ layers: [2, 1], weights: [1, 2] }), /mismatch/);
});
