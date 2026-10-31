// Run: node --test test/
// Reference values are hand-calculated (see comments) and independently
// re-derived in Python during development.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';
import * as U from '../src/units.js';
import { CHALLENGES } from '../src/challenges.js';

const close = (a, b, tol = 1e-6, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

// Textbook case A: v₀ = 10 m/s, θ = 30°, level ground, g = 9.8
const A = { v0: 10, angleDeg: 30, y0: 0, yL: 0, g: 9.8 };

test('horizontal velocity: vₓ = v₀cosθ = 10·cos30° = 8.6603', () => {
  close(P.components(10, 30).vx, 8.660254037844387);
  close(P.velocityAt(A, 0.7).vx, 8.660254037844387, 1e-9, 'vₓ constant in flight');
});

test('vertical velocity: vᵧ = v₀sinθ − gt', () => {
  close(P.components(10, 30).vy, 5);
  close(P.velocityAt(A, 0.5).vy, 5 - 9.8 * 0.5);
});

test('maximum height: v²sin²θ/2g = 25/19.6 = 1.2755 m', () => {
  const top = P.apex(A);
  close(top.y, 1.2755102040816322);
  close(top.t, 5 / 9.8);
  close(P.velocityAt(A, top.t).vy, 0, 1e-12, 'vᵧ = 0 at apex');
});

test('maximum height with elevated takeoff adds y₀', () => {
  close(P.apex({ ...A, y0: 3 }).y, 3 + 1.2755102040816322);
});

test('flight time on level ground: 2v₀sinθ/g = 1.0204 s', () => {
  close(P.landingTime(A), 1.020408163265306);
});

test('horizontal displacement on level ground: 8.8370 m', () => {
  close(P.landing(A).x, 8.83699391616774);
});

test('horizontal launch drop: y₀=2, yL=0 → t=√(2·2/g)=0.6389 s, x=6.3888 m', () => {
  const c = { v0: 10, angleDeg: 0, y0: 2, yL: 0, g: 9.8 };
  close(P.landingTime(c), 0.6388765649999398);
  close(P.landing(c).x, 6.3887656499993986);
});

test('landing higher than takeoff: yL = +1 m → t = 0.7473 s, x = 6.4720 m', () => {
  const c = { ...A, yL: 1 };
  close(P.landingTime(c), 0.7473255109922907);
  close(P.landing(c).x, 6.472028774155106);
});

test('PRD default jump: 20 mph, 20°, y₀=0, yL=−2 ft → 21.570 ft', () => {
  const c = { v0: U.mphToMs(20), angleDeg: 20, y0: 0, yL: U.ftToM(-2) };
  close(P.landingTime(c), 0.7825209223651658);
  close(U.mToFt(P.landing(c).x), 21.56965466647578, 1e-6);
});

test('landing point is on the path: y(t_L) = yL', () => {
  const c = { v0: 12, angleDeg: 22, y0: 1.5, yL: -1 };
  const t = P.landingTime(c);
  close(P.positionAt(c, t).y, -1, 1e-9);
});

test('landing is on the descending branch (vᵧ ≤ 0)', () => {
  const c = { v0: 12, angleDeg: 25, y0: 0, yL: 1.0 };
  assert.ok(P.landing(c).vy <= 0);
});

test('impossible trajectory: landing above apex → no landing', () => {
  const c = { ...A, yL: 2 }; // apex is 1.2755 m
  assert.equal(P.landingTime(c), null);
  assert.equal(P.landing(c), null);
  assert.equal(P.simulate(c, { targetX: 5, width: 2 }).status, P.RESULT.NO_LANDING);
});

test('boundary: landing exactly at apex height counts as a landing at the apex', () => {
  const top = P.apex(A).y;
  const t = P.landingTime({ ...A, yL: top });
  close(t, 5 / 9.8, 1e-6);
});

test('boundary: zero speed with drop falls straight down', () => {
  const c = { v0: 0, angleDeg: 20, y0: 2, yL: 0, g: 9.8 };
  close(P.landing(c).x, 0);
  close(P.landingTime(c), Math.sqrt(4 / 9.8));
});

test('boundary: zero speed on level ground → no landing (never leaves)', () => {
  assert.equal(P.landingTime({ v0: 0, angleDeg: 20, y0: 0, yL: 0 }), null);
});

test('invalid inputs are reported, not thrown', () => {
  for (const bad of [
    { v0: NaN, angleDeg: 20, y0: 0, yL: 0 },
    { v0: -3, angleDeg: 20, y0: 0, yL: 0 },
    { v0: 10, angleDeg: 95, y0: 0, yL: 0 },
    { v0: 10, angleDeg: 20, y0: 'x', yL: 0 },
    { v0: 10, angleDeg: 20, y0: 0, yL: 0, g: 0 },
  ]) {
    const r = P.simulate(bad, { targetX: 5, width: 2 });
    assert.equal(r.status, P.RESULT.INVALID);
    assert.ok(r.errors.length > 0);
  }
});

test('landing-zone detection: undershoot / success / overshoot / edges', () => {
  const zone = { targetX: 10, width: 4 }; // [8, 12]
  assert.equal(P.classifyLanding(7.99, zone), P.RESULT.UNDERSHOOT);
  assert.equal(P.classifyLanding(8, zone), P.RESULT.SUCCESS);
  assert.equal(P.classifyLanding(10, zone), P.RESULT.SUCCESS);
  assert.equal(P.classifyLanding(12, zone), P.RESULT.SUCCESS);
  assert.equal(P.classifyLanding(12.01, zone), P.RESULT.OVERSHOOT);
  assert.equal(P.classifyLanding(null, zone), P.RESULT.NO_LANDING);
});

test('simulate reports signed miss distance', () => {
  const zone = { targetX: 20, width: 2 };
  const r = P.simulate(A, zone); // lands 8.837
  assert.equal(r.status, P.RESULT.UNDERSHOOT);
  close(r.miss, 8.83699391616774 - 19);
});

test('deck face: rider still climbing below a high deck edge is an undershoot', () => {
  // 35 mph, 35°, deck 6 ft ABOVE the lip, deck edge 6 ft out.
  const c = { v0: U.mphToMs(35), angleDeg: 35, y0: 0, yL: U.ftToM(6) };
  const zone = { targetX: U.ftToM(10), width: U.ftToM(8) };
  assert.ok(P.strikesFace(c, zone));
  const r = P.simulate(c, zone);
  assert.equal(r.status, P.RESULT.UNDERSHOOT);
  assert.ok(r.hitsFace);
  // A normal step-down never strikes the face
  assert.equal(P.strikesFace({ v0: U.mphToMs(20), angleDeg: 20, y0: 0, yL: U.ftToM(-2) }, { targetX: U.ftToM(22), width: U.ftToM(8) }), false);
});

test('inverse: speedForDistance round-trips through the forward model', () => {
  const v = P.speedForDistance(8.83699391616774, 30, 0, 0, 9.8);
  close(v, 10, 1e-9);
  const v2 = P.speedForDistance(U.ftToM(24), 15, 0, U.ftToM(-2));
  close(P.landing({ v0: v2, angleDeg: 15, y0: 0, yL: U.ftToM(-2) }).x, U.ftToM(24), 1e-9);
  assert.equal(P.speedForDistance(5, 10, 0, 10), null, 'unreachable → null');
});

test('inverse: complementary angles give equal range on level ground', () => {
  const angles = P.anglesForDistance(8.83699391616774, 10, 0, 0, 9.8);
  assert.equal(angles.length, 2);
  close(angles[0], 30, 1e-6);
  close(angles[1], 60, 1e-6);
});

test('determinism: identical inputs → identical outputs', () => {
  const c = { v0: 9.123, angleDeg: 17.3, y0: 0.4, yL: -0.9 };
  assert.deepEqual(P.simulate(c, { targetX: 7, width: 2 }), P.simulate(c, { targetX: 7, width: 2 }));
  assert.deepEqual(P.samplePath(c), P.samplePath(c));
});

test('samplePath ends at the landing point', () => {
  const s = P.samplePath(A, 50);
  const last = s.points.at(-1);
  close(last.x, 8.83699391616774, 1e-9);
  close(last.y, 0, 1e-9);
  assert.ok(s.landed);
});

test('unit conversions', () => {
  close(U.mphToMs(1), 0.44704, 1e-12);
  close(U.msToMph(U.mphToMs(23.7)), 23.7, 1e-12);
  close(U.ftToM(10), 3.048, 1e-12);
  close(U.mToFt(3.048), 10, 1e-12);
  close(U.kmhToMs(36), 10, 1e-12);
  close(U.speedToSI(20, 'imperial'), 8.9408, 1e-12);
  close(U.speedToSI(36, 'metric'), 10, 1e-12);
  close(U.lengthToSI(5, 'metric'), 5);
  close(U.gFromSI(P.G, 'imperial'), 32.174, 1e-3);
});

test('switching units does not change physics', () => {
  const imp = { v0: U.speedToSI(20, 'imperial'), angleDeg: 20, y0: 0, yL: U.lengthToSI(-2, 'imperial') };
  const met = { v0: U.speedToSI(32.18688, 'metric'), angleDeg: 20, y0: 0, yL: U.lengthToSI(-0.6096, 'metric') };
  close(P.landing(imp).x, P.landing(met).x, 1e-9);
});

/* ---------- Challenge data integrity: every mission must be solvable ---------- */
test('every challenge has the required schema fields', () => {
  assert.ok(CHALLENGES.length >= 5);
  for (const c of CHALLENGES) {
    for (const k of ['id', 'title', 'description', 'difficulty', 'objectives', 'fixed', 'adjustable', 'zone', 'hints', 'success', 'solution', 'explanation'])
      assert.ok(c[k] !== undefined, `${c.id} missing ${k}`);
    assert.ok(c.hints.length >= 2, `${c.id} needs progressive hints`);
  }
});

test('every challenge reference solution actually succeeds', () => {
  for (const c of CHALLENGES) {
    for (const ref of c.referenceSolutions) {
      const cfg = {
        v0: U.mphToMs(ref.speed ?? c.fixed.speed ?? c.initial.speed),
        angleDeg: ref.angle ?? c.fixed.angle ?? c.initial.angle,
        y0: U.ftToM(c.fixed.takeoffElev ?? 0),
        yL: U.ftToM(c.fixed.landingElev ?? 0),
      };
      const zone = { targetX: U.ftToM(c.zone.targetX), width: U.ftToM(c.zone.width) };
      const r = P.simulate(cfg, zone);
      assert.equal(r.status, P.RESULT.SUCCESS, `${c.id} reference ${JSON.stringify(ref)} → ${r.status}`);
    }
  }
});

test('every challenge starting state is NOT already a success', () => {
  for (const c of CHALLENGES) {
    if (c.type === 'calculate') continue; // answer-entry mission
    const s = { ...c.initial, ...c.fixed };
    const cfg = { v0: U.mphToMs(s.speed), angleDeg: s.angle, y0: U.ftToM(s.takeoffElev ?? 0), yL: U.ftToM(s.landingElev ?? 0) };
    const zone = { targetX: U.ftToM(c.zone.targetX), width: U.ftToM(c.zone.width) };
    assert.notEqual(P.simulate(cfg, zone).status, P.RESULT.SUCCESS, `${c.id} starts solved`);
  }
});
