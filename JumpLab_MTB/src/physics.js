/**
 * Jump Lab — Physics Engine
 * --------------------------------------------------------------
 * Pure, deterministic 2D projectile-motion model. No DOM, no state.
 * All functions take and return SI units (m, s, m/s, radians unless
 * a name ends in "Deg"). Unit conversion lives in units.js.
 *
 * Model assumptions (PRD §5.1): constant g, no drag, no lift,
 * rider is a point mass, no in-flight input.
 */

export const G = 9.80665; // standard gravity, m/s²
const EPS = 1e-9;

export const degToRad = (d) => (d * Math.PI) / 180;
export const radToDeg = (r) => (r * 180) / Math.PI;

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Validate a jump configuration. Returns a list of human-readable
 * problems; empty list means the config is usable.
 */
export function validateConfig(cfg) {
  const errors = [];
  const fields = ['v0', 'angleDeg', 'y0', 'yL'];
  for (const f of fields) if (!isNum(cfg[f])) errors.push(`${f} must be a finite number`);
  if (isNum(cfg.v0) && cfg.v0 < 0) errors.push('Speed cannot be negative');
  if (isNum(cfg.angleDeg) && (cfg.angleDeg <= -90 || cfg.angleDeg >= 90))
    errors.push('Launch angle must be between -90° and 90°');
  if (cfg.g !== undefined && (!isNum(cfg.g) || cfg.g <= 0)) errors.push('Gravity must be positive');
  return errors;
}

/** Velocity components at launch: vₓ = v₀cosθ, vᵧ = v₀sinθ */
export function components(v0, angleDeg) {
  const th = degToRad(angleDeg);
  return { vx: v0 * Math.cos(th), vy: v0 * Math.sin(th) };
}

/** x(t), y(t) */
export function positionAt(cfg, t) {
  const g = cfg.g ?? G;
  const { vx, vy } = components(cfg.v0, cfg.angleDeg);
  return { x: vx * t, y: cfg.y0 + vy * t - 0.5 * g * t * t };
}

/** vₓ(t) = v₀cosθ (constant), vᵧ(t) = v₀sinθ − gt */
export function velocityAt(cfg, t) {
  const g = cfg.g ?? G;
  const { vx, vy } = components(cfg.v0, cfg.angleDeg);
  const vyt = vy - g * t;
  return { vx, vy: vyt, speed: Math.hypot(vx, vyt) };
}

/** Apex of the trajectory. If launched level/downward, apex is the lip. */
export function apex(cfg) {
  const g = cfg.g ?? G;
  const { vx, vy } = components(cfg.v0, cfg.angleDeg);
  if (vy <= 0) return { t: 0, x: 0, y: cfg.y0 };
  const t = vy / g;
  return { t, x: vx * t, y: cfg.y0 + (vy * vy) / (2 * g) };
}

/**
 * Time when the rider reaches elevation yL on the DESCENDING part of
 * the path (PRD §5.3):
 *   t_L = [v₀sinθ + √((v₀sinθ)² + 2g(y₀ − y_L))] / g
 * Returns null when the trajectory never reaches yL while descending.
 */
export function landingTime(cfg) {
  const g = cfg.g ?? G;
  const { vy } = components(cfg.v0, cfg.angleDeg);
  const disc = vy * vy + 2 * g * (cfg.y0 - cfg.yL);
  if (disc < -EPS) return null; // landing surface is above the apex
  const t = (vy + Math.sqrt(Math.max(0, disc))) / g;
  if (!(t > EPS)) return null; // only reached at/before launch
  // Must be descending (or at apex) when it gets there
  if (vy - g * t > EPS) return null;
  return t;
}

/** Landing time, position, velocity and impact angle, or null. */
export function landing(cfg) {
  const t = landingTime(cfg);
  if (t === null) return null;
  const p = positionAt(cfg, t);
  const v = velocityAt(cfg, t);
  return {
    t,
    x: p.x,
    y: cfg.yL,
    vx: v.vx,
    vy: v.vy,
    speed: v.speed,
    impactAngleDeg: radToDeg(Math.atan2(-v.vy, v.vx)), // degrees below horizontal
  };
}

export const RESULT = Object.freeze({
  UNDERSHOOT: 'undershoot',
  SUCCESS: 'success',
  OVERSHOOT: 'overshoot',
  NO_LANDING: 'no-landing',
  INVALID: 'invalid',
});

