/**
 * Jump Lab — application layer
 * Modules: state · units/format · controls · renderer · animation ·
 * challenge engine · prediction · compare · workbench · tutor · session.
 * The physics engine (physics.js) is the only source of numbers.
 */
import * as P from './physics.js';
import * as U from './units.js';
import { CHALLENGES, PREDICTIONS, CONCEPTS } from './challenges.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ft = U.ftToM;
const DIFFS = ['beginner', 'intermediate', 'advanced', 'expert'];

/* ======================= variables & units ======================= */
const VARS = [
  { key: 'speed', label: 'Takeoff speed', kind: 'speed', range: [10, 35, 0.5], sym: 'v₀' },
  { key: 'angle', label: 'Launch angle', kind: 'angle', range: [5, 35, 0.5], sym: 'θ' },
  { key: 'takeoffElev', label: 'Takeoff elevation', kind: 'length', range: [0, 10, 0.5], sym: 'y₀' },
  { key: 'landingElev', label: 'Landing elevation', kind: 'length', range: [-6, 6, 0.5], sym: 'y_L' },
  { key: 'targetX', label: 'Target distance', kind: 'length', range: [8, 40, 0.5], sym: 'x_T' },
  { key: 'zoneWidth', label: 'Landing zone width', kind: 'length', range: [4, 12, 0.5], sym: 'w' },
];
const VAR = Object.fromEntries(VARS.map((v) => [v.key, v]));
const EXPLORE_DEFAULTS = { speed: 20, angle: 20, takeoffElev: 0, landingElev: -2, targetX: 22, zoneWidth: 8 }; // imperial

const impToSI = (kind, v) => (kind === 'speed' ? U.mphToMs(v) : kind === 'length' ? ft(v) : v);
const toDisp = (kind, si) => (kind === 'speed' ? U.speedFromSI(si, S.units) : kind === 'length' ? U.lengthFromSI(si, S.units) : si);
const fromDisp = (kind, d) => (kind === 'speed' ? U.speedToSI(d, S.units) : kind === 'length' ? U.lengthToSI(d, S.units) : d);
const unitOf = (kind) => (kind === 'angle' ? '°' : U.UNIT_SYSTEMS[S.units][kind]);
const met = () => S.units === 'metric';

function dispRange(v) {
  const c = currentChallenge();
  const [lo, hi, st] = c?.ranges?.[v.key] ?? v.range;
  if (!met() || v.kind === 'angle') return [lo, hi, st];
  const step = v.kind === 'speed' ? (st < 0.5 ? 0.1 : 0.5) : 0.05;
  const cv = (x) => toDisp(v.kind, impToSI(v.kind, x));
  return [Math.ceil(cv(lo) / step - 1e-9) * step, Math.floor(cv(hi) / step + 1e-9) * step, step];
}
const dec = (kind) => (kind === 'length' && met() ? 2 : 1);
const fmtL = (m, d) => `${U.lengthFromSI(m, S.units).toFixed(d ?? (met() ? 2 : 1))} ${unitOf('length')}`;
const fmtS = (ms) => `${U.speedFromSI(ms, S.units).toFixed(1)} ${unitOf('speed')}`;
const fmtV = (ms, d = 2) => `${U.velocityFromSI(ms, S.units).toFixed(d)} ${U.UNIT_SYSTEMS[S.units].velocity}`;
const fmtT = (s, d = 2) => `${s.toFixed(d)} s`;
const fmtA = (deg) => `${(+deg.toFixed(1))}°`;
const signed = (m) => (m >= 0 ? '+' : '−') + fmtL(Math.abs(m));

/* ============================ state ============================ */
const S = {
  units: 'imperial',
  mode: 'explore',
  tutor: false,
  challengeId: CHALLENGES[0].id,
  showList: true,
  diffFilter: 'all',
  vars: {},
  exploreVars: null,
  tutorLocks: {},
  toggles: { path: true, grid: true, vectors: false, measure: true, annot: false },
  anim: { t: 0, playing: false, rate: 1, endT: 0, counted: true },
  flownKey: null,
  compare: { A: null, B: null },
  ghosts: [],
  ch: {},
  predict: null,
  wbTab: 'eq', level: 'simple', wbOpen: true, defs: false, eqHidden: false,
  blind: false, revealed: true,
  discussQ: 0,
  inputErr: {},
  session: { start: Date.now(), started: new Set(), completed: new Set(), attempts: 0, hints: 0, predictions: 0, correct: 0, concepts: new Set(), jumps: 0 },
};
for (const k in EXPLORE_DEFAULTS) S.vars[k] = impToSI(VAR[k].kind, EXPLORE_DEFAULTS[k]);

const currentChallenge = () => (S.mode === 'challenge' ? CHALLENGES.find((c) => c.id === S.challengeId) : null);
const chState = (id) => (S.ch[id] ??= { attempts: 0, hints: 0, solved: false, jumps: [], answer: null, predicted: null, last: null, solution: false, started: false });
const cfg = (v = S.vars) => ({ v0: v.speed, angleDeg: v.angle, y0: v.takeoffElev, yL: v.landingElev });
const zone = (v = S.vars) => ({ targetX: v.targetX, width: v.zoneWidth });
const key = () => JSON.stringify([S.vars]);

function isLocked(k) {
  if (k in S.tutorLocks) return S.tutorLocks[k];
  const c = currentChallenge();
  return c ? !c.adjustable.includes(k) : false;
}

/* ===================== scene geometry & flight ===================== */
const RAMP_R = ft(12);
function geometry(c, z) {
  const th = P.degToRad(Math.max(c.angleDeg, 0.5));
  const rampH = RAMP_R * (1 - Math.cos(th));
  const rampLen = RAMP_R * Math.sin(th);
  const { start, end } = P.zoneBounds(z);
  const runY = c.y0 - rampH;
  const floorY = Math.min(runY, c.yL) - ft(4);
  return { rampH, rampLen, runY, deckStart: Math.max(start, ft(1.5)), zStart: start, zEnd: end, floorY };
}

/** When/where the visible flight ends: landing, deck face, or gap floor. */
function flight(c, z, sim, g) {
  if (sim.status === P.RESULT.INVALID) return { tEnd: 0, kind: 'invalid' };
  if (sim.landing && (sim.status === P.RESULT.SUCCESS || sim.status === P.RESULT.OVERSHOOT)) return { tEnd: sim.landing.t, kind: 'deck' };
  const vx = P.components(c.v0, c.angleDeg).vx;
  const tFloor = P.landingTime({ ...c, yL: g.floorY }) ?? 3;
  let tEnd = tFloor, kind = 'floor';
  if (vx > 1e-9) {
    const tf = g.deckStart / vx;
    if (tf < tFloor && P.positionAt(c, tf).y < c.yL) { tEnd = tf; kind = 'face'; }
  }
  return { tEnd, kind };
}

/* ======================== result visibility ======================== */
function hiddenByMission() {
  const c = currentChallenge();
  return !!(c && c.hideZoneUntilAnswered && chState(c.id).answer === null);
}
const flownCurrent = () => S.flownKey === key();
function resultVisible() {
  if (S.blind && !S.revealed) return false;
  if (S.mode === 'challenge') return flownCurrent();
  return true;
}
function pathVisible() {
  if (S.blind && !S.revealed) return false;
  if (hiddenByMission()) return false;
  return S.toggles.path;
}

/* ============================ controls ============================ */
function buildControls() {
  const host = $('#controls');
  host.innerHTML = VARS.map((v) => {
    const [lo, hi, st] = dispRange(v);
    const locked = isLocked(v.key);
    return `<div class="ctl${locked ? ' locked' : ''}" data-k="${v.key}">
      <label for="r_${v.key}">${esc(v.label)} <span class="sym">${v.sym}</span></label>
      <div class="numwrap"><input type="number" id="n_${v.key}" aria-label="${esc(v.label)} (${unitOf(v.kind)})" min="${lo}" max="${hi}" step="${st}" ${locked ? 'disabled' : ''}><span class="unit">${unitOf(v.kind)}</span></div>
      <input type="range" id="r_${v.key}" min="${lo}" max="${hi}" step="${st}" ${locked ? 'disabled' : ''} aria-describedby="e_${v.key}">
      <div class="err" id="e_${v.key}" role="alert"></div>
    </div>`;
  }).join('');
  for (const v of VARS) {
    const r = $(`#r_${v.key}`), n = $(`#n_${v.key}`);
    r.addEventListener('input', () => { setVar(v.key, fromDisp(v.kind, +r.value)); S.inputErr[v.key] = ''; syncControl(v.key, 'range'); });
    n.addEventListener('change', () => {
      const [lo, hi] = dispRange(v);
      const raw = n.value.trim();
      const x = Number(raw);
      if (raw === '' || !Number.isFinite(x)) { S.inputErr[v.key] = `Enter a number from ${lo} to ${hi} ${unitOf(v.kind)}.`; syncControl(v.key); return; }
      const cl = Math.min(hi, Math.max(lo, x));
      S.inputErr[v.key] = cl !== x ? `${x} is out of range, so it was set to ${cl} ${unitOf(v.kind)}.` : '';
      setVar(v.key, fromDisp(v.kind, cl));
      syncControl(v.key);
    });
  }
  syncControls();
}
function syncControl(k, from) {
  const v = VAR[k];
  const [lo, hi] = dispRange(v);
  const d = toDisp(v.kind, S.vars[k]);
  const r = $(`#r_${k}`), n = $(`#n_${k}`);
  if (!r) return;
  if (from !== 'range') r.value = d;
  n.value = +d.toFixed(dec(v.kind) + (v.kind === 'speed' && dispRange(v)[2] < 0.5 ? 0 : 0));
  r.style.setProperty('--fill', `${((d - lo) / (hi - lo)) * 100}%`);
  $(`#e_${k}`).textContent = S.inputErr[k] || '';
}
const syncControls = () => VARS.forEach((v) => syncControl(v.key));

