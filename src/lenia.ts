// Lenia — a smooth, continuous generalisation of Conway's Life (Bert Chan, 2018).
//
// The world is a Float32Array in [0,1] on a toroidal grid. Each step convolves
// the world with a smooth radial "ring" kernel, maps the local neighbourhood
// sum through a Gaussian growth function, and integrates with a small dt:
//
//   U = K * world           (toroidal convolution, K normalised to sum 1)
//   world' = clamp(world + dt * growth(U), 0, 1)
//
// This file is pure (no DOM/canvas). The default parameters are the classic
// "Orbium" glider settings, which produce a stable, gliding lifeform.

export type LeniaParams = {
  /** Kernel radius in cells. */
  R: number;
  /** Time step (1/T). Smaller is smoother and more stable. */
  dt: number;
  /** Growth centre (mu) and width (sigma) of the Gaussian growth function. */
  mu: number;
  sigma: number;
};

// Orbium defaults — a well-known stable Lenia glider.
export const ORBIUM: LeniaParams = { R: 13, dt: 0.1, mu: 0.15, sigma: 0.017 };

/** A smooth bell-shaped kernel core: exp(-(r-0.5)^2 / (2*0.15^2)). */
function kernelShell(r: number): number {
  const a = 0.5;
  const w = 0.15;
  const d = (r - a) / w;
  return Math.exp(-(d * d) / 2);
}

/**
 * Build a normalised radial kernel of integer radius R.
 *
 * Returns the square weight matrix (size = 2R+1) flattened row-major together
 * with its side length. Weights sum to 1, so the convolution is an average.
 */
export function makeKernel(R: number): { weights: Float32Array; size: number } {
  const size = 2 * R + 1;
  const weights = new Float32Array(size * size);
  let sum = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - R;
      const dy = j - R;
      const r = Math.sqrt(dx * dx + dy * dy) / R; // normalised radius in [0, ~1.41]
      const v = r <= 1 ? kernelShell(r) : 0;
      weights[j * size + i] = v;
      sum += v;
    }
  }
  if (sum > 0) {
    for (let k = 0; k < weights.length; k++) weights[k]! /= sum;
  }
  return { weights, size };
}

/** Gaussian growth mapping, output in [-1, 1]: 2*exp(-(u-mu)^2/(2 sigma^2)) - 1. */
export function growth(u: number, mu: number, sigma: number): number {
  const d = (u - mu) / sigma;
  return 2 * Math.exp(-(d * d) / 2) - 1;
}

/** Allocate a zeroed world. */
export function makeWorld(w: number, h: number): Float32Array {
  return new Float32Array(w * h);
}

/**
 * Advance one Lenia step.
 *
 * `kernel`/`size` come from {@link makeKernel} (precompute once and reuse). The
 * world is never mutated; the next state is written into `out` if provided.
 * Convolution wraps toroidally.
 */
export function step(
  world: Float32Array,
  w: number,
  h: number,
  kernel: Float32Array,
  size: number,
  p: LeniaParams,
  out?: Float32Array,
): Float32Array {
  const next = out && out.length === world.length ? out : new Float32Array(world.length);
  const R = (size - 1) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let u = 0;
      for (let kj = 0; kj < size; kj++) {
        const yy = (((y + kj - R) % h) + h) % h;
        const rowBase = yy * w;
        const kBase = kj * size;
        for (let ki = 0; ki < size; ki++) {
          const wgt = kernel[kBase + ki]!;
          if (wgt === 0) continue;
          const xx = (((x + ki - R) % w) + w) % w;
          u += wgt * (world[rowBase + xx] ?? 0);
        }
      }
      const v = (world[y * w + x] ?? 0) + p.dt * growth(u, p.mu, p.sigma);
      next[y * w + x] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  return next;
}

/** Total mass (sum of all cells) — used by tests and the live readout. */
export function mass(world: Float32Array): number {
  let s = 0;
  for (let i = 0; i < world.length; i++) s += world[i] ?? 0;
  return s;
}

/**
 * The canonical Orbium glider pattern (a 20x20 cell, values in [0,1]).
 * Stamped into the world it produces a smooth lifeform that glides.
 * Source: Bert Chan's Lenia reference (rounded to 2 decimals).
 */
