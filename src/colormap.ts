// Tiny colour-ramp helpers: map a scalar in [0,1] to an RGB triple.
//
// Pure functions returning [r, g, b] in 0..255, so they can be unit-tested and
// reused by both the canvas renderers (writing into ImageData) without DOM.

export type RGB = [number, number, number];
export type ColorRamp = (t: number) => RGB;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly interpolate through a list of RGB stops. */
function ramp(stops: RGB[]): ColorRamp {
  const n = stops.length - 1;
  return (t: number): RGB => {
    const x = clamp01(t) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    const a = stops[i]!;
    const b = stops[i + 1]!;
    return [
      Math.round(lerp(a[0], b[0], f)),
      Math.round(lerp(a[1], b[1], f)),
      Math.round(lerp(a[2], b[2], f)),
    ];
  };
}

export type Ramp = { id: string; name: string; fn: ColorRamp };

export const RAMPS: Ramp[] = [
  {
    id: "inferno",
    name: "Inferno",
    fn: ramp([
      [0, 0, 4],
      [40, 11, 84],
      [101, 21, 110],
      [159, 42, 99],
      [212, 72, 66],
      [245, 125, 21],
      [250, 193, 39],
      [252, 255, 164],
    ]),
  },
  {
    id: "viridis",
    name: "Viridis",
    fn: ramp([
      [68, 1, 84],
      [59, 82, 139],
      [33, 145, 140],
      [94, 201, 98],
      [253, 231, 37],
    ]),
  },
  {
    id: "ice",
    name: "Ice",
    fn: ramp([
      [3, 5, 24],
      [12, 44, 92],
      [32, 107, 168],
      [120, 198, 224],
      [240, 252, 255],
    ]),
  },
  {
    id: "ember",
    name: "Ember",
    fn: ramp([
      [8, 4, 4],
      [70, 12, 10],
      [160, 36, 18],
      [232, 104, 28],
      [255, 214, 120],
    ]),
  },
  {
    id: "mono",
    name: "Mono",
    fn: ramp([
      [6, 6, 10],
      [255, 255, 255],
    ]),
  },
];

export function rampById(id: string): Ramp {
  return RAMPS.find((r) => r.id === id) ?? RAMPS[0]!;
}