function setVar(k, si) {
  if (isLocked(k) || !Number.isFinite(si)) return;
  S.vars[k] = si;
  onSetupChanged();
}
function onSetupChanged() {
  stopAnim();
  S.anim.t = 0;
  if (S.blind) S.revealed = false;
  renderScene();
  renderReadouts();
  if (S.mode === 'explore') renderLiveFeedback();
  if (S.wbTab === 'sub') renderWorkbench();
}

/* ============================ renderer ============================ */
let VIEW = null;
let staticKey = '';

function viewport() {
  const w = $('.canvas-wrap').clientWidth || 1000;
  return w < 640 ? { W: 520, minH: 300, maxH: 460, small: true } : { W: 1000, minH: 380, maxH: 540, small: false };
}

function computeView(c, z, sim, g, extraXs) {
  const { W, minH, maxH, small } = viewport();
  const pad = { l: small ? 40 : 48, r: 12, t: 12, b: small ? 30 : 34 };
  const xMin = -(Math.max(g.rampLen, ft(5)) + ft(4));
  let xMax = Math.max(ft(30), g.zEnd + ft(6), ...(extraXs || []).map((x) => x + ft(4)));
  if (sim.landing) xMax = Math.max(xMax, sim.landing.x + ft(5));
  xMax = Math.ceil(xMax / ft(10)) * ft(10);
  const yMin = g.floorY - ft(1);
  let yMax = Math.max(ft(10), c.y0 + ft(4), c.yL + ft(4), (sim.apex?.y ?? 0) + ft(3));
  yMax = Math.ceil(yMax / ft(5)) * ft(5);
  const aw = W - pad.l - pad.r;
  const H = Math.round(Math.min(maxH, Math.max(minH, ((yMax - yMin) * aw) / (xMax - xMin) + pad.t + pad.b)));
  const ah = H - pad.t - pad.b;
  const s = Math.min(aw / (xMax - xMin), ah / (yMax - yMin));
  const v = { W, H, pad, s, xMin, yMin, xMax: xMin + aw / s, yMax: yMin + ah / s, small };
  v.X = (x) => pad.l + (x - xMin) * s;
  v.Y = (y) => pad.t + ah - (y - yMin) * s;
  return v;
}

const pts = (v, arr) => arr.map((p) => `${v.X(p.x).toFixed(1)},${v.Y(p.y).toFixed(1)}`).join(' ');
function pathPts(c, tEnd, n = 90) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(P.positionAt(c, (tEnd * i) / n));
  return out;
}

function gridStep(span) {
  if (met()) return span > 30 ? 5 : span > 14 ? 2 : 1;
  return span > 100 ? 20 : span > 45 ? 10 : 5;
}

