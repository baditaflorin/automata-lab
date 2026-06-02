# automata-lab

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Fautomata--lab-5ef0c8)](https://baditaflorin.github.io/automata-lab/)
[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/baditaflorin/automata-lab/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> Conway's Game of Life, Gray-Scott reaction-diffusion, and Lenia — mesmerizing cellular automata that run entirely in your browser.

**Live → https://baditaflorin.github.io/automata-lab/**

Three classic continuous- and discrete-state automata in one canvas. Pick a model, play with the rules, draw into the world with your finger, and watch it come alive. No server, nothing leaves your device.

## The three models

- **Conway's Game of Life** — the discrete classic on a 160×120 toroidal grid (B3/S23). Play/pause, single-step, adjustable speed, randomize by density, clear, draw cells by dragging, and stamp a glider / blinker / block.
- **Reaction-Diffusion (Gray-Scott)** — two chemicals A and B diffusing and reacting on a 200×200 field. Tune feed, kill, and both diffusion rates; switch between **coral / mitosis / spots / stripes** presets; paint reagent with the pointer or drop a random splat. B is mapped through a colour ramp.
- **Lenia** — a smooth, continuous generalisation of Life (Bert Chan, 2018): a normalised ring kernel convolved with the world, fed through a Gaussian growth function. Ships with the **Orbium** glider — a stable lifeform that genuinely glides across the torus. Adjust growth μ/σ and the time step, or pour in random "soup".

Every model renders one device pixel per cell straight into an `ImageData` buffer via `requestAnimationFrame`, and **⬇ PNG** snapshots the canvas with `toBlob`.

## How it works

All of the simulation maths lives in **pure, unit-tested modules** that operate on plain typed arrays and never touch the DOM:

- `conway.ts` — toroidal `step()` (B3/S23), `neighborCount`, patterns, double-buffering.
- `grayscott.ts` — deterministic Euler `step(A, B, params)` with a 3×3 weighted Laplacian, presets, seeding.
- `lenia.ts` — `makeKernel` (normalised ring), `growth` (Gaussian), convolution `step`, the Orbium glider.
- `colormap.ts` — scalar → RGB ramps (inferno, viridis, ice, ember, mono).

`main.ts` is a thin wiring layer: canvas sizing, the rAF loop, pointer drawing, and control wiring. Because the heart is pure, it is covered by `tests/core.test.ts` — a blinker oscillates with period 2, a block is a still life, a glider translates by (1,1) every 4 steps, Gray-Scott stays finite and deterministic, and the Lenia Orbium stays alive.

## Run it locally

```bash
git clone https://github.com/baditaflorin/automata-lab
cd automata-lab
npm install
npm run dev      # http://127.0.0.1:5173
```

## Build & deploy

GitHub Pages serves the committed `docs/` directory on `main`. No CI — a local smoke gate builds and sanity-checks the output:

```bash
npm run smoke    # vitest + vite build → docs/ + output checks
```

## Privacy

100% client-side. There is no backend, no analytics, no upload. Everything runs on your device.

## License

MIT — see [LICENSE](./LICENSE).
