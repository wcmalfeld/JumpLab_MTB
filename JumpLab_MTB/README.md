# Mathlete MTB — Jump Lab

Interactive projectile-motion simulator for the Mathlete Interactive Learning Lab (PRD: "Jump Lab").
Zero runtime dependencies. Plain ES modules, SVG rendering, Node's built-in test runner.

## Quick start

```bash
npm test        # 28 physics + content tests (node:test, no installs)
npm run build   # → dist/jump-lab.html (standalone page) and dist/artifact.html
```

Open `dist/jump-lab.html` directly in a browser, or serve it from the site. Nothing to install for students.

## Structure (maps to PRD §10)

| PRD module | File | Notes |
|---|---|---|
| 1. Physics engine | `src/physics.js` | Pure, deterministic, SI-only. No DOM. Validates input, never throws. |
| Unit conversion | `src/units.js` | Imperial default, metric toggle. Physics never sees display units. |
| 2. Simulation renderer | `src/app.js` → `renderScene` / `renderDynamic` | SVG. Static layer per setup, rider + vectors per frame. |
| 3. Variable controls | `src/app.js` → `buildControls` | Slider + number box, clamping with messages, per-mission ranges. |
| 4. Math workbench | `src/app.js` → `renderWorkbench` | Equations (simple/advanced), live substitution, concept cards. |
| 5. Challenge engine | `src/app.js` → `registerAttempt` | Rule types: `zone`, `min-speed`, `two-jumps`, `calculate`. |
| 6. Feedback & hints | `src/challenges.js` (content) | Data-only. Add missions without touching the engine. |
| 7. Session tracking | `src/app.js` → `S.session` / `sessionSummary` | In-memory, no personal data; copyable tutor summary. |

## Physics model

- `x(t) = v₀cosθ·t`, `y(t) = y₀ + v₀sinθ·t − ½gt²`, g = 9.80665 m/s².
- Landing time uses the PRD's descending root; negative discriminant ⇒ `no-landing`.
- Landing zone = `[target − w/2, target + w/2]`; the landing deck begins at the zone's near edge.
- **Added edge case:** if the rider is still below deck height when reaching the deck edge (possible with a deck *above* the lip), it's an undershoot (`hitsFace: true`). The PRD formula alone would call that a landing.
- Inverse solvers (`speedForDistance`, `anglesForDistance`) power the worked-solution check and are round-trip tested.

## Adding a mission

Append an object to `CHALLENGES` in `src/challenges.js` (schema documented at the top of that file),
include at least one `referenceSolutions` entry, and run `npm test`. The test suite fails if a mission
is unsolvable or starts already solved.

## Integrating with the Mathlete site

- **Simplest:** host `dist/jump-lab.html` and iframe or link to it.
- **Inside an existing app:** import `src/physics.js`, `src/units.js`, and `src/challenges.js` directly; they are framework-agnostic. The UI layer (`src/app.js` + `src/template.html`) can be ported to the site's component framework module by module.
- **Accounts:** session data lives in `S.session`. To persist it, post `sessionSummary()` output to the existing Mathlete student-account API (PRD §9) — no separate account DB is introduced.
- Fonts load from Google Fonts with system fallbacks; the page works offline without them.

## Not done yet (needs product decisions or real students)

- Usability testing with three ability levels (PRD §13) — needs real sessions.
- Persisting progress across visits (waits on the account system).
- Tutor-facing dashboard (listed as a future enhancement).
