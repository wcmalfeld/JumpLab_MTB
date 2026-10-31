/**
 * Jump Lab — Challenge & prediction content (data only)
 * --------------------------------------------------------------
 * Authors can add missions here without touching the engine.
 * All authored values are IMPERIAL (mph, ft, degrees); the app
 * converts to SI before calling the physics engine.
 *
 * Schema
 *   id, title, difficulty ('beginner'|'intermediate'|'advanced'|'expert')
 *   type: 'zone' (land in zone) | 'min-speed' | 'two-jumps' | 'calculate'
 *   description, objectives[], concepts[]
 *   fixed:      variables locked for this mission
 *   initial:    starting values for adjustable variables
 *   adjustable: which controls the student can move
 *   ranges:     optional per-mission slider ranges
 *   zone:       { targetX, width } landing zone (ft)
 *   success:    rule params interpreted by the challenge engine
 *   prediction: optional question asked before the first jump
 *   hints[]:    progressive, each reveals more of the method
 *   solution[]: worked-solution steps (shown after ≥1 attempt)
 *   explanation: the principle, in rider language
 *   referenceSolutions[]: known-good answers (verified by unit tests)
 */

export const CHALLENGES = [
  {
    id: 'clear-the-gap',
    title: 'Clear the Gap',
    difficulty: 'beginner',
    type: 'zone',
    description:
      'A trail builder has a double with a fixed run-in: you’ll hit the lip at exactly 18 mph. The landing deck sits 2 ft below the lip. Pick a lip angle that puts the rider on the sweet spot of the landing.',
    objectives: ['Land inside the green zone (18–22 ft).', 'Notice how angle changes height and distance.'],
    concepts: ['variables', 'reading-graphs', 'angle'],
    fixed: { speed: 18, takeoffElev: 0, landingElev: -2 },
    initial: { angle: 10 },
    adjustable: ['angle'],
    zone: { targetX: 20, width: 4 },
    success: {},
    prediction: {
      prompt: 'At 10° you’ll come up short. What should you do to the lip angle?',
      options: ['Make it steeper', 'Make it flatter', 'Angle doesn’t matter, only speed'],
      answer: 0,
      why: 'Steeper sends more of your speed upward, so you stay in the air longer — and longer airtime at this speed means more distance (until about 45°).',
    },
    hints: [
      'Which variable can you change? Everything else is locked. Try a few angles and watch where the landing marker moves.',
      'Steeper angle → more vertical velocity (vᵧ = v₀ sin θ) → more airtime.',
      'More airtime × horizontal speed (vₓ = v₀ cos θ) = more distance. Try somewhere in the mid-20s.',
    ],
    solution: [
      'Convert speed: 18 mph × 5280/3600 = 26.4 ft/s. Use g = 32.17 ft/s².',
      'Try θ = 25°: vₓ = 26.4·cos 25° = 23.93 ft/s, vᵧ = 26.4·sin 25° = 11.16 ft/s.',
      'Landing time: t = [11.16 + √(11.16² + 2·32.17·(0 − (−2)))] / 32.17 = (11.16 + 15.91)/32.17 = 0.841 s.',
      'Distance: x = 23.93 × 0.841 = 20.1 ft → right in the 18–22 ft zone. ✓',
      'Any angle from about 20° to 30° works at this speed.',
    ],
    explanation:
      'Angle splits your speed into two jobs: forward (cos θ) and up (sin θ). Steeper gives you more hang time but less forward speed. Below ~45° the extra hang time wins, so steeper goes farther.',
    referenceSolutions: [{ angle: 25 }, { angle: 21 }, { angle: 29 }],
  },
  {
    id: 'minimum-speed',
    title: 'Minimum Speed',
    difficulty: 'intermediate',
    type: 'min-speed',
    description:
      'An 18° lip, 2 ft above the landing. The landing deck starts 24 ft out. Riders want to know the slowest speed that still clears the gap — so they don’t have to pin it. Find it.',
    objectives: ['Land on the deck (24–32 ft).', 'Land within 1.5 ft of the deck edge — that’s the minimum speed.'],
    concepts: ['substitution', 'solving-for-unknowns', 'quadratics'],
    fixed: { angle: 18, takeoffElev: 2, landingElev: 0 },
    initial: { speed: 15 },
    adjustable: ['speed'],
    ranges: { speed: [10, 35, 0.1] },
    zone: { targetX: 28, width: 8 },
    success: { maxPastStart: 1.5 },
    prediction: {
      prompt: 'If you double your speed, roughly what happens to your jump distance?',
      options: ['About the same', 'About double', 'Much more than double', 'Less than double'],
      answer: 2,
      why: 'Faster means more forward speed AND more airtime — two effects multiply. On flat ground distance grows with v², so double speed ≈ 4× distance.',
    },
    hints: [
      'Slide speed until you just reach the deck edge at 24 ft. Then try to calculate it instead of guessing.',
      'Eliminate time: from x = v cosθ·t, t = x/(v cosθ). Substitute that into the y equation.',
      'You get yL = y₀ + x tanθ − g x² / (2v² cos²θ). Everything is known except v.',
      'Solve for v: v = √( g x² / (2 cos²θ · (y₀ − yL + x tanθ)) ).',
    ],
    solution: [
      'Known: x = 24 ft, θ = 18°, y₀ = 2 ft, yL = 0 ft, g = 32.17 ft/s².',
      'tan 18° = 0.3249, cos² 18° = 0.9045.',
      'Denominator: 2 × 0.9045 × (2 − 0 + 24 × 0.3249) = 2 × 0.9045 × 9.798 = 17.72.',
      'Numerator: g x² = 32.17 × 576 = 18,532.',
      'v = √(18,532 / 17.72) = √1,045.6 = 32.33 ft/s.',
      'Convert: 32.33 × 3600/5280 = 22.05 mph. Anything slower lands in the gap. ✓',
    ],
    explanation:
      'This is “solving for an unknown”: the trajectory equation links speed to distance, so you can run it backwards. Eliminating time turns two equations into one parabola y(x) — the actual shape you see on screen.',
    referenceSolutions: [{ speed: 22.1 }, { speed: 22.5 }],
  },
  {
    id: 'perfect-trajectory',
    title: 'The Perfect Trajectory',
    difficulty: 'advanced',
    type: 'zone',
    description:
      'Big step-down: lip 1 ft up, landing 3 ft below the datum. The sweet spot is a narrow 3 ft patch centered 32 ft out. You control both speed and angle. Stick it.',
    objectives: ['Land within 30.5–33.5 ft.', 'Find a speed + angle pair — there is more than one.'],
    concepts: ['trigonometry', 'vectors', 'quadratics'],
    fixed: { takeoffElev: 1, landingElev: -3 },
    initial: { speed: 18, angle: 15 },
    adjustable: ['speed', 'angle'],
    zone: { targetX: 32, width: 3 },
    success: {},
    hints: [
      'Lock one variable in your head: pick a comfortable speed (say 22 mph) and adjust only angle.',
      'Watch the drop: landing is 4 ft below the lip, so y₀ − yL = 4 ft adds airtime.',
      'Use the Math Workbench “Substitute” tab to check your numbers before you jump.',
    ],
    solution: [
      'Choose v₀ = 22 mph = 32.27 ft/s and try θ = 26°.',
      'vₓ = 32.27 cos 26° = 29.00 ft/s, vᵧ = 32.27 sin 26° = 14.14 ft/s.',
      't = [14.14 + √(14.14² + 2·32.17·(1 − (−3)))] / 32.17 = (14.14 + 21.39)/32.17 = 1.104 s.',
      'x = 29.00 × 1.104 = 32.0 ft → dead center. ✓',
      'Other answers exist, e.g. faster with a flatter lip. Every solution is a point on a curve in (speed, angle) space.',
    ],
    explanation:
      'Two inputs, one output: many (speed, angle) pairs give the same landing. That’s why real jump builders talk about “speed windows” — a lip shape works over a range of speeds.',
    referenceSolutions: [{ speed: 22, angle: 26 }, { speed: 25, angle: 17 }],
  },
  {
    id: 'same-distance',
    title: 'Same Distance, Different Jumps',
    difficulty: 'advanced',
    type: 'two-jumps',
    description:
      'Flat-to-flat, target 24 ft. Land it twice with launch angles at least 8° apart. Compare the two arcs: same distance, totally different feel.',
    objectives: ['Land in the zone (22.5–25.5 ft) twice.', 'The two angles must differ by ≥ 8°.', 'Compare airtime and max height.'],
    concepts: ['parabolas', 'optimization', 'comparison'],
    fixed: { takeoffElev: 0, landingElev: 0 },
    initial: { speed: 18, angle: 12 },
    adjustable: ['speed', 'angle'],
    zone: { targetX: 24, width: 3 },
    success: { minAngleDiff: 8 },
    prediction: {
      prompt: 'Two jumps land at the same spot. Which one has more airtime?',
      options: ['The steeper one', 'The flatter one', 'Same airtime'],
      answer: 0,
      why: 'The steeper jump goes higher, and time in the air depends on vertical speed. The flatter jump makes up the distance with more forward speed.',
    },
    hints: [
      'Start steep (around 30°+) and find the speed that lands it. Save that as Jump A.',
      'Now go flatter (around 20°). You’ll need MORE speed to cover the same ground.',
      'Use Compare to put both side by side. Look at flight time and max height.',
    ],
    solution: [
      'Jump 1: 20 mph at 33° → vₓ = 24.60, vᵧ = 15.98 ft/s → t = 2·15.98/32.17 = 0.993 s → x = 24.4 ft. ✓',
      'Jump 2: 22 mph at 23° → vₓ = 29.70, vᵧ = 12.61 ft/s → t = 0.784 s → x = 23.3 ft. ✓',
      'Same distance, but Jump 1 has 27% more airtime and peaks at 4.0 ft vs 2.5 ft.',
      'On flat ground x = v² sin(2θ)/g — the trade-off between v and θ is visible right in the formula.',
    ],
    explanation:
      'Range depends on v² and sin(2θ). You can trade speed for angle. Riders feel this: a steep, floaty jump vs. a flat, fast one can land in the same spot.',
    referenceSolutions: [{ speed: 20, angle: 33 }, { speed: 22, angle: 23 }],
  },
  {
    id: 'solve-before-jump',
    title: 'Solve Before You Jump',
    difficulty: 'expert',
    type: 'calculate',
    description:
      'Everything is locked: 22 mph, 15° lip, takeoff 2 ft up, landing 1 ft below the datum. Calculate where you’ll land BEFORE you hit go. Within 1 ft counts.',
    objectives: ['Calculate the landing distance by hand.', 'Enter it, then run the jump to check.'],
    concepts: ['trigonometry', 'quadratics', 'substitution', 'projectile-motion'],
    fixed: { speed: 22, angle: 15, takeoffElev: 2, landingElev: -1 },
    initial: {},
    adjustable: [],
    zone: { targetX: 23.8, width: 2 },
    hideZoneUntilAnswered: true,
    success: { tolerance: 1 },
    hints: [
      'Which equation describes horizontal position? x(t) = v₀ cos θ · t. You need t.',
      'Velocity components: convert 22 mph to ft/s first, then vₓ = v₀ cos θ, vᵧ = v₀ sin θ.',
      'Landing time comes from y(t) = yL — a quadratic in t. Use the + root: t = [vᵧ + √(vᵧ² + 2g(y₀ − yL))] / g.',
      'Substitute that t into x = vₓ · t.',
    ],
    solution: [
      'v₀ = 22 mph × 5280/3600 = 32.27 ft/s.',
      'vₓ = 32.27 cos 15° = 31.17 ft/s, vᵧ = 32.27 sin 15° = 8.35 ft/s.',
      'Drop: y₀ − yL = 2 − (−1) = 3 ft, so 2g·3 = 193.0.',
      't = [8.35 + √(69.74 + 193.0)] / 32.17 = (8.35 + 16.21)/32.17 = 0.763 s.',
      'x = 31.17 × 0.763 = 23.8 ft. ✓',
    ],
    explanation:
      'This is the whole model in one problem: decompose the velocity (trig), solve the quadratic for time, substitute back. If you can do this, you can predict any jump in the lab.',
    referenceSolutions: [{}],
  },
];

