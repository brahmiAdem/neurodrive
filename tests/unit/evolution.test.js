import { test } from "node:test";
import assert from "node:assert/strict";
import { Population, LAYERS, mutate } from "../../js/evolution.js";
import { NeuralNetwork } from "../../js/nn.js";

const PARAMS = { size: 20, mutationRate: 0.1, mutationStrength: 0.4, elitism: 3 };

function scored(pop) {
  pop.cars.forEach((car, i) => { car.fitness = i; });
  return pop;
}

test("population creates the requested number of cars", () => {
  const pop = new Population(20);
  assert.equal(pop.cars.length, 20);
  assert.deepEqual(pop.cars[0].brain.layers, LAYERS);
});

test("evolve advances the generation and records history", () => {
  const pop = scored(new Population(20));
  pop.evolve(PARAMS);
  assert.equal(pop.generation, 2);
  assert.equal(pop.history.length, 1);
  assert.equal(pop.history[0].best, 19);
  assert.equal(pop.history[0].avg, 9.5);
});

test("elites survive unchanged and the best brain is remembered", () => {
  const pop = scored(new Population(20));
  const best = Array.from(pop.cars[19].brain.weights);
  pop.evolve(PARAMS);
  assert.deepEqual(Array.from(pop.cars[0].brain.weights), best);
  assert.deepEqual(Array.from(pop.bestEver.weights), best);
  assert.equal(pop.bestEverFitness, 19);
});

test("evolve respects a new population size", () => {
  const pop = scored(new Population(20));
  pop.evolve({ ...PARAMS, size: 35 });
  assert.equal(pop.cars.length, 35);
});

test("seeded population starts from the seed brain", () => {
  const seed = new NeuralNetwork(LAYERS);
  const pop = new Population(10, seed);
  assert.deepEqual(Array.from(pop.cars[0].brain.weights), Array.from(seed.weights));
});

test("mutation rate 0 changes nothing, rate 1 changes everything", () => {
  const nn = new NeuralNetwork(LAYERS);
  const before = Array.from(nn.weights);
  mutate(nn, 0, 1);
  assert.deepEqual(Array.from(nn.weights), before);
  mutate(nn, 1, 1);
  const changed = Array.from(nn.weights).filter((w, i) => w !== before[i]).length;
  assert.equal(changed, before.length);
});
