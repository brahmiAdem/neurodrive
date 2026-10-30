// Tiny fully-connected feed-forward network with tanh activations.
// Weights live in one flat Float32Array so they are cheap to clone, mutate and serialize.
// Layout per layer: for each output neuron -> [bias, w_in0, w_in1, ...]

export function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class NeuralNetwork {
  constructor(layers, weights) {
    this.layers = layers.slice();
    this.offsets = [];
    let size = 0;
    for (let l = 0; l < layers.length - 1; l++) {
      this.offsets.push(size);
      size += (layers[l] + 1) * layers[l + 1];
    }
    this.size = size;
    this.weights = weights ? Float32Array.from(weights) : this.#randomWeights();
    this.activations = layers.map((n) => new Float32Array(n));
  }

  #randomWeights() {
    const w = new Float32Array(this.size);
    for (let l = 0; l < this.layers.length - 1; l++) {
      const nIn = this.layers[l], nOut = this.layers[l + 1];
      const scale = 1 / Math.sqrt(nIn);
      let o = this.offsets[l];
      for (let j = 0; j < nOut; j++) {
        w[o++] = gaussian() * 0.1;
        for (let i = 0; i < nIn; i++) w[o++] = gaussian() * scale;
      }
    }
    return w;
  }

  forward(input) {
    const acts = this.activations;
    acts[0].set(input);
    const w = this.weights;
    for (let l = 0; l < this.layers.length - 1; l++) {
      const prev = acts[l], next = acts[l + 1];
      const nIn = this.layers[l];
      let o = this.offsets[l];
      for (let j = 0; j < next.length; j++) {
        let sum = w[o++];
        for (let i = 0; i < nIn; i++) sum += w[o++] * prev[i];
        next[j] = Math.tanh(sum);
      }
    }
    return acts[acts.length - 1];
  }

  /** Weight of the connection from neuron i in layer l to neuron j in layer l+1. */
  weight(l, i, j) {
    return this.weights[this.offsets[l] + j * (this.layers[l] + 1) + 1 + i];
  }

  clone() {
    return new NeuralNetwork(this.layers, this.weights);
  }

  toJSON() {
    return { layers: this.layers, weights: Array.from(this.weights) };
  }

  static fromJSON(data) {
    if (!data || !Array.isArray(data.layers) || !Array.isArray(data.weights)) {
      throw new Error("Invalid brain file");
    }
    const nn = new NeuralNetwork(data.layers);
    if (nn.size !== data.weights.length) throw new Error("Brain shape mismatch");
    nn.weights.set(data.weights);
    return nn;
  }
}
