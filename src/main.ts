// automata-lab — thin UI layer over the pure simulation modules.
//
// All the maths lives in ./conway, ./grayscott, ./lenia (unit-tested). Here we
// only wire the DOM, drive a requestAnimationFrame loop, paint the active
// model into an ImageData buffer, and handle pointer drawing.

import { mulberry32 } from "./rng";
import * as Life from "./conway";
import * as GS from "./grayscott";
import * as Lenia from "./lenia";
import { RAMPS, rampById, type ColorRamp } from "./colormap";

// ---- DOM helpers ----------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
function out(id: string, v: string): void {
  el<HTMLOutputElement>(id).textContent = v;
}

const canvas = el<HTMLCanvasElement>("canvas");
const ctx = canvas.getContext("2d")!;

type ModelId = "life" | "grayscott" | "lenia";

// ---- per-model grid resolutions -------------------------------------------
const LIFE_W = 160;
const LIFE_H = 120;
const GS_W = 200;
const GS_H = 200;
const LENIA_W = 220;
const LENIA_H = 220;

// ---- shared runtime state -------------------------------------------------
let model: ModelId = "life";
let playing = true;
let speed = 6; // simulation ticks per animation frame
let acc = 0; // sub-frame accumulator so "speed" controls tick rate smoothly

// Life
let lifeGrid = Life.makeGrid(LIFE_W, LIFE_H);
let lifeBuf = Life.makeGrid(LIFE_W, LIFE_H);
let lifeDensity = 0.3;

// Gray-Scott
let gs: GS.GSField = GS.makeField(GS_W, GS_H);
let gsBuf: GS.GSField = GS.makeField(GS_W, GS_H);
let gsParams: GS.GSParams = { ...GS.PRESETS.coral! };
let gsRamp: ColorRamp = rampById("inferno").fn;

// Lenia
let leWorld = Lenia.makeWorld(LENIA_W, LENIA_H);
let leBuf = Lenia.makeWorld(LENIA_W, LENIA_H);
let leParams: Lenia.LeniaParams = { ...Lenia.ORBIUM };
let leKernel = Lenia.makeKernel(leParams.R);
let leRamp: ColorRamp = rampById("viridis").fn;

// ---- canvas sizing --------------------------------------------------------
// The grid is fixed-resolution; we scale the canvas backing store to the grid
// and let CSS letterbox it into the stage. ImageData is one device pixel per
// cell, so rendering is a single putImageData per frame.
function gridSize(): { w: number; h: number } {
  if (model === "life") return { w: LIFE_W, h: LIFE_H };
  if (model === "grayscott") return { w: GS_W, h: GS_H };
  return { w: LENIA_W, h: LENIA_H };
}

let imageData = new ImageData(LIFE_W, LIFE_H);

function fitCanvas(): void {
  const { w, h } = gridSize();
  canvas.width = w;
  canvas.height = h;
  imageData = ctx.createImageData(w, h);

  // Scale up to fill the stage while keeping the grid aspect ratio.
  const stage = canvas.parentElement!.getBoundingClientRect();
  const margin = 24;
  const availW = Math.max(160, stage.width - margin);
  const availH = Math.max(160, stage.height - margin);
  const scale = Math.max(1, Math.floor(Math.min(availW / w, availH / h)));
  // Use a fractional scale on small screens so it still fills nicely.
  const fScale = Math.min(availW / w, availH / h);
  const css = Math.max(scale, fScale);
  canvas.style.width = `${Math.round(w * css)}px`;
  canvas.style.height = `${Math.round(h * css)}px`;
}