function renderScene() {
  const c = cfg(), z = zone();
  const sim = P.simulate(c, z);
  const g = geometry(c, z);
  const cmpEnds = ['A', 'B'].map((k) => S.compare[k]?.endX).filter((x) => x != null);
  const v = (VIEW = computeView(c, z, sim, g, cmpEnds));
  const fl = flight(c, z, sim, g);
  S.anim.endT = fl.tEnd;
  VIEW.sim = sim; VIEW.fl = fl; VIEW.c = c; VIEW.g = g;
  const svg = $('#scene');
  svg.setAttribute('viewBox', `0 0 ${v.W} ${v.H}`);

  const out = [];
  out.push(`<defs>
    <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sky-top"/><stop offset="1" class="sky-bot"/></linearGradient>
    ${['v', 'x', 'y'].map((k) => `<marker id="ar${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="m${k}"/></marker>`).join('')}
    <marker id="dimA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" class="dim"/></marker>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="okS" stroke-width="2"/></pattern>
  </defs>`);
  out.push(`<rect x="0" y="0" width="${v.W}" height="${v.H}" fill="url(#skyG)"/>`);

  // grid + axes
  const lu = unitOf('length');
  const dx = (m) => U.lengthFromSI(m, S.units);
  const step = gridStep(dx(v.xMax - v.xMin));
  const stepM = U.lengthToSI(step, S.units);
  const bottom = v.H - v.pad.b;
  if (S.toggles.grid) {
    const gl = [];
    for (let x = Math.ceil(v.xMin / stepM) * stepM; x <= v.xMax + 1e-9; x += stepM) gl.push(`<line class="grid" x1="${v.X(x)}" y1="${v.pad.t}" x2="${v.X(x)}" y2="${bottom}"/>`);
    for (let y = Math.ceil(v.yMin / stepM) * stepM; y <= v.yMax + 1e-9; y += stepM) gl.push(`<line class="grid" x1="${v.pad.l}" y1="${v.Y(y)}" x2="${v.W - v.pad.r}" y2="${v.Y(y)}"/>`);
    out.push(gl.join(''));
  }
  // terrain: run-in + ramp arc, gap, landing deck
  const th = P.degToRad(Math.max(c.angleDeg, 0.5));
  const cx = -g.rampLen, cy = g.runY + RAMP_R;
  const arc = [];
  for (let i = 0; i <= 24; i++) { const ph = (th * i) / 24; arc.push({ x: cx + RAMP_R * Math.sin(ph), y: cy - RAMP_R * Math.cos(ph) }); }
  const back = { x: Math.min(ft(1.2), g.deckStart * 0.5), y: g.floorY };
  out.push(`<rect class="gap" x="${v.X(0)}" y="${v.Y(g.floorY)}" width="${v.X(g.deckStart) - v.X(0)}" height="${v.H - v.Y(g.floorY)}"/>`);
  out.push(`<polygon class="dirt" points="${v.X(v.xMin) - 2},${v.H} ${v.X(v.xMin) - 2},${v.Y(g.runY)} ${pts(v, arc)} ${v.X(back.x)},${v.Y(back.y)} ${v.X(back.x)},${v.H}"/>`);
  out.push(`<polyline class="edge" points="${v.X(v.xMin) - 2},${v.Y(g.runY)} ${pts(v, arc)}"/>`);
  out.push(`<polygon class="dirt" points="${v.X(g.deckStart)},${v.H} ${v.X(g.deckStart)},${v.Y(c.yL)} ${v.W + 2},${v.Y(c.yL)} ${v.W + 2},${v.H}"/>`);
  out.push(`<polyline class="edge" points="${v.X(g.deckStart)},${v.Y(g.floorY)} ${v.X(g.deckStart)},${v.Y(c.yL)} ${v.W + 2},${v.Y(c.yL)}"/>`);

  // axes (datum y=0, lip x=0)
  out.push(`<line class="axis" x1="${v.pad.l}" y1="${v.Y(0)}" x2="${v.W - v.pad.r}" y2="${v.Y(0)}" stroke-dasharray="2 5"/>`);
  out.push(`<line class="axis" x1="${v.X(0)}" y1="${v.pad.t}" x2="${v.X(0)}" y2="${bottom}" stroke-dasharray="2 5"/>`);
  if (S.toggles.grid) {
    const tk = [];
    for (let x = Math.ceil(v.xMin / stepM) * stepM; x <= v.xMax + 1e-9; x += stepM) tk.push(`<text class="tick" x="${v.X(x)}" y="${v.H - 10}" text-anchor="middle">${+dx(x).toFixed(1)}</text>`);
    for (let y = Math.ceil(v.yMin / stepM) * stepM; y <= v.yMax + 1e-9; y += stepM) tk.push(`<text class="tick" x="${v.pad.l - 6}" y="${v.Y(y) + 4}" text-anchor="end">${+dx(y).toFixed(1)}</text>`);
    out.push(tk.join(''));
  }
  out.push(`<text class="axlbl" x="${v.W - v.pad.r - 4}" y="${v.Y(0) - 6}" text-anchor="end">x (${lu})</text>`);
  out.push(`<text class="axlbl" x="${v.X(0) + 6}" y="${v.pad.t + 14}">y (${lu})</text>`);

  // landing zone
  if (!hiddenByMission()) {
    const zx1 = v.X(Math.max(g.zStart, g.deckStart)), zx2 = v.X(g.zEnd), zy = v.Y(c.yL);
    out.push(`<rect class="zone" x="${zx1}" y="${zy - 7}" width="${Math.max(0, zx2 - zx1)}" height="10" fill="url(#hatch)"/>`);
    out.push(`<line class="tgt" x1="${v.X(z.targetX)}" y1="${zy - 16}" x2="${v.X(z.targetX)}" y2="${zy + 4}"/>`);
    out.push(`<text class="zlbl" x="${(zx1 + zx2) / 2}" y="${zy + 22}" text-anchor="middle">LANDING ZONE</text>`);
  }

  // comparison paths
  for (const k of ['A', 'B']) {
    const j = S.compare[k];
    if (!j) continue;
    out.push(`<polyline class="cmp${k}" points="${pts(v, j.path)}"/>`);
    const e = j.path.at(-1);
    out.push(`<text class="lbl cmp${k}t" x="${v.X(e.x)}" y="${v.Y(e.y) - 10}" text-anchor="middle">${k}</text>`);
  }
  // ghost attempts
  for (const gh of S.ghosts) out.push(`<polyline class="ghost" points="${pts(v, gh)}"/>`);

  // predicted path
  if (pathVisible() && sim.status !== P.RESULT.INVALID) out.push(`<polyline class="pred" points="${pts(v, pathPts(c, fl.tEnd))}"/>`);

  // measurements & landing marker
  const showRes = resultVisible() && !hiddenByMission();
  if (showRes && sim.status !== P.RESULT.INVALID) {
    const top = sim.apex;
    const L = sim.landing;
    if (S.toggles.measure) {
      if (top.t > 0) {
        out.push(`<circle class="apexdot" cx="${v.X(top.x)}" cy="${v.Y(top.y)}" r="3.5"/>`);
        out.push(`<text class="lbl" x="${v.X(top.x)}" y="${v.Y(top.y) - 10}" text-anchor="middle">peak y = ${fmtL(top.y)}</text>`);
      }
      const endX = L && fl.kind === 'deck' ? L.x : P.positionAt(c, fl.tEnd).x;
      const dimY = v.Y(g.floorY) - 16;
      out.push(`<line class="dim" x1="${v.X(0)}" y1="${dimY}" x2="${v.X(endX)}" y2="${dimY}" marker-start="url(#dimA)" marker-end="url(#dimA)"/>`);
      out.push(`<text class="lbl big" x="${(v.X(0) + v.X(endX)) / 2}" y="${dimY - 7}" text-anchor="middle">${L && fl.kind === 'deck' ? 'x_L' : 'x'} = ${fmtL(endX)}</text>`);
      if (Math.abs(c.y0 - c.yL) > 1e-6) {
        const xx = v.X(g.deckStart) - 12;
        out.push(`<line class="dimdash" x1="${v.X(0)}" y1="${v.Y(c.y0)}" x2="${xx + 6}" y2="${v.Y(c.y0)}"/>`);
        out.push(`<line class="dim" x1="${xx}" y1="${v.Y(c.y0)}" x2="${xx}" y2="${v.Y(c.yL)}" marker-start="url(#dimA)" marker-end="url(#dimA)"/>`);
        const ly = c.yL < c.y0 ? v.Y(c.yL) - 8 : v.Y(c.yL) + 18;
        out.push(`<text class="lbl" x="${xx - 6}" y="${ly}" text-anchor="end">Δy = ${signed(c.yL - c.y0)}</text>`);
      }
    }
    const endP = P.positionAt(c, fl.tEnd);
    const st = sim.status;
    const cls = st === 'success' ? 'ok' : st === 'overshoot' ? 'warn' : 'bad';
    const icon = st === 'success' ? '✓' : st === 'overshoot' ? '→' : '✕';
    out.push(`<circle cx="${v.X(endP.x)}" cy="${v.Y(endP.y)}" r="7" class="${cls}"/>`);
    out.push(`<text class="lbl ${cls}" x="${v.X(endP.x)}" y="${v.Y(endP.y) + (fl.kind === 'deck' && !hiddenByMission() ? 42 : 24)}" text-anchor="middle">${icon} ${esc(statusShort(sim))}</text>`);
  }

  if (S.toggles.annot && pathVisible() && sim.status !== P.RESULT.INVALID) {
    const top = sim.apex;
    const mid = P.positionAt(c, fl.tEnd * 0.25);
    out.push(`<text class="annot" x="${v.X(mid.x) - 10}" y="${v.Y(mid.y) - 14}" text-anchor="end">y = y₀ + v₀sinθ·t − ½gt²</text>`);
    if (top.t > 0) out.push(`<text class="annot" x="${v.X(top.x) + 12}" y="${v.Y(top.y) + 22}">vᵧ = 0 here</text>`);
    out.push(`<text class="annot" x="${v.X(0) + 8}" y="${v.Y(c.y0) + 22}">(0, y₀)</text>`);
  }

  out.push('<g id="dyn"></g>');
  out.unshift(`<desc id="sceneDesc">${esc(sceneDescription(sim))}</desc>`);
  svg.innerHTML = out.join('');
  renderDynamic();
}

function statusShort(sim) {
  switch (sim.status) {
    case 'success': return 'In the zone';
    case 'overshoot': return 'Overshot';
    case 'undershoot': return sim.hitsFace ? 'Hit the deck face' : 'Short';
    case 'no-landing': return 'Never reaches deck';
    default: return 'Check inputs';
  }
}
function statusLong(sim) {
  const L = sim.landing;
  switch (sim.status) {
    case 'success': return `Lands ${fmtL(L.x)} out, inside the zone.`;
    case 'overshoot': return `Lands ${fmtL(L.x)} out, ${fmtL(sim.miss)} past the zone.`;
    case 'undershoot': return sim.hitsFace ? 'Still below deck height at the deck edge, so the rider hits the face of the landing.' : `Reaches deck height ${fmtL(L.x)} out, ${fmtL(-sim.miss)} before the deck starts.`;
    case 'no-landing': return `The deck is higher than the peak (${fmtL(sim.apex.y)}), so the path never comes down onto it.`;
    default: return 'Some inputs are not valid numbers.';
  }
}
function sceneDescription(sim) {
  if (!resultVisible()) return `Jump setup: ${fmtS(S.vars.speed)} at ${fmtA(S.vars.angle)}. Result hidden until the jump runs.`;
  return `Jump: ${fmtS(S.vars.speed)} at ${fmtA(S.vars.angle)}, takeoff ${fmtL(S.vars.takeoffElev)}, landing ${fmtL(S.vars.landingElev)}. ${statusLong(sim)}`;
}

/* rider + velocity vectors (redrawn every frame) */
function renderDynamic() {
  const v = VIEW;
  if (!v) return;
  const c = v.c, t = Math.min(S.anim.t, v.fl.tEnd);
  const host = $('#dyn');
  if (!host) return;
  const out = [];
  if (v.sim.status === P.RESULT.INVALID) { host.innerHTML = ''; return; }
  if (t > 0) out.push(`<polyline class="flown" points="${pts(v, pathPts(c, t, Math.max(4, Math.round(60 * t / Math.max(v.fl.tEnd, 1e-3)))))}"/>`);
  const p = P.positionAt(c, t), vel = P.velocityAt(c, t);
  const deg = (Math.atan2(vel.vy, vel.vx) * 180) / Math.PI;
  const rp = Math.max(6, ft(1.15) * v.s), wb = rp * 3.6;
  const X = v.X(p.x), Y = v.Y(p.y);
  out.push(`<g class="rider" transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) rotate(${(-deg).toFixed(2)})">
    <circle cx="${-wb / 2}" cy="${-rp}" r="${rp}"/><circle cx="${wb / 2}" cy="${-rp}" r="${rp}"/>
    <polyline points="${-wb / 2},${-rp} ${-wb * 0.05},${-rp * 0.9} ${wb * 0.32},${-rp * 2.2} ${wb / 2},${-rp}"/>
    <polyline points="${-wb / 2},${-rp} ${-wb * 0.12},${-rp * 2.2} ${-wb * 0.05},${-rp * 0.9}"/>
    <polyline points="${-wb * 0.05},${-rp * 0.9} ${wb * 0.02},${-rp * 2.5} ${wb * 0.22},${-rp * 3.4} ${wb * 0.34},${-rp * 2.35}"/>
    <circle class="head" cx="${wb * 0.27}" cy="${-rp * 4}" r="${rp * 0.5}"/>
  </g>`);
  if (S.toggles.vectors) {
    const k = v.s * 0.13; // px per (m/s)
    const ox = X, oy = Y - rp * 1.2;
    const ex = ox + vel.vx * k, ey = oy - vel.vy * k;
    out.push(`<line class="vec vx" x1="${ox}" y1="${oy}" x2="${ex}" y2="${oy}" marker-end="url(#arx)"/>`);
    if (Math.abs(vel.vy) > 0.05) out.push(`<line class="vec vy" x1="${ex}" y1="${oy}" x2="${ex}" y2="${ey}" marker-end="url(#ary)"/>`);
    out.push(`<line class="vec vv" x1="${ox}" y1="${oy}" x2="${ex}" y2="${ey}" marker-end="url(#arv)"/>`);
    out.push(`<text class="lbl tx" x="${(ox + ex) / 2}" y="${oy + 18}" text-anchor="middle">vₓ ${fmtV(vel.vx, 1)}</text>`);
    out.push(`<text class="lbl ty" x="${ex + 8}" y="${(oy + ey) / 2 + 4}">vᵧ ${fmtV(vel.vy, 1)}</text>`);
  }
  host.innerHTML = out.join('');
  $('#tLabel').textContent = `t = ${t.toFixed(2)} s`;
  const sc = $('#scrub');
  const frac = v.fl.tEnd > 0 ? t / v.fl.tEnd : 0;
  if (document.activeElement !== sc) sc.value = Math.round(frac * 1000);
  sc.style.setProperty('--fill', `${frac * 100}%`);
}

/* ============================ animation ============================ */
let raf = 0, lastTs = 0;
function frame(ts) {
  if (!S.anim.playing) return;
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;
  S.anim.t += dt * S.anim.rate;
  if (S.anim.t >= S.anim.endT) {
    S.anim.t = S.anim.endT;
    S.anim.playing = false;
    renderDynamic();
    updatePlayBtn();
    onLanded();
    return;
  }
  renderDynamic();
  raf = requestAnimationFrame(frame);
}
function play() {
  if (S.anim.playing) return;
  if (S.anim.t >= S.anim.endT) S.anim.t = 0;
  S.anim.playing = true;
  lastTs = 0;
  updatePlayBtn();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && S.anim.rate >= 1) { S.anim.t = S.anim.endT; frame(performance.now()); return; }
  raf = requestAnimationFrame(frame);
}
function stopAnim() { S.anim.playing = false; cancelAnimationFrame(raf); updatePlayBtn(); }
function updatePlayBtn() {
  const b = $('#playBtn');
  b.textContent = S.anim.playing ? '❚❚ Pause' : '▶ Play';
  b.setAttribute('aria-label', S.anim.playing ? 'Pause' : 'Play');
}

function sendIt() {
  const c = currentChallenge();
  if (c && !canSend(c)) return;
  stopAnim();
  S.anim.t = 0;
  S.anim.counted = false;
  play();
}
function onLanded() {
  const wasNew = !S.anim.counted;
  S.anim.counted = true;
  S.flownKey = key();
  if (S.blind) S.revealed = true;
  if (wasNew) {
    S.session.jumps++;
    const c = currentChallenge();
    if (c) registerAttempt(c);
  }
  renderScene();
  renderReadouts();
  renderActivity();
  if (S.wbTab === 'sub') renderWorkbench();
  announce(sceneDescription(VIEW.sim));
}

/* ============================ readouts ============================ */
function renderReadouts() {
  const sim = VIEW.sim, show = resultVisible() && !hiddenByMission() && sim.status !== 'invalid';
  const L = sim.landing;
  const cell = (k, v) => `<div class="ro"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const dash = '<span style="color:var(--faint)">—</span>';
  const split = (s) => { const i = s.lastIndexOf(' '); return `${s.slice(0, i)}<small>${s.slice(i + 1)}</small>`; };
  const st = sim.status;
  const pill = show ? `<span class="pill ${st}">${st === 'success' ? '✓' : st === 'overshoot' ? '→' : '✕'} ${statusShort(sim)}</span>` : `<span class="pill pending">${S.mode === 'challenge' ? 'Send it to test' : 'Hidden'}</span>`;
  $('#readouts').innerHTML = [
    cell('Airtime', show && L ? split(fmtT(L.t)) : dash),
    cell('Distance x<sub>L</sub>', show && L ? split(fmtL(L.x)) : dash),
    cell('Max height', show ? split(fmtL(sim.apex.y)) : dash),
    cell('Landing speed', show && L ? split(fmtS(L.speed)) : dash),
    cell('Result', pill),
  ].join('');
}

