// Genetic algorithm over network weights: elitism + tournament selection,
// uniform crossover and gaussian mutation.

import { NeuralNetwork, gaussian } from "./nn.js";
import { Car, INPUT_COUNT, OUTPUT_COUNT } from "./car.js";

export const LAYERS = [INPUT_COUNT, 10, 6, OUTPUT_COUNT];

const TOURNAMENT_SIZE = 4;

export class Population {
  constructor(size, seedBrain = null) {
    this.generation = 1;
    this.history = [];
    this.bestEver = null;
    this.bestEverFitness = -Infinity;
    this.bestEverGeneration = 0;
    this.cars = [];
    for (let i = 0; i < size; i++) {
      let brain;
      if (seedBrain) {
        brain = seedBrain.clone();
        if (i > 0) mutate(brain, 0.15, 0.3);
      } else {
        brain = new NeuralNetwork(LAYERS);
      }
      this.cars.push(new Car(brain));
    }
  }

  reset(track) {
    for (const car of this.cars) car.reset(track);
  }

  evolve({ size, mutationRate, mutationStrength, elitism }) {
    const ranked = this.cars.slice().sort((a, b) => b.fitness - a.fitness);
    const best = ranked[0];
    const avg = ranked.reduce((s, c) => s + c.fitness, 0) / ranked.length;
    this.history.push({
      generation: this.generation,
      best: best.fitness,
      avg,
      laps: best.laps,
    });

    if (best.fitness > this.bestEverFitness) {
      this.bestEverFitness = best.fitness;
      this.bestEver = best.brain.clone();
      this.bestEverGeneration = this.generation;
    }

    const next = [];
    for (let i = 0; i < Math.min(elitism, ranked.length, size); i++) {
      next.push(new Car(ranked[i].brain.clone()));
    }
    while (next.length < size) {
      const a = tournament(ranked), b = tournament(ranked);
      const child = crossover(a.brain, b.brain);
      mutate(child, mutationRate, mutationStrength);
      next.push(new Car(child));
    }
    this.cars = next;
    this.generation++;
  }
}

function tournament(ranked) {
  let best = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const c = ranked[(Math.random() * ranked.length) | 0];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best;
}

function crossover(a, b) {
  const child = a.clone();
  const wa = a.weights, wb = b.weights, wc = child.weights;
  for (let i = 0; i < wc.length; i++) wc[i] = Math.random() < 0.5 ? wa[i] : wb[i];
  return child;
}

export function mutate(nn, rate, strength) {
  const w = nn.weights;
  for (let i = 0; i < w.length; i++) {
    if (Math.random() < rate) w[i] += gaussian() * strength;
  }
}