// ---- renderers ------------------------------------------------------------
function renderLife(): void {
  const d = imageData.data;
  for (let i = 0; i < lifeGrid.length; i++) {
    const on = lifeGrid[i] === 1;
    const o = i * 4;
    if (on) {
      d[o] = 94;
      d[o + 1] = 240;
      d[o + 2] = 200;
    } else {
      d[o] = 8;
      d[o + 1] = 9;
      d[o + 2] = 14;
    }
    d[o + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function renderField(values: Float32Array, ramp: ColorRamp, gamma = 1): void {
  const d = imageData.data;
  for (let i = 0; i < values.length; i++) {
    let t = values[i] ?? 0;
    if (gamma !== 1) t = Math.pow(t, gamma);
    const [r, g, b] = ramp(t);
    const o = i * 4;
    d[o] = r;
    d[o + 1] = g;
    d[o + 2] = b;
    d[o + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function render(): void {
  if (model === "life") renderLife();
  else if (model === "grayscott") renderField(gs.B, gsRamp, 1);
  else renderField(leWorld, leRamp, 1);
}

// ---- simulation tick ------------------------------------------------------
function tickLife(): void {
  lifeBuf = Life.step(lifeGrid, LIFE_W, LIFE_H, lifeBuf);
  [lifeGrid, lifeBuf] = [lifeBuf, lifeGrid];
}
function tickGS(): void {
  // Several Gray-Scott iterations per tick — the system evolves slowly.
  for (let k = 0; k < 2; k++) {
    gsBuf = GS.step(gs, gsParams, GS_W, GS_H, gsBuf);
    [gs, gsBuf] = [gsBuf, gs];
  }
}
function tickLenia(): void {
  leBuf = Lenia.step(leWorld, LENIA_W, LENIA_H, leKernel.weights, leKernel.size, leParams, leBuf);
  [leWorld, leBuf] = [leBuf, leWorld];
}

function tick(): void {
  if (model === "life") tickLife();
  else if (model === "grayscott") tickGS();
  else tickLenia();
}

function hud(): void {
  if (model === "life") {
    el("hud").textContent = `Conway · ${LIFE_W}×${LIFE_H} · pop ${Life.population(lifeGrid)}`;
  } else if (model === "grayscott") {
    el("hud").textContent = `Gray-Scott · ${GS_W}×${GS_H} · f ${gsParams.feed.toFixed(
      3,
    )} k ${gsParams.kill.toFixed(3)}`;
  } else {
    el("hud").textContent = `Lenia · ${LENIA_W}×${LENIA_H} · mass ${Math.round(
      Lenia.mass(leWorld),
    )}`;
  }
}

let hudThrottle = 0;
function loop(): void {
  if (playing) {
    acc += speed;
    let budget = 6; // cap ticks/frame so heavy models can't freeze the tab
    while (acc >= 1 && budget-- > 0) {
      tick();
      acc -= 1;
    }
    if (acc > 1) acc = 1;
  }
  render();
  if (++hudThrottle % 6 === 0) hud();
  requestAnimationFrame(loop);
}

// ---- pointer drawing ------------------------------------------------------
function pointerToCell(ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const { w, h } = gridSize();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * w);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * h);
  return { x: Math.max(0, Math.min(w - 1, x)), y: Math.max(0, Math.min(h - 1, y)) };
}

function paintAt(x: number, y: number): void {
  if (model === "life") {
    lifeGrid[y * LIFE_W + x] = 1;
  } else if (model === "grayscott") {
    GS.seedRect(gs, GS_W, GS_H, x, y, 3);
  } else {
    Lenia.seedBlob(leWorld, LENIA_W, LENIA_H, x, y, 6);
  }
}

let drawing = false;
canvas.addEventListener("pointerdown", (ev) => {
  drawing = true;
  canvas.setPointerCapture(ev.pointerId);
  const { x, y } = pointerToCell(ev);
  paintAt(x, y);
  if (!playing) render();
});
canvas.addEventListener("pointermove", (ev) => {
  if (!drawing) return;
  const { x, y } = pointerToCell(ev);
  paintAt(x, y);
  if (!playing) render();
});
const stopDraw = (): void => {
  drawing = false;
};
canvas.addEventListener("pointerup", stopDraw);
canvas.addEventListener("pointercancel", stopDraw);

// ---- toast + download -----------------------------------------------------
function toast(msg: string): void {
  const t = el<HTMLElement>("toast");
  t.textContent = msg;
  t.classList.add("show");
  window.setTimeout(() => t.classList.remove("show"), 1600);
}
function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- model switching ------------------------------------------------------
function setModel(next: ModelId): void {
  model = next;
  acc = 0;
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".seg-btn")) {
    btn.classList.toggle("active", btn.dataset.model === next);
  }
  for (const sec of document.querySelectorAll<HTMLElement>(".controls")) {
    sec.hidden = sec.dataset.for !== next;
  }
  fitCanvas();
  render();
  hud();
}

// ---- seeding helpers ------------------------------------------------------
function seedLife(): void {
  Life.randomize(lifeGrid, lifeDensity, Math.random);
}
function seedGSDefault(): void {
  gs = GS.makeField(GS_W, GS_H);
  GS.randomSeed(gs, GS_W, GS_H, 12, 6, Math.random);
}
function seedLeniaOrbium(): void {
  leWorld = Lenia.makeWorld(LENIA_W, LENIA_H);
  // A few Orbia at random spots so something is always gliding.
  const rnd = mulberry32((Math.random() * 2 ** 32) >>> 0);
  for (let i = 0; i < 3; i++) {
    const ox = Math.floor(rnd() * (LENIA_W - 24));
    const oy = Math.floor(rnd() * (LENIA_H - 24));
    Lenia.seedOrbium(leWorld, LENIA_W, LENIA_H, ox, oy);
  }
}

// ---- controls wiring ------------------------------------------------------
function setPlaying(p: boolean): void {
  playing = p;
  el("playpause").textContent = p ? "⏸ Pause" : "▶ Play";
}

function wire(): void {
  // Model selector.
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".seg-btn")) {
    btn.addEventListener("click", () => setModel(btn.dataset.model as ModelId));
  }

  // Transport.
  el("playpause").addEventListener("click", () => setPlaying(!playing));
  el("step").addEventListener("click", () => {
    setPlaying(false);
    tick();
    render();
    hud();
  });
  el<HTMLInputElement>("speed").addEventListener("input", (e) => {
    speed = Number((e.target as HTMLInputElement).value);
    out("speed-out", `${speed}×`);
  });
  out("speed-out", `${speed}×`);

  // --- Life ---
  el<HTMLInputElement>("life-density").addEventListener("input", (e) => {
    lifeDensity = Number((e.target as HTMLInputElement).value);
    out("life-density-out", lifeDensity.toFixed(2));
  });
  out("life-density-out", lifeDensity.toFixed(2));
  el("life-random").addEventListener("click", () => {
    seedLife();
    render();
  });
  el("life-clear").addEventListener("click", () => {
    lifeGrid.fill(0);
    render();
    hud();
  });
  el("life-pattern").addEventListener("change", (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const pat = Life.PATTERNS[id];
    if (!pat) return;
    const cx = Math.floor(LIFE_W / 2) - 1;
    const cy = Math.floor(LIFE_H / 2) - 1;
    Life.stamp(lifeGrid, LIFE_W, LIFE_H, pat, cx, cy);
    render();
  });

  // --- Gray-Scott ---
  const gsRangeInputs: Array<[string, keyof GS.GSParams, number]> = [
    ["gs-feed", "feed", 4],
    ["gs-kill", "kill", 4],
    ["gs-da", "dA", 2],
    ["gs-db", "dB", 2],
  ];
  function syncGSOutputs(): void {
    for (const [id, key, dp] of gsRangeInputs) {
      const inp = el<HTMLInputElement>(id);
      inp.value = String(gsParams[key]);
      out(`${id}-out`, gsParams[key].toFixed(dp));
    }
  }
  for (const [id, key, dp] of gsRangeInputs) {
    el<HTMLInputElement>(id).addEventListener("input", (e) => {
      gsParams[key] = Number((e.target as HTMLInputElement).value);
      out(`${id}-out`, gsParams[key].toFixed(dp));
    });
  }
  el("gs-preset").addEventListener("change", (e) => {
    const p = GS.PRESETS[(e.target as HTMLSelectElement).value];
    if (!p) return;
    gsParams = { ...p };
    syncGSOutputs();
    seedGSDefault();
  });
  el<HTMLSelectElement>("gs-ramp").addEventListener("change", (e) => {
    gsRamp = rampById((e.target as HTMLSelectElement).value).fn;
    render();
  });
  el("gs-splat").addEventListener("click", () => {
    GS.randomSeed(gs, GS_W, GS_H, 6, 6, Math.random);
    render();
  });
  el("gs-clear").addEventListener("click", () => {
    gs = GS.makeField(GS_W, GS_H);
    render();
  });
  syncGSOutputs();

  // --- Lenia ---
  el<HTMLInputElement>("le-mu").addEventListener("input", (e) => {
    leParams.mu = Number((e.target as HTMLInputElement).value);
    out("le-mu-out", leParams.mu.toFixed(3));
  });
  el<HTMLInputElement>("le-sigma").addEventListener("input", (e) => {
    leParams.sigma = Number((e.target as HTMLInputElement).value);
    out("le-sigma-out", leParams.sigma.toFixed(3));
  });
  el<HTMLInputElement>("le-dt").addEventListener("input", (e) => {
    leParams.dt = Number((e.target as HTMLInputElement).value);
    out("le-dt-out", leParams.dt.toFixed(2));
  });
  out("le-mu-out", leParams.mu.toFixed(3));
  out("le-sigma-out", leParams.sigma.toFixed(3));
  out("le-dt-out", leParams.dt.toFixed(2));
  el<HTMLSelectElement>("le-ramp").addEventListener("change", (e) => {
    leRamp = rampById((e.target as HTMLSelectElement).value).fn;
    render();
  });
  el("le-orbium").addEventListener("click", () => {
    seedLeniaOrbium();
    render();
    hud();
  });
  el("le-soup").addEventListener("click", () => {
    const rnd = mulberry32((Math.random() * 2 ** 32) >>> 0);
    for (let i = 0; i < leWorld.length; i++) leWorld[i] = rnd() < 0.25 ? rnd() : 0;
    render();
    hud();
  });
  el("le-clear").addEventListener("click", () => {
    leWorld.fill(0);
    render();
    hud();
  });

  // Populate colour-ramp dropdowns (shared list).
  for (const selId of ["gs-ramp", "le-ramp"]) {
    const sel = el<HTMLSelectElement>(selId);
    for (const r of RAMPS) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    }
  }
  el<HTMLSelectElement>("gs-ramp").value = "inferno";
  el<HTMLSelectElement>("le-ramp").value = "viridis";

  // PNG export — snapshot the visible canvas at grid resolution.
  el("png").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (blob) {
        download(`automata-${model}.png`, blob);
        toast("PNG saved");
      }
    }, "image/png");
  });

  // Panel show/hide (mobile).
  el("toggle-panel").addEventListener("click", () => el("panel").classList.add("hidden"));
  el("show-panel").addEventListener("click", () => el("panel").classList.remove("hidden"));

  el<HTMLElement>("version").textContent = `v${__APP_VERSION__} · ${__GIT_COMMIT__}`;

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      fitCanvas();
      render();
    }, 150);
  });
}

// ---- boot -----------------------------------------------------------------
function init(): void {
  wire();
  seedLife();
  seedGSDefault();
  seedLeniaOrbium();
  setModel("life");
  setPlaying(true);
  loop();
}

init();