/* ========================= challenge engine ========================= */
function successText(c) {
  const zs = P.zoneBounds({ targetX: ft(c.zone.targetX), width: ft(c.zone.width) });
  const zr = `${fmtL(zs.start)} – ${fmtL(zs.end)}`;
  switch (c.type) {
    case 'min-speed': return `Land in the zone (${zr}) no more than ${fmtL(ft(c.success.maxPastStart))} past the deck edge.`;
    case 'two-jumps': return `Land in the zone (${zr}) twice, with launch angles at least ${c.success.minAngleDiff}° apart.`;
    case 'calculate': return `Your calculated distance must be within ${fmtL(ft(c.success.tolerance))} of the real landing.`;
    default: return `Land in the zone: ${zr}.`;
  }
}
function canSend(c) {
  const st = chState(c.id);
  if (c.prediction && st.predicted === null) return false;
  if (c.type === 'calculate' && st.answer === null) return false;
  return true;
}
function loadChallenge(id) {
  S.challengeId = id;
  S.mode = 'challenge';
  S.showList = false;
  S.tutorLocks = {};
  S.ghosts = [];
  S.flownKey = null;
  const c = currentChallenge();
  const base = { ...EXPLORE_DEFAULTS, targetX: c.zone.targetX, zoneWidth: c.zone.width, ...c.initial, ...c.fixed };
  for (const k in base) S.vars[k] = impToSI(VAR[k].kind, base[k]);
  S.toggles.path = false;
  const st = chState(id);
  if (!st.started) { st.started = true; S.session.started.add(id); c.concepts.forEach((x) => S.session.concepts.add(x)); }
  refreshAll();
}
function registerAttempt(c) {
  const st = chState(c.id);
  const sim = VIEW.sim;
  st.attempts++;
  S.session.attempts++;
  S.ghosts = [...S.ghosts, pathPts(VIEW.c, VIEW.fl.tEnd, 50)].slice(-4);
  const L = sim.landing;
  const zs = P.zoneBounds(zone());
  let ok = sim.status === 'success', title, body, tone;
  const air = L ? ` Airtime ${fmtT(L.t)}, peak ${fmtL(sim.apex.y)}.` : '';
  if (c.type === 'calculate') {
    const err = L ? Math.abs(st.answer - L.x) : Infinity;
    ok = err <= ft(c.success.tolerance);
    title = ok ? 'Called it' : 'Not quite';
    body = `You predicted ${fmtL(st.answer)}. The rider landed at ${L ? fmtL(L.x) : 'no valid landing'}, off by ${Number.isFinite(err) ? fmtL(err) : '—'}.` + (ok ? ' Your math matches the simulation.' : ' Open the worked solution to find where the numbers split.');
    tone = ok ? 'success' : 'fail';
  } else if (!ok) {
    tone = sim.status === 'overshoot' ? 'near' : 'fail';
    if (sim.status === 'undershoot') {
      title = sim.hitsFace ? 'Hit the face' : `Short by ${fmtL(-sim.miss)}`;
      body = (sim.hitsFace ? 'You were still below deck height when you reached the edge.' : `You reached deck height at ${fmtL(L.x)}; the deck starts at ${fmtL(zs.start)}.`) + ' You need more distance: more airtime, more forward speed, or both.';
    } else if (sim.status === 'overshoot') {
      title = `Long by ${fmtL(sim.miss)}`;
      body = `You landed at ${fmtL(L.x)}, past the end of the zone at ${fmtL(zs.end)}. Take a little off.`;
    } else { title = 'No landing'; body = statusLong(sim); }
  } else if (c.type === 'min-speed') {
    const past = L.x - zs.start;
    const vmin = P.speedForDistance(zs.start, S.vars.angle, S.vars.takeoffElev, S.vars.landingElev);
    if (past > ft(c.success.maxPastStart)) {
      ok = false; tone = 'near'; title = 'Cleared it, with speed to spare';
      body = `You landed ${fmtL(past)} past the edge. That means you're carrying more speed than you need. Back it off and find the minimum.`;
    } else {
      title = 'Minimum speed found';
      body = `${fmtS(S.vars.speed)} lands ${fmtL(past)} past the edge. The exact minimum from the formula is ${fmtS(vmin)}. Any slower and you land in the gap.` + air;
      tone = 'success';
    }
  } else if (c.type === 'two-jumps') {
    st.jumps.push({ angle: S.vars.angle, speed: S.vars.speed, t: L.t, h: sim.apex.y, x: L.x });
    const pair = findPair(st.jumps, c.success.minAngleDiff);
    if (pair) {
      title = 'Two different jumps, same landing';
      const [a, b] = pair;
      body = `${fmtA(a.angle)} at ${fmtS(a.speed)} vs ${fmtA(b.angle)} at ${fmtS(b.speed)}. The steeper jump flew ${fmtT(Math.max(a.t, b.t))} vs ${fmtT(Math.min(a.t, b.t))} and peaked ${fmtL(Math.abs(a.h - b.h))} higher.`;
      tone = 'success';
    } else {
      ok = false; tone = 'near'; title = `Jump ${st.jumps.length} logged`;
      body = `Landed at ${fmtL(L.x)} with a ${fmtA(S.vars.angle)} lip. Now land another one with an angle at least ${c.success.minAngleDiff}° different.`;
    }
  } else {
    title = 'Stuck it';
    body = `Landed ${fmtL(L.x)} out, ${fmtL(Math.abs(sim.targetError))} from the center of the zone.` + air;
    tone = 'success';
  }
  st.last = { title, body, tone };
  if (ok && !st.solved) { st.solved = true; S.session.completed.add(c.id); }
}
function findPair(jumps, minDiff) {
  for (let i = 0; i < jumps.length; i++) for (let j = i + 1; j < jumps.length; j++) if (Math.abs(jumps[i].angle - jumps[j].angle) >= minDiff - 1e-9) return [jumps[i], jumps[j]];
  return null;
}

/* ========================= activity panel ========================= */
function renderActivity() {
  const host = $('#activityPanel');
  if (S.mode === 'explore') host.innerHTML = exploreHTML();
  else host.innerHTML = S.showList ? listHTML() : missionHTML(currentChallenge());
  if (S.mode === 'explore') renderLiveFeedback();
  const send = $('#sendBtn');
  const c = currentChallenge();
  send.disabled = !!(c && !S.showList && !canSend(c));
  send.title = send.disabled ? (c.type === 'calculate' && chState(c.id).answer === null ? 'Lock in your answer first' : 'Make a prediction first') : '';
}