/**
 * Explore-mode prediction prompts (PRD §7.1).
 * `apply` changes the current setup; `options[i].test(ratio)` checks the
 * actual after/before ratio of `measure` to mark the correct option.
 */
const pct = (lo, hi) => (r) => r - 1 >= lo && r - 1 < hi;
export const PREDICTIONS = [
  {
    id: 'speed-plus-20',
    prompt: 'If we increase takeoff speed by 20%, what happens to the jump distance?',
    measure: 'distance',
    apply: (s) => ({ ...s, speed: +(s.speed * 1.2).toFixed(1) }),
    options: [
      { label: 'Increase by less than 20%', test: pct(0.02, 0.17) },
      { label: 'Increase by about 20%', test: pct(0.17, 0.23) },
      { label: 'Increase by more than 20%', test: pct(0.23, 99) },
      { label: 'Stay about the same', test: pct(-0.02, 0.02) },
    ],
    why: 'More speed gives more forward velocity AND more airtime. Those multiply, so distance grows faster than speed (≈ v² on flat ground).',
  },
  {
    id: 'double-speed',
    prompt: 'What happens to max height if we double the speed (same angle)?',
    measure: 'height',
    apply: (s) => ({ ...s, speed: +(s.speed * 2).toFixed(1) }),
    options: [
      { label: 'About double', test: pct(0.7, 1.5) },
      { label: 'About 4× as high', test: pct(1.5, 99) },
      { label: 'Stays the same', test: pct(-0.05, 0.05) },
    ],
    why: 'Height above the lip is vᵧ²/2g. Double v₀ → double vᵧ → 4× the rise.',
    note: 'Measured as height gained above the lip.',
  },
  {
    id: 'angle-up-5',
    prompt: 'Keep speed the same and raise the angle by 5°. Distance will…',
    measure: 'distance',
    apply: (s) => ({ ...s, angle: Math.min(s.angle + 5, 35) }),
    options: [
      { label: 'Increase', test: pct(0.01, 99) },
      { label: 'Decrease', test: pct(-99, -0.01) },
      { label: 'Barely change', test: pct(-0.01, 0.01) },
    ],
    why: 'Below ~45°, extra airtime beats the lost forward speed, so steeper usually goes farther. Near 45° the two effects balance.',
  },
  {
    id: 'drop-landing',
    prompt: 'Lower the landing by 3 ft (bigger step-down). What happens to airtime?',
    measure: 'time',
    apply: (s) => ({ ...s, landingElev: Math.max(s.landingElev - 3, -6) }),
    options: [
      { label: 'Longer airtime', test: pct(0.01, 99) },
      { label: 'Shorter airtime', test: pct(-99, -0.01) },
      { label: 'Same airtime', test: pct(-0.01, 0.01) },
    ],
    why: 'The rider falls farther before touching down. The curve is the same — you just see more of it.',
  },
];

/** Short, rider-language concept explainers (PRD §7.4). */
export const CONCEPTS = {
  parabola: {
    title: 'Why the path is a parabola',
    body: 'Gravity pulls you down the whole time, while your forward speed never changes. Steady forward + steadily faster falling = a curve called a parabola.',
  },
  components: {
    title: 'Splitting speed with sin & cos',
    body: 'Your speed points along the lip. cos θ tells you how much goes forward, sin θ how much goes up. Steep lip → more up, less forward.',
  },
  quadratic: {
    title: 'Where the quadratic comes from',
    body: 'Height y(t) has a t² term from gravity, so “when do I hit the deck?” is a quadratic. Two roots: the + root is when you come down.',
  },
  independence: {
    title: 'Horizontal and vertical are independent',
    body: 'Gravity only acts downward. Horizontal speed stays the same from lip to landing — check the vₓ arrow in slow-mo.',
  },
  variables: {
    title: 'Inputs and outputs',
    body: 'Speed, angle and elevations are independent variables — you choose them. Distance, airtime and height are dependent — the jump decides them.',
  },
};
