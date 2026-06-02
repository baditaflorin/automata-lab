// Gray-Scott reaction-diffusion.
//
// Pure module operating on two Float32Array concentration fields, A and B,
// over a toroidal grid (index = y * w + x). One `step()` advances a single
// Euler iteration of the classic Gray-Scott equations:
//
//   A' = A + (dA * lapA  - A*B^2 + feed*(1 - A))      * dt
//   B' = B + (dB * lapB  + A*B^2 - (kill + feed)*B)   * dt
//
// The Laplacian uses the standard 3x3 stencil (orthogonal 0.2, diagonal 0.05,
// centre -1), which is the convention used by most Gray-Scott references.

export type GSParams = {
  feed: number;
  kill: number;
  dA: number;
  dB: number;
  /** Time step. 1.0 is the usual reference value and stays stable. */
  dt: number;
};

export type GSField = { A: Float32Array; B: Float32Array };

/** Allocate a field with A=1, B=0 everywhere (the standard quiescent state). */
export function makeField(w: number, h: number): GSField {
  const A = new Float32Array(w * h);
  const B = new Float32Array(w * h);
  A.fill(1);
  return { A, B };
}

/** Laplacian of `f` at (x, y) with toroidal wrapping, 3x3 weighted stencil. */
export function laplacian(f: Float32Array, w: number, h: number, x: number, y: number): number {
  const xm = (x - 1 + w) % w;
  const xp = (x + 1) % w;
  const ym = (y - 1 + h) % h;
  const yp = (y + 1) % h;

  const c = f[y * w + x] ?? 0;
  const left = f[y * w + xm] ?? 0;
  const right = f[y * w + xp] ?? 0;
  const up = f[ym * w + x] ?? 0;
  const down = f[yp * w + x] ?? 0;
  const ul = f[ym * w + xm] ?? 0;
  const ur = f[ym * w + xp] ?? 0;
  const dl = f[yp * w + xm] ?? 0;
  const dr = f[yp * w + xp] ?? 0;

  return (left + right + up + down) * 0.2 + (ul + ur + dl + dr) * 0.05 - c;
}

/**
 * Advance one Gray-Scott iteration. Writes into `out` (double-buffer) if given,
 * otherwise allocates fresh arrays. The input field is never mutated, so the
 * function is deterministic and easy to test.
 */
export function step(field: GSField, p: GSParams, w: number, h: number, out?: GSField): GSField {
  const { A, B } = field;
  const nA = out?.A && out.A.length === A.length ? out.A : new Float32Array(A.length);
  const nB = out?.B && out.B.length === B.length ? out.B : new Float32Array(B.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = A[i] ?? 0;
      const b = B[i] ?? 0;
      const reaction = a * b * b;
      const lapA = laplacian(A, w, h, x, y);
      const lapB = laplacian(B, w, h, x, y);

      let na = a + (p.dA * lapA - reaction + p.feed * (1 - a)) * p.dt;
      let nb = b + (p.dB * lapB + reaction - (p.kill + p.feed) * b) * p.dt;

      // Concentrations are physically bounded to [0, 1]; clamping also keeps
      // the explicit Euler scheme from drifting to NaN on extreme parameters.
      na = na < 0 ? 0 : na > 1 ? 1 : na;
      nb = nb < 0 ? 0 : nb > 1 ? 1 : nb;

      nA[i] = na;
      nB[i] = nb;
    }
  }
  return { A: nA, B: nB };
}

/** Seed a filled square of B (and depleted A) — a "splat" the reaction grows from. */
export function seedRect(
  field: GSField,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): GSField {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const xx = ((x % w) + w) % w;
      const yy = ((y % h) + h) % h;
      const i = yy * w + xx;
      field.A[i] = 0;
      field.B[i] = 1;
    }
  }
  return field;
}

/** Scatter a number of random B splats to kick-start an empty field. */
export function randomSeed(
  field: GSField,
  w: number,
  h: number,
  splats: number,
  r: number,
  rnd: () => number = Math.random,
): GSField {
  for (let s = 0; s < splats; s++) {
    const cx = Math.floor(rnd() * w);
    const cy = Math.floor(rnd() * h);
    seedRect(field, w, h, cx, cy, r);
  }
  return field;
}

/** Named feed/kill regimes that produce recognisable patterns. */
export const PRESETS: Record<string, GSParams> = {
  coral: { feed: 0.0545, kill: 0.062, dA: 1.0, dB: 0.5, dt: 1.0 },
  mitosis: { feed: 0.0367, kill: 0.0649, dA: 1.0, dB: 0.5, dt: 1.0 },
  spots: { feed: 0.03, kill: 0.062, dA: 1.0, dB: 0.5, dt: 1.0 },
  stripes: { feed: 0.022, kill: 0.051, dA: 1.0, dB: 0.5, dt: 1.0 },
};