function exploreHTML() {
  const p = S.predict;
  let pred = `<div class="row"><select id="predSel" aria-label="Prediction question" style="width:100%">${PREDICTIONS.map((q, i) => `<option value="${i}">${esc(q.prompt)}</option>`).join('')}</select><button class="btn" id="predStart">Make a prediction</button></div>`;
  if (p) {
    const q = PREDICTIONS[p.q];
    const opts = q.options.map((o, i) => {
      let cls = '';
      if (p.done) { if (i === p.correct) cls = 'correct'; else if (i === p.choice) cls = 'wrong'; }
      return `<button class="opt ${cls}" data-pick="${i}" aria-pressed="${p.choice === i}" ${p.done ? 'disabled' : ''}>${esc(o.label)}</button>`;
    }).join('');
    const label = { distance: 'Distance', height: 'Height gained above the lip', time: 'Airtime' }[q.measure];
    const fmtM = (x) => (q.measure === 'time' ? fmtT(x) : fmtL(x));
    pred = `<p><strong>${esc(q.prompt)}</strong></p><div class="opts">${opts}</div>
      ${p.done ? `<div class="feedback ${p.choice === p.correct ? 'success' : 'fail'}"><strong>${p.choice === p.correct ? 'Your prediction held up' : 'Surprise'}</strong>
        ${label}: ${p.before == null ? '—' : fmtM(p.before)} → ${p.after == null ? '—' : fmtM(p.after)} (${p.ratio ? ((p.ratio - 1) * 100 >= 0 ? '+' : '') + ((p.ratio - 1) * 100).toFixed(0) + '%' : 'n/a'}).<br>${esc(q.why)}</div>
        <div class="row"><button class="btn small" id="predUndo">Undo the change</button><button class="btn small ghost" id="predClose">Done</button></div>`
      : `<div class="row"><button class="btn primary" id="predReveal" ${p.choice == null ? 'disabled' : ''}>Reveal</button><button class="btn small ghost" id="predClose">Cancel</button></div>`}`;
  }
  return `<h2>Explore</h2>
    <p style="margin:0 0 12px;color:var(--muted)">Move any slider and the arc updates live. Hit <b>Send it</b> to ride it, or scrub time to step through the flight.</p>
    <div id="liveFb"></div>
    <div class="block"><div class="eyebrow">Predict, then test</div>${pred}</div>
    <div class="block"><div class="eyebrow">Compare two jumps</div>
      <div class="row"><button class="btn small" id="saveA"><span class="swatch" style="background:var(--cmpA)"></span>Save as A</button><button class="btn small" id="saveB"><span class="swatch" style="background:var(--cmpB)"></span>Save as B</button>${S.compare.A || S.compare.B ? '<button class="btn small ghost" id="clearCmp">Clear</button>' : ''}</div>
      ${compareTable()}</div>
    <div class="block"><button class="btn" data-goto="challenge">Try the missions →</button></div>`;
}
function renderLiveFeedback() {
  const el = $('#liveFb');
  if (!el) return;
  const sim = VIEW.sim;
  if (!resultVisible()) { el.innerHTML = `<div class="feedback"><strong>Result hidden</strong>Make your call, then send it.</div>`; return; }
  const tone = sim.status === 'success' ? 'success' : sim.status === 'overshoot' ? 'near' : 'fail';
  el.innerHTML = `<div class="feedback ${tone}"><strong>${esc(statusShort(sim))}</strong>${esc(statusLong(sim))}${sim.landing ? ` Airtime ${fmtT(sim.landing.t)}.` : ''}</div>`;
}
function snapshot() {
  const c = cfg(), z = zone(), sim = P.simulate(c, z), g = geometry(c, z), fl = flight(c, z, sim, g);
  const path = pathPts(c, fl.tEnd, 60);
  return { vars: { ...S.vars }, sim, path, endX: path.at(-1).x };
}
function compareTable() {
  const A = S.compare.A, B = S.compare.B;
  if (!A && !B) return '<p style="margin:8px 0 0;color:var(--muted);font-size:14px">Save the current jump as A, change something, save it as B. Both arcs stay on the canvas.</p>';
  const row = (name, f, diff) => `<tr><td>${name}</td><td>${A ? f(A) : '—'}</td><td>${B ? f(B) : '—'}</td>${diff ? `<td>${A && B ? diff(A, B) : '—'}</td>` : '<td></td>'}</tr>`;
  const L = (j) => j.sim.landing;
  const pctd = (a, b) => (a && b ? `${((b / a - 1) * 100 >= 0 ? '+' : '')}${((b / a - 1) * 100).toFixed(0)}%` : '—');
  return `<div style="overflow-x:auto;margin-top:10px"><table class="cmp"><thead><tr><th></th><th><span class="swatch" style="background:var(--cmpA)"></span>A</th><th><span class="swatch" style="background:var(--cmpB)"></span>B</th><th>B vs A</th></tr></thead><tbody>
    ${row('Speed', (j) => fmtS(j.vars.speed), (a, b) => pctd(a.vars.speed, b.vars.speed))}
    ${row('Angle', (j) => fmtA(j.vars.angle))}
    ${row('Flight time', (j) => (L(j) ? fmtT(L(j).t) : '—'), (a, b) => pctd(L(a)?.t, L(b)?.t))}
    ${row('Distance', (j) => (L(j) ? fmtL(L(j).x) : '—'), (a, b) => pctd(L(a)?.x, L(b)?.x))}
    ${row('Max height', (j) => fmtL(j.sim.apex.y))}
    ${row('Lands at', (j) => (L(j) ? `(${fmtL(L(j).x)}, ${fmtL(L(j).y)})` : 'none'))}
    ${row('Result', (j) => statusShort(j.sim))}
  </tbody></table></div>`;
}

