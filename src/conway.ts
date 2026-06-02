// Conway's Game of Life on a toroidal (wrap-around) grid.
//
// Pure module: every function operates on plain Uint8Array grids and never
// touches the DOM or canvas. Cells are 0 (dead) or 1 (alive). The grid is
// row-major: index = y * w + x.

/** Allocate a zeroed grid of the given size. */
export function makeGrid(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

/** Read a cell with toroidal wrapping, so neighbours wrap at every edge. */
export function get(grid: Uint8Array, w: number, h: number, x: number, y: number): number {
  const xx = ((x % w) + w) % w;
  const yy = ((y % h) + h) % h;
  return grid[yy * w + xx] ?? 0;
}

/** Count the 8 Moore neighbours of (x, y), wrapping at the torus edges. */
export function neighborCount(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      n += get(grid, w, h, x + dx, y + dy);
    }
  }
  return n;
}

/**
 * Advance one generation using the standard B3/S23 rule.
 *
 * Returns a fresh grid (the input is never mutated), which makes the function
 * trivially testable. The UI layer double-buffers by swapping two grids and
 * passing an optional `out` buffer to avoid per-frame allocation.
 */
export function step(grid: Uint8Array, w: number, h: number, out?: Uint8Array): Uint8Array {
  const next = out && out.length === grid.length ? out : new Uint8Array(grid.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const alive = grid[i] === 1;
      const n = neighborCount(grid, w, h, x, y);
      // Birth on exactly 3 neighbours; survival on 2 or 3; death otherwise.
      next[i] = n === 3 || (alive && n === 2) ? 1 : 0;
    }
  }
  return next;
}

/** Count living cells — handy for tests and the live population readout. */
export function population(grid: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i] ?? 0;
  return n;
}

/** Fill the grid randomly; `density` in [0,1] is the probability a cell is alive. */
export function randomize(
  grid: Uint8Array,
  density: number,
  rnd: () => number = Math.random,
): Uint8Array {
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() < density ? 1 : 0;
  return grid;
}

/** A named pattern as a list of live-cell offsets, relative to its top-left. */
export type Pattern = { name: string; cells: ReadonlyArray<readonly [number, number]> };

export const PATTERNS: Record<string, Pattern> = {
  glider: {
    name: "Glider",
    cells: [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
  blinker: {
    name: "Blinker",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  },
  block: {
    name: "Block",
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
};

/** Stamp a pattern onto the grid at (ox, oy), wrapping on the torus. */
export function stamp(
  grid: Uint8Array,
  w: number,
  h: number,
  pattern: Pattern,
  ox: number,
  oy: number,
): Uint8Array {
  for (const [dx, dy] of pattern.cells) {
    const x = (((ox + dx) % w) + w) % w;
    const y = (((oy + dy) % h) + h) % h;
    grid[y * w + x] = 1;
  }
  return grid;
}