// prettier-ignore
const ORBIUM_CELLS: number[][] = [
  [0,0,0,0,0,0,0.1,0.14,0.1,0,0,0.03,0.03,0,0,0.3,0,0,0,0],
  [0,0,0,0,0,0.08,0.24,0.3,0.3,0.18,0.14,0.15,0.16,0.15,0.09,0.2,0,0,0,0],
  [0,0,0,0,0,0.15,0.34,0.44,0.46,0.38,0.18,0.14,0.11,0.13,0.19,0.18,0.45,0,0,0],
  [0,0,0,0,0.06,0.13,0.39,0.5,0.5,0.37,0.06,0,0,0,0.02,0.16,0.68,0,0,0],
  [0,0,0,0.11,0.17,0.17,0.33,0.4,0.38,0.28,0.14,0,0,0,0,0,0.18,0.42,0,0],
  [0,0,0.09,0.18,0.13,0.06,0.08,0.26,0.32,0.32,0.27,0,0,0,0,0,0,0.82,0,0],
  [0.27,0,0.16,0.12,0,0,0,0.25,0.38,0.44,0.45,0.34,0,0,0,0,0,0.22,0.17,0],
  [0,0.07,0.2,0.02,0,0,0,0.31,0.48,0.57,0.6,0.57,0,0,0,0,0,0,0.49,0],
  [0,0.59,0.19,0,0,0,0,0.2,0.57,0.69,0.76,0.76,0.49,0,0,0,0,0,0.36,0],
  [0,0.58,0.19,0,0,0,0,0,0.67,0.83,0.9,0.92,0.87,0.12,0,0,0,0,0.22,0.07],
  [0,0,0.46,0,0,0,0,0,0.7,0.93,1,1,1,0.61,0,0,0,0,0.18,0.11],
  [0,0,0.82,0,0,0,0,0,0.47,1,1,0.98,1,0.96,0.27,0,0,0,0.19,0.1],
  [0,0,0.46,0,0,0,0,0,0.25,1,1,0.84,0.92,0.97,0.54,0.14,0.04,0.1,0.21,0.05],
  [0,0,0,0.4,0,0,0,0,0.09,0.8,1,0.82,0.8,0.85,0.63,0.31,0.18,0.19,0.2,0.01],
  [0,0,0,0.36,0.1,0,0,0,0.05,0.54,0.86,0.79,0.74,0.72,0.6,0.39,0.28,0.24,0.13,0],
  [0,0,0,0.01,0.3,0.07,0,0,0.08,0.36,0.64,0.7,0.64,0.6,0.51,0.39,0.29,0.19,0.04,0],
  [0,0,0,0,0.1,0.24,0.14,0.1,0.15,0.29,0.45,0.53,0.52,0.46,0.4,0.31,0.21,0.08,0,0],
  [0,0,0,0,0,0.08,0.21,0.21,0.22,0.29,0.36,0.39,0.37,0.33,0.26,0.18,0.09,0,0,0],
  [0,0,0,0,0,0,0.03,0.13,0.19,0.22,0.24,0.24,0.23,0.18,0.13,0.05,0,0,0,0],
  [0,0,0,0,0,0,0,0,0.02,0.06,0.08,0.09,0.07,0.05,0.01,0,0,0,0,0],
];

/** Stamp the Orbium glider into the world at (ox, oy), wrapping toroidally. */
export function seedOrbium(
  world: Float32Array,
  w: number,
  h: number,
  ox: number,
  oy: number,
): void {
  for (let j = 0; j < ORBIUM_CELLS.length; j++) {
    const row = ORBIUM_CELLS[j]!;
    for (let i = 0; i < row.length; i++) {
      const x = (((ox + i) % w) + w) % w;
      const y = (((oy + j) % h) + h) % h;
      world[y * w + x] = row[i]!;
    }
  }
}

/** Paint a soft Gaussian blob of "life" at (cx, cy) — used by pointer seeding. */
export function seedBlob(
  world: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const xx = ((x % w) + w) % w;
      const yy = ((y % h) + h) % h;
      const v = Math.exp(-d2 / (2 * (r / 2) * (r / 2)));
      const i = yy * w + xx;
      world[i] = Math.min(1, (world[i] ?? 0) + v);
    }
  }
}