function listHTML() {
  const items = CHALLENGES.map((c, i) => ({ c, i })).filter(({ c }) => S.diffFilter === 'all' || c.difficulty === S.diffFilter);
  return `<h2>Missions</h2>
    <div class="filters" role="group" aria-label="Difficulty">${['all', ...DIFFS].map((d) => `<button class="chip" data-diff="${d}" aria-pressed="${S.diffFilter === d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
    <div class="challenge-list">${items.map(({ c, i }) => {
      const st = S.ch[c.id];
      return `<button class="cl-item" data-ch="${c.id}" aria-current="${c.id === S.challengeId}"><span class="n">${i + 1}</span><span><span class="t">${esc(c.title)}</span><br><span class="s"><span class="diff ${c.difficulty}">${c.difficulty}</span></span></span>${st?.solved ? '<span class="done">✓ Done</span>' : st?.attempts ? `<span class="s">${st.attempts} tries</span>` : '<span></span>'}</button>`;
    }).join('') || '<p style="color:var(--muted)">No missions at this level yet.</p>'}</div>`;
}

function missionHTML(c) {
  const st = chState(c.id);
  const idx = CHALLENGES.indexOf(c);
  const lockedList = VARS.filter((v) => isLocked(v.key) && v.key in { ...c.fixed, targetX: 1, zoneWidth: 1 }).map((v) => {
    if ((v.key === 'targetX' || v.key === 'zoneWidth') && c.hideZoneUntilAnswered && st.answer === null) return `<span class="varchip fix">${esc(v.label)}: hidden</span>`;
    return `<span class="varchip fix">🔒 ${esc(v.label)}: ${v.kind === 'angle' ? fmtA(S.vars[v.key]) : v.kind === 'speed' ? fmtS(S.vars[v.key]) : fmtL(S.vars[v.key])}</span>`;
  }).join('');
  const adj = VARS.filter((v) => !isLocked(v.key)).map((v) => `<span class="varchip adj">↔ ${esc(v.label)}</span>`).join('');
  let pre = '';
  if (c.prediction) {
    const pr = c.prediction, chosen = st.predicted;
    const reveal = chosen !== null && st.attempts > 0;
    pre = `<div class="block"><div class="eyebrow">Before you jump</div><p style="margin:0"><strong>${esc(pr.prompt)}</strong></p><div class="opts">${pr.options.map((o, i) => {
      let cls = '';
      if (reveal) { if (i === pr.answer) cls = 'correct'; else if (i === chosen) cls = 'wrong'; }
      return `<button class="opt ${cls}" data-cpred="${i}" aria-pressed="${chosen === i}" ${chosen !== null ? 'disabled' : ''}>${esc(o)}</button>`;
    }).join('')}</div>${reveal ? `<p style="margin:0;font-size:14px;color:var(--muted)">${esc(pr.why)}</p>` : chosen !== null ? '<p style="margin:0;font-size:14px;color:var(--muted)">Locked in. Send it to see if you were right.</p>' : ''}</div>`;
  }
  let calc = '';
  if (c.type === 'calculate') {
    calc = st.answer === null
      ? `<div class="block"><div class="eyebrow">Your answer</div><label for="ansIn" style="font-size:14px">Landing distance x<sub>L</sub></label><div class="answer-in"><input id="ansIn" type="number" step="0.1" inputmode="decimal" placeholder="?"><span class="unit">${unitOf('length')}</span><button class="btn" id="ansLock">Lock in answer</button></div><div class="err" id="ansErr" role="alert" style="color:var(--bad);font-size:13px"></div></div>`
      : `<div class="block"><div class="eyebrow">Your answer</div><div class="row"><span class="num" style="font-size:20px">${fmtL(st.answer)}</span><button class="btn small ghost" id="ansClear">Change answer</button></div></div>`;
  }
  const fb = st.last ? `<div class="feedback ${st.last.tone}" role="status"><strong>${esc(st.last.title)}</strong>${esc(st.last.body)}</div>` : '';
  const jumps = c.type === 'two-jumps' && st.jumps.length ? `<div class="block"><div class="eyebrow">Landed jumps</div><ol class="steps">${st.jumps.map((j) => `<li>${fmtA(j.angle)} @ ${fmtS(j.speed)} → ${fmtL(j.x)}, airtime ${fmtT(j.t)}</li>`).join('')}</ol></div>` : '';
  const hintsShown = c.hints.slice(0, st.hints);
  const hintBtn = st.hints < c.hints.length ? `<button class="btn small" id="hintBtn">Get hint ${st.hints + 1} of ${c.hints.length}</button>` : '';
  const solOk = st.attempts > 0 || S.tutor;
  return `<div class="row" style="justify-content:space-between"><span class="eyebrow">Mission ${idx + 1} of ${CHALLENGES.length}</span><button class="btn small ghost" id="toList">All missions</button></div>
    <div class="mission"><div class="row" style="margin-top:6px"><span class="diff ${c.difficulty}">${c.difficulty}</span>${st.solved ? '<span class="done">✓ Completed</span>' : ''}<span class="s" style="color:var(--muted);font-size:13px;margin-left:auto">Attempts: <span class="num">${st.attempts}</span></span></div>
      <h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>
      <ul>${c.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      <div class="varchips">${adj}${lockedList}</div>
      <p style="font-size:14px"><b>Success:</b> ${esc(successText(c))}</p>
    </div>
    ${pre}${calc}
    ${fb ? `<div class="block">${fb}</div>` : ''}${jumps}
    ${st.solved ? `<div class="block"><div class="eyebrow">Why it works</div><p style="margin:0">${esc(c.explanation)}</p></div>` : ''}
    <div class="block"><div class="eyebrow">Hints</div>${hintsShown.map((h, i) => `<div class="hint"><b>${i + 1}</b>${esc(h)}</div>`).join('')}${hintBtn || '<span style="font-size:13px;color:var(--muted)">All hints shown.</span>'}</div>
    <div class="block"><div class="eyebrow">Worked solution</div>${st.solution ? `<ol class="steps">${c.solution.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p style="margin:0;font-size:12px;color:var(--muted)">Worked in feet and ft/s, with g = 32.17 ft/s².</p>` : `<button class="btn small" id="solBtn" ${solOk ? '' : 'disabled'}>Show worked solution</button>${solOk ? '' : '<span style="font-size:13px;color:var(--muted)"> Unlocks after your first attempt.</span>'}`}</div>
    <div class="block row">${idx > 0 ? `<button class="btn small ghost" data-ch="${CHALLENGES[idx - 1].id}">← Previous</button>` : ''}${idx < CHALLENGES.length - 1 ? `<button class="btn small${st.solved ? '' : ' ghost'}" data-ch="${CHALLENGES[idx + 1].id}" style="margin-left:auto">Next mission →</button>` : ''}</div>`;
}

/* ============================ predictions ============================ */
function measureOf(sim, q, c) {
  if (q.measure === 'distance') return sim.landing?.x ?? null;
  if (q.measure === 'time') return sim.landing?.t ?? null;
  if (q.measure === 'height') return sim.apex.y - c.y0;
  return null;
}
function revealPrediction() {
  const p = S.predict, q = PREDICTIONS[p.q];
  const before = measureOf(P.simulate(cfg(), zone()), q, cfg());
  p.undo = { ...S.vars };
  const imp = { speed: U.msToMph(S.vars.speed), angle: S.vars.angle, landingElev: U.mToFt(S.vars.landingElev) };
  const next = q.apply(imp);
  if (next.speed !== imp.speed) S.vars.speed = Math.min(U.mphToMs(next.speed), U.mphToMs(70));
  if (next.angle !== imp.angle) S.vars.angle = next.angle;
  if (next.landingElev !== imp.landingElev) S.vars.landingElev = ft(next.landingElev);
  const after = measureOf(P.simulate(cfg(), zone()), q, cfg());
  const ratio = before && after != null ? after / before : null;
  p.before = before; p.after = after; p.ratio = ratio;
  p.correct = ratio == null ? -1 : q.options.findIndex((o) => o.test(ratio));
  p.done = true;
  S.session.predictions++;
  if (p.choice === p.correct) S.session.correct++;
  syncControls();
  onSetupChanged();
  renderActivity();
  sendIt();
}

/* ============================ workbench ============================ */
const EQ = [
  { name: 'Horizontal position', f: 'x(t) = v₀ cos(θ) · t', s: 'Forward distance = forward speed × time.', a: 'No horizontal force, so aₓ = 0 and x grows linearly with t.' },
  { name: 'Vertical position', f: 'y(t) = y₀ + v₀ sin(θ) · t − ½ g t²', s: 'Start at the lip height, climb with your upward speed, and gravity pulls you back down.', a: 'Quadratic in t. The −½gt² term makes y(t) a downward-opening parabola.' },
  { name: 'Horizontal velocity', f: 'vₓ = v₀ cos(θ)', s: 'Your forward speed never changes in the air.', a: 'The cosine component of the launch vector. Constant because aₓ = 0.' },
  { name: 'Vertical velocity', f: 'vᵧ = v₀ sin(θ) − g t', s: 'Upward speed drops by g every second, hits zero at the peak, then you fall.', a: 'Linear in t with slope −g. vᵧ = 0 at t_peak = v₀ sin(θ) / g.' },
  { name: 'Landing time', f: 't_L = [v₀ sinθ + √((v₀ sinθ)² + 2g(y₀ − y_L))] / g', s: 'When do you touch down? Set y(t) equal to the landing height and solve.', a: 'Quadratic formula on ½gt² − (v₀ sinθ)t − (y₀ − y_L) = 0, keeping the + root (the way down). Negative discriminant ⇒ no real landing.' },
  { name: 'Landing distance', f: 'x_L = v₀ cos(θ) · t_L', s: 'Plug the landing time into the forward-distance equation.', a: 'Composition: x_L = x(t_L). Range on flat ground reduces to v₀² sin(2θ) / g.' },
  { name: 'Peak height', f: 'y_max = y₀ + (v₀ sinθ)² / 2g', s: 'How high above the datum you get at the top of the arc.', a: 'From vᵧ² = (v₀ sinθ)² − 2g(y − y₀) with vᵧ = 0.' },
  { name: 'Path shape y(x)', f: 'y = y₀ + x tanθ − g x² / (2 v₀² cos²θ)', s: 'Eliminate time and the path itself is a parabola in x.', a: 'Substitute t = x / (v₀ cosθ) into y(t). This is the curve drawn on the canvas.', adv: true },
];
const DEFS = [['v₀', 'takeoff speed (along the lip)'], ['θ', 'launch angle above horizontal'], ['g', 'gravity, 32.17 ft/s² or 9.81 m/s²'], ['t', 'time since leaving the lip'], ['y₀', 'lip height above the datum (y = 0)'], ['y_L', 'landing deck height'], ['x_L', 'horizontal distance to touchdown'], ['vₓ, vᵧ', 'horizontal and vertical parts of velocity']];

function renderWorkbench() {
  const host = $('#wbContent');
  document.querySelectorAll('#workbench .tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === S.wbTab));
  if (S.eqHidden && S.wbTab !== 'concepts') { host.innerHTML = '<p class="hidden-note">Your tutor has hidden the equations for now. Make your prediction first.</p>'; return; }
  if (S.wbTab === 'eq') {
    const adv = S.level === 'advanced';
    host.innerHTML = `<div class="eqgrid">${EQ.filter((e) => adv || !e.adv).map((e) => `<div class="eq"><div class="name">${e.name}</div><div class="f">${e.f}</div><div class="d">${adv ? e.a : e.s}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn small" id="defsBtn" aria-expanded="${S.defs}">${S.defs ? 'Hide' : 'Show'} what each symbol means</button></div>
      ${S.defs ? `<dl class="defs">${DEFS.map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('')}</dl>` : ''}`;
  } else if (S.wbTab === 'sub') {
    host.innerHTML = substitutionHTML();
  } else {
    host.innerHTML = `<div class="concepts">${Object.entries(CONCEPTS).map(([k, c]) => `<button class="concept" data-concept="${k}" aria-expanded="${S.session.concepts.has(k)}"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p></button>`).join('')}</div>`;
  }
}

function substitutionHTML() {
  const c = currentChallenge();
  if (c && c.type === 'calculate' && chState(c.id).answer === null) return '<p class="hidden-note">Locked during this mission. Work it out by hand, lock in your answer, then this tab shows the full calculation.</p>';
  if (S.blind && !S.revealed) return '<p class="hidden-note">Hidden until the tutor reveals the jump.</p>';
  const m = met();
  const gU = m ? 9.81 : 32.17, vu = U.UNIT_SYSTEMS[S.units].velocity, lu = unitOf('length');
  const g = U.gFromSI(P.G, S.units);
  const v0d = U.speedFromSI(S.vars.speed, S.units), v0 = U.velocityFromSI(S.vars.speed, S.units);
  const th = S.vars.angle, rad = P.degToRad(th);
  const y0 = U.lengthFromSI(S.vars.takeoffElev, S.units), yL = U.lengthFromSI(S.vars.landingElev, S.units);
  const vx = v0 * Math.cos(rad), vy = v0 * Math.sin(rad);
  const f = (x, d = 2) => (+x).toFixed(d);
  const disc = vy * vy + 2 * g * (y0 - yL);
  const steps = [];
  steps.push(['Convert speed to ' + vu, m ? `v₀ = ${f(v0d, 1)} km/h ÷ 3.6 = <b>${f(v0)} ${vu}</b>` : `v₀ = ${f(v0d, 1)} mph × 5280 / 3600 = <b>${f(v0)} ${vu}</b>`]);
  steps.push(['Split the velocity', `vₓ = ${f(v0)} · cos ${f(th, 1)}° = ${f(v0)} × ${f(Math.cos(rad), 4)} = <b>${f(vx)} ${vu}</b><br>vᵧ = ${f(v0)} · sin ${f(th, 1)}° = ${f(v0)} × ${f(Math.sin(rad), 4)} = <b>${f(vy)} ${vu}</b>`]);
  steps.push(['Peak of the arc', `t_peak = vᵧ / g = ${f(vy)} / ${f(gU)} = <b>${f(vy / g, 3)} s</b><br>y_max = ${f(y0)} + ${f(vy)}² / (2 × ${f(gU)}) = <b>${f(y0 + (vy * vy) / (2 * g))} ${lu}</b>`]);
  if (disc < 0) {
    steps.push(['Landing time', `vᵧ² + 2g(y₀ − y_L) = ${f(vy * vy)} + 2 × ${f(gU)} × (${f(y0)} − ${f(yL)}) = <b>${f(disc)}</b><br>Square root of a negative number has no real answer. The deck is above your peak, so there is no landing.`]);
  } else {
    const tL = (vy + Math.sqrt(disc)) / g;
    steps.push(['Landing time (quadratic, + root)', `t_L = [${f(vy)} + √(${f(vy * vy)} + 2 × ${f(gU)} × (${f(y0)} − ${f(yL)}))] / ${f(gU)}<br>&nbsp;&nbsp;&nbsp;&nbsp;= [${f(vy)} + √${f(disc)}] / ${f(gU)} = [${f(vy)} + ${f(Math.sqrt(disc))}] / ${f(gU)} = <b>${f(tL, 3)} s</b>`]);
    const xL = vx * tL;
    steps.push(['Landing distance', `x_L = vₓ · t_L = ${f(vx)} × ${f(tL, 3)} = <b>${f(xL)} ${lu}</b>`]);
    if (!hiddenByMission()) {
      const zs = P.zoneBounds(zone());
      const a = U.lengthFromSI(zs.start, S.units), b = U.lengthFromSI(zs.end, S.units);
      const verdict = xL < a ? `${f(xL)} &lt; ${f(a)} → short` : xL > b ? `${f(xL)} &gt; ${f(b)} → overshoot` : `${f(a)} ≤ ${f(xL)} ≤ ${f(b)} → in the zone`;
      steps.push(['Check the landing zone', `Zone runs ${f(a)} to ${f(b)} ${lu}: ${verdict}`]);
    }
  }
  return `<div class="work">${steps.map(([w, mth]) => `<div class="stp"><div><div class="what">${w}</div><div class="math">${mth}</div></div></div>`).join('')}</div>
    <p style="margin:12px 0 0;font-size:12px;color:var(--muted)">Values update as you move the sliders. Rounded for display; the simulation keeps full precision.</p>`;
}

/* ============================== tutor ============================== */
const DISCUSS = [
  'What do you think will happen if we double the speed?',
  'What happens if we increase the angle but keep speed the same?',
  'Which variable has the greatest effect on horizontal distance?',
  'Why does the trajectory form a parabola?',
  'At the very top of the jump, what is vᵧ? What is vₓ?',
  'Where in the jump is the rider moving fastest? Why?',
];
function renderTutor() {
  const host = $('#tutorPanel');
  host.hidden = !S.tutor;
  if (!S.tutor) return;
  const c = currentChallenge();
  const st = c ? chState(c.id) : null;
  host.innerHTML = `<h2>Tutor controls <span class="tag">TUTOR</span></h2>
    <label for="tActivity" class="sub" style="display:block;margin-top:0">Activity</label>
    <select id="tActivity" style="width:100%"><option value="explore" ${S.mode === 'explore' ? 'selected' : ''}>Explore (free play)</option>${CHALLENGES.map((x, i) => `<option value="${x.id}" ${c?.id === x.id ? 'selected' : ''}>Mission ${i + 1}: ${esc(x.title)}</option>`).join('')}</select>
    <div class="sub">Lock variables</div>
    <div class="locks">${VARS.map((v) => `<button class="btn small" data-lock="${v.key}" aria-pressed="${isLocked(v.key)}">${isLocked(v.key) ? '🔒' : '🔓'} ${esc(v.label)}</button>`).join('')}</div>
    <div class="sub">Reveal and hide</div>
    <div class="row">
      <button class="btn small" id="tEq" aria-pressed="${S.eqHidden}">${S.eqHidden ? 'Show equations' : 'Hide equations'}</button>
      <button class="btn small" id="tBlind" aria-pressed="${S.blind}">Hide result until reveal</button>
      ${S.blind ? `<button class="btn small" id="tReveal" ${S.revealed ? 'disabled' : ''}>Reveal now</button>` : ''}
    </div>
    <div class="sub">Pause and discuss</div>
    <div class="row"><select id="tQ" style="flex:1;min-width:0">${DISCUSS.map((q, i) => `<option value="${i}" ${i === S.discussQ ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select><button class="btn small" id="tAsk">Ask</button></div>
    ${c ? `<div class="sub">Hints for “${esc(c.title)}”</div><div style="display:grid;gap:6px">${c.hints.map((h, i) => `<button class="btn small" data-thint="${i}" ${i < st.hints ? 'disabled' : ''} style="justify-content:flex-start;text-align:left">${i < st.hints ? '✓ Shown' : 'Reveal'} hint ${i + 1}</button>`).join('')}<button class="btn small" id="tSol" ${st.solution ? 'disabled' : ''}>${st.solution ? '✓ Solution shown' : 'Reveal worked solution'}</button></div>` : ''}
    <div class="sub">Setup</div>
    <div class="row"><button class="btn small" id="tReset">Reset to starting values</button></div>
    <p style="margin:10px 0 0;font-size:13px;color:var(--muted)">Type exact values in the number boxes to set initial conditions. Unlock a variable first if it is locked.</p>`;
}
function showDiscussion() {
  stopAnim();
  const o = $('#overlay');
  o.hidden = false;
  o.innerHTML = `<div class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="dq"><div class="eyebrow">Pause and discuss</div><h3 id="dq">${esc(DISCUSS[S.discussQ])}</h3><p>Talk it through and commit to a prediction before you reveal.</p><div class="row"><button class="btn primary" id="dReveal">Reveal the jump</button><button class="btn ghost" id="dClose">Back</button></div></div>`;
  $('#dReveal').focus();
}
function hideOverlay() { $('#overlay').hidden = true; }

function resetSetup() {
  if (S.mode === 'challenge') return loadChallenge(S.challengeId);
  for (const k in EXPLORE_DEFAULTS) S.vars[k] = impToSI(VAR[k].kind, EXPLORE_DEFAULTS[k]);
  S.inputErr = {};
  syncControls();
  onSetupChanged();
}

/* ============================== session ============================== */
function sessionSummary() {
  const s = S.session;
  const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  const hard = CHALLENGES.filter((c) => S.ch[c.id] && (S.ch[c.id].attempts >= 4 || S.ch[c.id].hints >= 2 || (S.ch[c.id].attempts >= 2 && !S.ch[c.id].solved)));
  const revisit = [...new Set(hard.flatMap((c) => c.concepts))];
  const hints = CHALLENGES.filter((c) => S.ch[c.id]?.hints).map((c) => `${c.title} (${S.ch[c.id].hints})`);
  const text = [
    `Jump Lab session — ${new Date(s.start).toLocaleDateString()}`,
    `Time: ${mins} min · Jumps: ${s.jumps}`,
    `Missions started: ${s.started.size} · completed: ${s.completed.size} (${[...s.completed].map((id) => CHALLENGES.find((c) => c.id === id).title).join(', ') || 'none'})`,
    `Challenge attempts: ${s.attempts} · Hints used: ${s.hints}${hints.length ? ' — ' + hints.join(', ') : ''}`,
    `Predictions: ${s.predictions} (${s.correct} correct)`,
    `Concepts explored: ${[...s.concepts].join(', ') || 'none yet'}`,
    `Areas of difficulty: ${hard.map((c) => c.title).join(', ') || 'none flagged'}`,
    `Concepts to revisit: ${revisit.join(', ') || 'none flagged'}`,
  ].join('\n');
  return { s, mins, hard, revisit, text };
}
function showSession() {
  const { s, mins, hard, revisit, text } = sessionSummary();
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<section class="panel" role="dialog" aria-modal="true" aria-labelledby="sessT"><h2 id="sessT">This session</h2>
    <div class="stats">
      <div class="stat"><div class="v">${mins}m</div><div class="k">Time in lab</div></div>
      <div class="stat"><div class="v">${s.completed.size}/${CHALLENGES.length}</div><div class="k">Missions done</div></div>
      <div class="stat"><div class="v">${s.attempts}</div><div class="k">Mission attempts</div></div>
      <div class="stat"><div class="v">${s.hints}</div><div class="k">Hints used</div></div>
      <div class="stat"><div class="v">${s.correct}/${s.predictions}</div><div class="k">Predictions right</div></div>
      <div class="stat"><div class="v">${s.jumps}</div><div class="k">Total jumps</div></div>
    </div>
    <p style="margin:0 0 6px"><b>Concepts explored:</b> ${esc([...s.concepts].join(', ') || 'none yet')}</p>
    <p style="margin:0 0 6px"><b>Areas of difficulty:</b> ${esc(hard.map((c) => c.title).join(', ') || 'none flagged')}</p>
    <p style="margin:0 0 12px"><b>Concepts to revisit:</b> ${esc(revisit.join(', ') || 'none flagged')}</p>
    <p style="margin:0 0 12px;font-size:13px;color:var(--muted)">Stored only in this browser tab. No personal information is collected.</p>
    <textarea id="sessText" readonly rows="6" style="width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px;font:13px var(--f-mono);color:var(--bone)">${esc(text)}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn" id="copySess">Copy summary</button><span id="copyMsg" style="font-size:13px;color:var(--muted)"></span><button class="btn ghost" id="closeSess" style="margin-left:auto">Close</button></div></section>`;
  $('#closeSess').focus();
}

/* ============================== wiring ============================== */
function announce(msg) { $('#live').textContent = msg; }
const TOGGLES = [['path', 'Predicted path'], ['grid', 'Grid'], ['vectors', 'Velocity vectors'], ['measure', 'Measurements'], ['annot', 'Equation labels']];
function renderToggles() {
  $('#toggles').innerHTML = TOGGLES.map(([k, l]) => `<button class="chip" data-tog="${k}" aria-pressed="${S.toggles[k]}"${k === 'path' && hiddenByMission() ? ' disabled title="Hidden for this mission"' : ''}>${l}</button>`).join('');
}
function renderHeader() {
  $('#tabExplore').setAttribute('aria-selected', S.mode === 'explore');
  $('#tabChallenge').setAttribute('aria-selected', S.mode === 'challenge');
  $('#uImp').setAttribute('aria-pressed', !met());
  $('#uMet').setAttribute('aria-pressed', met());
  $('#tutorBtn').setAttribute('aria-pressed', S.tutor);
  $('#lvlSimple').setAttribute('aria-pressed', S.level === 'simple');
  $('#lvlAdv').setAttribute('aria-pressed', S.level === 'advanced');
  $('#ctlTitle').textContent = S.mode === 'challenge' ? 'Mission Setup' : 'Jump Setup';
}
function refreshAll() {
  stopAnim();
  S.anim.t = 0;
  renderHeader();
  buildControls();
  renderToggles();
  renderScene();
  renderReadouts();
  renderActivity();
  renderWorkbench();
  renderTutor();
}
function setMode(mode) {
  if (mode === S.mode && !(mode === 'challenge' && !S.showList)) { if (mode === 'challenge') { S.showList = true; renderActivity(); } return; }
  if (mode === 'explore') {
    S.mode = 'explore';
    S.tutorLocks = {};
    S.ghosts = [];
    if (S.exploreVars) S.vars = { ...S.exploreVars };
    S.toggles.path = true;
    refreshAll();
  } else {
    if (S.mode === 'explore') S.exploreVars = { ...S.vars };
    if (S.mode !== 'challenge') loadChallenge(S.challengeId);
    S.showList = true;
    renderActivity();
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (t.id === 'tabExplore') return setMode('explore');
  if (t.id === 'tabChallenge' || d.goto === 'challenge') return setMode('challenge');
  if (t.id === 'uImp' || t.id === 'uMet') { S.units = t.id === 'uMet' ? 'metric' : 'imperial'; S.inputErr = {}; return refreshAll(); }
  if (t.id === 'tutorBtn') { S.tutor = !S.tutor; renderHeader(); renderTutor(); renderActivity(); return; }
  if (t.id === 'sessionBtn') return showSession();
  if (t.id === 'closeSess') { $('#modal').hidden = true; return $('#sessionBtn').focus(); }
  if (t.id === 'copySess') {
    const txt = sessionSummary().text, msg = $('#copyMsg');
    const fallback = () => { const ta = $('#sessText'); ta.focus(); ta.select(); msg.textContent = 'Selected. Press Ctrl/Cmd + C to copy.'; };
    try { navigator.clipboard.writeText(txt).then(() => (msg.textContent = 'Copied.'), fallback); } catch { fallback(); }
    return;
  }
  if (t.id === 'sendBtn') { hideOverlay(); return sendIt(); }
  if (t.id === 'playBtn') return S.anim.playing ? stopAnim() : play();
  if (t.id === 'resetBtn') { stopAnim(); S.anim.t = 0; S.flownKey = S.mode === 'explore' ? S.flownKey : null; hideOverlay(); renderScene(); renderReadouts(); return; }
  if (d.tog) { S.toggles[d.tog] = !S.toggles[d.tog]; renderToggles(); return renderScene(); }
  if (d.tab) { S.wbTab = d.tab; return renderWorkbench(); }
  if (t.id === 'lvlSimple' || t.id === 'lvlAdv') { S.level = t.id === 'lvlAdv' ? 'advanced' : 'simple'; renderHeader(); return renderWorkbench(); }
  if (t.id === 'wbToggle') { S.wbOpen = !S.wbOpen; $('#wbBody').hidden = !S.wbOpen; t.textContent = S.wbOpen ? 'Collapse' : 'Expand'; return t.setAttribute('aria-expanded', S.wbOpen); }
  if (t.id === 'defsBtn') { S.defs = !S.defs; return renderWorkbench(); }
  if (d.concept) { S.session.concepts.add(d.concept); const open = t.getAttribute('aria-expanded') === 'true'; t.setAttribute('aria-expanded', !open); return; }
  // explore
  if (t.id === 'predStart') { S.predict = { q: +$('#predSel').value, choice: null, done: false }; return renderActivity(); }
  if (d.pick != null) { S.predict.choice = +d.pick; return renderActivity(); }
  if (t.id === 'predReveal') return revealPrediction();
  if (t.id === 'predUndo') { S.vars = { ...S.predict.undo }; S.predict = null; syncControls(); onSetupChanged(); return renderActivity(); }
  if (t.id === 'predClose') { S.predict = null; return renderActivity(); }
  if (t.id === 'saveA' || t.id === 'saveB') { S.compare[t.id.slice(-1)] = snapshot(); renderScene(); return renderActivity(); }
  if (t.id === 'clearCmp') { S.compare = { A: null, B: null }; renderScene(); return renderActivity(); }
  // challenge
  if (t.id === 'toList') { S.showList = true; return renderActivity(); }
  if (d.diff) { S.diffFilter = d.diff; return renderActivity(); }
  if (d.ch) return loadChallenge(d.ch);
  if (d.cpred != null) { chState(S.challengeId).predicted = +d.cpred; S.session.predictions++; if (+d.cpred === currentChallenge().prediction.answer) S.session.correct++; return renderActivity(); }
  if (t.id === 'hintBtn' || d.thint != null) {
    const c = currentChallenge(), st = chState(c.id);
    const want = d.thint != null ? +d.thint + 1 : st.hints + 1;
    const added = Math.max(0, Math.min(want, c.hints.length) - st.hints);
    st.hints += added; S.session.hints += added;
    renderActivity(); return renderTutor();
  }
  if (t.id === 'solBtn' || t.id === 'tSol') { chState(S.challengeId).solution = true; renderActivity(); return renderTutor(); }
  if (t.id === 'ansLock') {
    const raw = $('#ansIn').value.trim(), x = Number(raw);
    if (raw === '' || !Number.isFinite(x) || x <= 0) { $('#ansErr').textContent = 'Enter a positive distance, like 21.5.'; return; }
    chState(S.challengeId).answer = U.lengthToSI(x, S.units);
    renderToggles(); renderScene(); renderReadouts(); renderActivity(); return renderWorkbench();
  }
  if (t.id === 'ansClear') { const st = chState(S.challengeId); st.answer = null; S.flownKey = null; renderToggles(); renderScene(); renderReadouts(); renderActivity(); return renderWorkbench(); }
  // tutor
  if (d.lock) { S.tutorLocks[d.lock] = !isLocked(d.lock); buildControls(); renderTutor(); return renderActivity(); }
  if (t.id === 'tEq') { S.eqHidden = !S.eqHidden; renderTutor(); return renderWorkbench(); }
  if (t.id === 'tBlind') { S.blind = !S.blind; S.revealed = !S.blind; renderTutor(); renderScene(); renderReadouts(); if (S.mode === 'explore') renderLiveFeedback(); return renderWorkbench(); }
  if (t.id === 'tReveal') { S.revealed = true; renderTutor(); renderScene(); renderReadouts(); if (S.mode === 'explore') renderLiveFeedback(); return renderWorkbench(); }
  if (t.id === 'tAsk') { S.discussQ = +$('#tQ').value; return showDiscussion(); }
  if (t.id === 'dReveal') { hideOverlay(); S.revealed = true; renderTutor(); return sendIt(); }
  if (t.id === 'dClose') return hideOverlay();
  if (t.id === 'tReset') { S.tutorLocks = {}; resetSetup(); return renderTutor(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'rate') S.anim.rate = +e.target.value;
  if (e.target.id === 'tActivity') { const v = e.target.value; if (v === 'explore') setMode('explore'); else { if (S.mode === 'explore') S.exploreVars = { ...S.vars }; loadChallenge(v); } }
  if (e.target.id === 'tQ') S.discussQ = +e.target.value;
});
$('#scrub').addEventListener('input', (e) => { stopAnim(); S.anim.t = (+e.target.value / 1000) * S.anim.endT; renderDynamic(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) { $('#modal').hidden = true; $('#sessionBtn').focus(); } else hideOverlay(); }
  if (e.key === 'Enter' && e.target.id === 'ansIn') $('#ansLock').click();
});

let lastSmall = null;
new ResizeObserver(() => { const sm = viewport().small; if (sm !== lastSmall) { lastSmall = sm; renderScene(); } }).observe($('.canvas-wrap'));

refreshAll();
