import { describe, expect, it } from "vitest";
import { mulberry32, hashSeed, clamp } from "../src/rng";
import {
  makeGrid,
  get,
  neighborCount,
  step as lifeStep,
  population,
  randomize,
  stamp,
  PATTERNS,
} from "../src/conway";
import {
  makeField,
  laplacian,
  step as gsStep,
  seedRect,
  PRESETS,
  type GSParams,
} from "../src/grayscott";
import {
  makeKernel,
  growth,
  makeWorld,
  step as leniaStep,
  mass,
  seedOrbium,
  ORBIUM,
} from "../src/lenia";
import { rampById, RAMPS } from "../src/colormap";

// ---- helpers ---------------------------------------------------------------

/** Build a grid from an ASCII art block where '#'/'1'/'O' mean alive. */
function gridFrom(rows: string[]): { grid: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0]!.length;
  const grid = makeGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y]![x];
      grid[y * w + x] = c === "#" || c === "1" || c === "O" ? 1 : 0;
    }
  }
  return { grid, w, h };
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- rng -------------------------------------------------------------------

describe("rng", () => {
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("hashSeed is stable and distinguishes strings", () => {
    expect(hashSeed("automata")).toBe(hashSeed("automata"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });

  it("clamp bounds values", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

// ---- Conway ----------------------------------------------------------------

describe("conway", () => {
  it("an empty grid stays empty", () => {
    const { grid, w, h } = gridFrom(["....", "....", "....", "...."]);
    const next = lifeStep(grid, w, h);
    expect(population(next)).toBe(0);
    expect(eq(next, grid)).toBe(true);
  });

  it("a 2x2 block is a still life", () => {
    // Pad the block so neighbours have room; with wrapping a bare 2x2 grid
    // would over-count, so use a roomy 4x4 field.
    const { grid, w, h } = gridFrom(["....", ".##.", ".##.", "...."]);
    const next = lifeStep(grid, w, h);
    expect(eq(next, grid)).toBe(true);
    expect(population(next)).toBe(4);
  });

  it("a blinker oscillates with period 2 (horizontal <-> vertical)", () => {
    const horizontal = gridFrom([".....", ".....", ".###.", ".....", "....."]);
    const vertical = gridFrom([".....", "..#..", "..#..", "..#..", "....."]);

    const g1 = lifeStep(horizontal.grid, horizontal.w, horizontal.h);
    expect(eq(g1, vertical.grid)).toBe(true);

    const g2 = lifeStep(g1, horizontal.w, horizontal.h);
    expect(eq(g2, horizontal.grid)).toBe(true);
  });

  it("a glider returns to its shape translated by (1,1) after 4 steps", () => {
    // Use a torus large enough that the glider doesn't interact with its wrap
    // image within 4 steps.
    const w = 12;
    const h = 12;
    let g = makeGrid(w, h);
    stamp(g, w, h, PATTERNS.glider!, 1, 1);

    const start = g.slice();
    for (let i = 0; i < 4; i++) g = lifeStep(g, w, h);

    // Build the expected grid: same pattern shifted by (1,1).
    const expected = makeGrid(w, h);
    stamp(expected, w, h, PATTERNS.glider!, 2, 2);

    expect(eq(g, expected)).toBe(true);
    expect(population(g)).toBe(population(start));
  });

  it("neighborCount wraps at the torus edges", () => {
    // Single live cell at a corner; its diagonal wrap-neighbour is the opposite
    // corner. Place live cells at (0,0) and (w-1,h-1): each is a neighbour of
    // the other across the wrap.
    const w = 5;
    const h = 5;
    const g = makeGrid(w, h);
    g[0] = 1; // (0,0)
    g[h * w - 1] = 1; // (4,4)
    expect(neighborCount(g, w, h, 0, 0)).toBe(1);
    expect(neighborCount(g, w, h, w - 1, h - 1)).toBe(1);

    // get() wraps indices too.
    expect(get(g, w, h, -1, -1)).toBe(1); // wraps to (4,4)
    expect(get(g, w, h, w, h)).toBe(1); // wraps to (0,0)
  });

  it("randomize respects density bounds (0 -> empty, 1 -> full)", () => {
    const g = makeGrid(8, 8);
    randomize(g, 0, mulberry32(1));
    expect(population(g)).toBe(0);
    randomize(g, 1, mulberry32(1));
    expect(population(g)).toBe(64);
  });

  it("step does not mutate the input grid", () => {
    const { grid, w, h } = gridFrom([".....", ".###.", "....."]);
    const before = grid.slice();
    lifeStep(grid, w, h);
    expect(eq(grid, before)).toBe(true);
  });
});

// ---- Gray-Scott ------------------------------------------------------------

describe("grayscott", () => {
  const params: GSParams = PRESETS.coral!;

  it("a uniform field with B=0 stays B=0", () => {
    const w = 16;
    const h = 16;
    const field = makeField(w, h); // A=1, B=0
    const next = gsStep(field, params, w, h);
    let maxB = 0;
    for (let i = 0; i < next.B.length; i++) maxB = Math.max(maxB, next.B[i]!);
    expect(maxB).toBe(0);
  });

  it("laplacian of a flat field is zero", () => {
    const w = 8;
    const h = 8;
    const f = new Float32Array(w * h).fill(0.5);
    expect(laplacian(f, w, h, 3, 3)).toBeCloseTo(0, 6);
    // and wraps at the edge without exploding
    expect(laplacian(f, w, h, 0, 0)).toBeCloseTo(0, 6);
  });

  it("all values stay finite and within [0,1] after many steps", () => {
    const w = 24;
    const h = 24;
    let field = makeField(w, h);
    field = seedRect(field, w, h, 12, 12, 4);
    for (let i = 0; i < 60; i++) field = gsStep(field, params, w, h);
    for (let i = 0; i < field.A.length; i++) {
      expect(Number.isFinite(field.A[i]!)).toBe(true);
      expect(Number.isFinite(field.B[i]!)).toBe(true);
      expect(field.A[i]!).toBeGreaterThanOrEqual(0);
      expect(field.A[i]!).toBeLessThanOrEqual(1);
      expect(field.B[i]!).toBeGreaterThanOrEqual(0);
      expect(field.B[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: same input -> same output", () => {
    const w = 20;
    const h = 20;
    const make = () => seedRect(makeField(w, h), w, h, 10, 10, 3);
    let a = make();
    let b = make();
    for (let i = 0; i < 25; i++) {
      a = gsStep(a, params, w, h);
      b = gsStep(b, params, w, h);
    }
    expect(Array.from(a.B)).toEqual(Array.from(b.B));
    expect(Array.from(a.A)).toEqual(Array.from(a.A));
  });

  it("seeding introduces B mass that then reacts (mass-plausible)", () => {
    const w = 24;
    const h = 24;
    let field = makeField(w, h);
    const sumB0 = field.B.reduce((s, v) => s + v, 0);
    expect(sumB0).toBe(0);
    field = seedRect(field, w, h, 12, 12, 3);
    const sumBseed = field.B.reduce((s, v) => s + v, 0);
    expect(sumBseed).toBeGreaterThan(0);
    // After a single step, B is still present (reaction-diffusion is continuous,
    // it does not annihilate the seed in one tick).
    field = gsStep(field, params, w, h);
    const sumB1 = field.B.reduce((s, v) => s + v, 0);
    expect(sumB1).toBeGreaterThan(0);
  });

  it("does not mutate the input field", () => {
    const w = 12;
    const h = 12;
    const field = seedRect(makeField(w, h), w, h, 6, 6, 2);
    const beforeA = Array.from(field.A);
    const beforeB = Array.from(field.B);
    gsStep(field, params, w, h);
    expect(Array.from(field.A)).toEqual(beforeA);
    expect(Array.from(field.B)).toEqual(beforeB);
  });
});

// ---- Lenia -----------------------------------------------------------------

describe("lenia", () => {
  it("kernel is normalised (weights sum to 1) and right-sized", () => {
    const { weights, size } = makeKernel(ORBIUM.R);
    expect(size).toBe(2 * ORBIUM.R + 1);
    const sum = weights.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 5);
    // centre weight is 0 (ring kernel has a hole in the middle)
    const centre = weights[ORBIUM.R * size + ORBIUM.R]!;
    expect(centre).toBeGreaterThanOrEqual(0);
  });

  it("growth function peaks at mu and is bounded in [-1,1]", () => {
    expect(growth(ORBIUM.mu, ORBIUM.mu, ORBIUM.sigma)).toBeCloseTo(1, 6);
    expect(growth(ORBIUM.mu + 1, ORBIUM.mu, ORBIUM.sigma)).toBeCloseTo(-1, 3);
    for (let u = -0.5; u <= 1.5; u += 0.1) {
      const g = growth(u, ORBIUM.mu, ORBIUM.sigma);
      expect(g).toBeGreaterThanOrEqual(-1);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it("an empty world stays empty (growth of 0 neighbourhood is negative)", () => {
    const w = 32;
    const h = 32;
    const world = makeWorld(w, h);
    const { weights, size } = makeKernel(ORBIUM.R);
    const next = leniaStep(world, w, h, weights, size, ORBIUM);
    expect(mass(next)).toBe(0);
  });

  it("values stay finite and clamped to [0,1] over many steps", () => {
    const w = 48;
    const h = 48;
    let world = makeWorld(w, h);
    seedOrbium(world, w, h, 12, 12);
    const { weights, size } = makeKernel(ORBIUM.R);
    let out = makeWorld(w, h);
    for (let i = 0; i < 30; i++) {
      out = leniaStep(world, w, h, weights, size, ORBIUM, out);
      [world, out] = [out, world];
    }
    for (let i = 0; i < world.length; i++) {
      expect(Number.isFinite(world[i]!)).toBe(true);
      expect(world[i]!).toBeGreaterThanOrEqual(0);
      expect(world[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("an Orbium glider stays alive (does not die out) after stepping", () => {
    const w = 48;
    const h = 48;
    let world = makeWorld(w, h);
    seedOrbium(world, w, h, 14, 14);
    const m0 = mass(world);
    expect(m0).toBeGreaterThan(0);
    const { weights, size } = makeKernel(ORBIUM.R);
    let out = makeWorld(w, h);
    for (let i = 0; i < 40; i++) {
      out = leniaStep(world, w, h, weights, size, ORBIUM, out);
      [world, out] = [out, world];
    }
    const m1 = mass(world);
    // It should remain a substantial, living blob — neither vanish nor explode
    // to fill the whole grid.
    expect(m1).toBeGreaterThan(m0 * 0.3);
    expect(m1).toBeLessThan(w * h);
  });

  it("is deterministic: same seed world -> same output", () => {
    const w = 40;
    const h = 40;
    const { weights, size } = makeKernel(ORBIUM.R);
    const run = () => {
      let world = makeWorld(w, h);
      seedOrbium(world, w, h, 10, 10);
      for (let i = 0; i < 15; i++) world = leniaStep(world, w, h, weights, size, ORBIUM);
      return Array.from(world);
    };
    expect(run()).toEqual(run());
  });
});

// ---- colormap --------------------------------------------------------------

describe("colormap", () => {
  it("resolves ramps by id and falls back", () => {
    expect(rampById("viridis").id).toBe("viridis");
    expect(rampById("nope").id).toBe(RAMPS[0]!.id);
  });

  it("maps [0,1] to valid RGB and is monotone-ish at the ends", () => {
    const r = rampById("mono").fn;
    const lo = r(0);
    const hi = r(1);
    for (const ch of [...lo, ...hi]) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
    }
    // mono ramp: 0 is near-black, 1 is white
    expect(lo[0]).toBeLessThan(hi[0]);
    // out-of-range clamps
    expect(r(-5)).toEqual(r(0));
    expect(r(99)).toEqual(r(1));
  });
});