/**
 * Landing zone = [targetX − width/2, targetX + width/2].
 * The landing platform starts at the zone's near edge (the gap ends there).
 */
export function zoneBounds(zone) {
  return { start: zone.targetX - zone.width / 2, end: zone.targetX + zone.width / 2 };
}

export function classifyLanding(xL, zone) {
  if (xL === null || xL === undefined || !isNum(xL)) return RESULT.NO_LANDING;
  const { start, end } = zoneBounds(zone);
  if (xL < start - EPS) return RESULT.UNDERSHOOT;
  if (xL > end + EPS) return RESULT.OVERSHOOT;
  return RESULT.SUCCESS;
}

/**
 * Full simulation summary. Never throws — invalid input produces
 * { status: 'invalid', errors }.
 */
export function simulate(cfg, zone) {
  const errors = validateConfig(cfg);
  if (errors.length) return { status: RESULT.INVALID, errors };
  const { vx, vy } = components(cfg.v0, cfg.angleDeg);
  const top = apex(cfg);
  const land = landing(cfg);
  let status = zone ? classifyLanding(land ? land.x : null, zone) : land ? null : RESULT.NO_LANDING;
  // The landing deck is a solid block starting at the zone's near edge. If the
  // rider is still below deck height when reaching that edge, they hit its face.
  const hitsFace = !!(zone && land && status !== RESULT.UNDERSHOOT && strikesFace(cfg, zone));
  if (hitsFace) status = RESULT.UNDERSHOOT;
  let miss = null;
  if (zone && land) {
    const { start, end } = zoneBounds(zone);
    miss = land.x < start ? land.x - start : land.x > end ? land.x - end : 0;
  }
  return { status, errors: [], vx, vy, apex: top, landing: land, miss, hitsFace, targetError: zone && land ? land.x - zone.targetX : null };
}

/** True if the rider is below the deck top (yL) when x reaches the deck edge. */
export function strikesFace(cfg, zone) {
  const { start } = zoneBounds(zone);
  const { vx } = components(cfg.v0, cfg.angleDeg);
  if (!(start > 0) || !(vx > EPS)) return false;
  return positionAt(cfg, start / vx).y < cfg.yL - 1e-6;
}

/**
 * Sample the path for drawing. Stops at landing, or at tMax if the
 * rider never lands (so the renderer can still show the arc).
 */
export function samplePath(cfg, n = 120, tMaxFallback = 3) {
  const land = landingTime(cfg);
  const tEnd = land ?? tMaxFallback;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (tEnd * i) / n;
    const p = positionAt(cfg, t);
    pts.push({ t, x: p.x, y: p.y });
  }
  return { points: pts, tEnd, landed: land !== null };
}

/* ---------- Inverse solvers (used for worked solutions & checks) ---------- */

/**
 * Minimum launch speed so the path passes through (x, yL) at angle θ:
 *   yL = y₀ + x·tanθ − g·x² / (2v²cos²θ)
 *   ⇒ v = √( g·x² / (2cos²θ·(y₀ − yL + x·tanθ)) )
 * Returns null if no speed works (denominator ≤ 0).
 */
export function speedForDistance(x, angleDeg, y0, yL, g = G) {
  const th = degToRad(angleDeg);
  const c = Math.cos(th);
  const denom = 2 * c * c * (y0 - yL + x * Math.tan(th));
  if (!(x > 0) || denom <= EPS) return null;
  return Math.sqrt((g * x * x) / denom);
}

/**
 * All launch angles (within [minDeg, maxDeg]) that land exactly at x.
 * Closed form via tan θ quadratic:
 *   (g x²/2v²)·T² − x·T + (g x²/2v² − (y₀ − yL)) = 0, T = tanθ
 */
export function anglesForDistance(x, v0, y0, yL, g = G, minDeg = -89, maxDeg = 89) {
  if (!(x > 0) || !(v0 > 0)) return [];
  const k = (g * x * x) / (2 * v0 * v0);
  const a = k, b = -x, c = k - (y0 - yL);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
  const out = [];
  for (const T of roots) {
    const d = radToDeg(Math.atan(T));
    if (d >= minDeg - EPS && d <= maxDeg + EPS && landingTime({ v0, angleDeg: d, y0, yL, g }) !== null) {
      if (!out.some((o) => Math.abs(o - d) < 1e-6)) out.push(d);
    }
  }
  return out.sort((p, q) => p - q);
}
