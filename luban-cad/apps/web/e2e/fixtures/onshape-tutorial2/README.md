# Onshape Tutorial 2「Build a Part」fixture

Committed, machine-readable fixture for the perfect-replication work described in
`C:\Users\24389\.claude\plans\adaptive-exploring-hoare.md`.

## Source

- Onshape document: `5f5052a120e3451a48484808`
- Workspace: `e29786d0f5f8d8839772903f`
- Element: `c0cf346ec3bef1726450f500` (`First Part`)
- API microversion: `af52e61bb0215c37eb302018`
- Raw capture: `raw/api-features.json`, `raw/api-massproperties.json`,
  `raw/api-parts.json`, `raw/api-elements.json`
- Gold volume (API + UI): **21.820148910143363 in³ = 357.5681766800494 cm³**.
  The legacy prose value 358.2 cm³ is retained only as `expected.legacyGoldCm3`.

## Provenance gap

The in-document Tutorial tab iframe points at
`https://www.onshape.com/tutorial/test-content-tutorial-1-0`, which returns
**HTTP 404**. The forum-linked original document
`576aef66e4b0cc2e7f45753d` has the same broken tutorial element. The Android/iOS
tutorial apps load real content but use different models. Therefore no official
tutorial text or ordered clickstream exists in this bundle; `raw/reconstructed-steps.json`
is a reconstruction derived from the final API state, not a claim of Onshape's original
click order. Fresh final-state UI evidence (sketch, feature dialogs, four fillet chips,
mass properties) was captured on 2026-11-01 and lives in the gitignored
`.superpowers/sdd/onshape-tutorial2-analysis/recapture-2026-11-01/` bundle.

## What the fixture contains

`gold/tutorial2.gold.json`:

- 18 visible sketch entities: 13 lines, 2 arcs, 1 exact cubic spline, 2 rectangle
  centre points. Line endpoints / arc centres / spline handles are implicit sub-refs,
  matching Onshape's entity model.
- 48 constraints: COINCIDENT 18, MIDPOINT 6, LENGTH 4, DISTANCE 4, PARALLEL 4,
  HORIZONTAL 3, PERPENDICULAR 2, VERTICAL 2, TANGENT 2, OFFSET 2, RADIUS 1.
- 9 dimensions (4 length, 4 distance, 1 radius) with exact inch expressions.
- 6 features: Sketch 1, Extrude 1 (NEW 5 in symmetric), Extrude 2 (ADD 2 in symmetric,
  `band` + `bandWing`, Part 1 scope), Extrude 3 (ADD .625 in symmetric, lobe, Part 1),
  Revolve 1 (FULL ADD, `revolveProfile` = JGW, Part 1), Fillet 1 (four **short
  vertical Z edges**, 19.05 mm, R0.2 in, tangent propagation).
- Region roles: `base` (JGG, 1572.585 mm²), `band` (JGa, 1153.56 mm²), `bandWing`
  (JGe, 483.87 mm²), `revolveProfile` (JGW, 725.775 mm²), `lobe` (JGK, 2298.36 mm²).
  **JGe and JGW are distinct regions** (the 2026-11-02 correction): E2 consumes
  `band+bandWing`; R1 consumes `revolveProfile`. Treating them as one 725.775 mm²
  region was the source of the old +2.5 cm³ no-fillet volume error.
- Expected volume, surface area, feature tree, fillet edge intent and tolerance anchors.

## Units and transform

Source geometry is metres (Onshape) and dimension expressions are inches. Playback is
millimetres with the proven Front-plane conversion `v = -y` (normal +Y, xDir +X).
`cubic spline` is the exact two-point interpolated spline from Onshape:
fit points `(-41.275, -9.525) → (57.15, -61.9252)` and handles
`(-39.5392403, -40.3054841) / (16.8448184, -60.5186373)` mm.

## Strict mouse-level acceptance (2026-11-02)

`luban-cad/apps/web/e2e/tutorial2.spec.ts` is the acceptance path: a real Playwright
session draws the sketch with ribbon tools and canvas data-point clicks (no
`insertSketch` RPC, no replay module), then builds the six features through the real
dialogs. Measured on 2026-11-02 (after the JGe/JGW role split and short-edge fillet):

- sketch: 18 entities / 48 constraints / 9 dimensions, `dof=0`, status `ok`, constraint
  histogram identical to the gold fixture; all 13 line endpoints, both arc
  centres/radii/endpoints and both visible points match the fixture at 1e-4 mm.
- spline: one exact cubic Bezier; control points deviate by at most **0.3158 mm**
  (≈1 screen pixel at the test's framing). This is the mouse-quantisation limit of
  the UI path; the backend gold replay still asserts 1e-9 control-point identity.
- features: Extrude 1 (NEW 127) → Extrude 2 (ADD 50.8, `band+bandWing`) → Extrude 3
  (ADD 15.875, lobe) → Revolve 1 (ADD full 360°, JGW, axis line 17) → Fillet 1
  (R5.08, tangent propagation, four **short Z** vertical edges). Feature tree: 6 rows,
  all status 0, one active authored body.
- fillet picking: Right view picks the two x=+41.275 short edges at `y=±63.5`; Left
  view picks the x=-41.275 pair. The view is framed so both picks land to the right
  of the feature dialog; exactly 4 chips.
- volume (`getMassProperties`): no-fillet **358.224 cm³** (backend replay 357.988),
  filleted **357.802 cm³**, removal **0.422 cm³**, i.e. **+0.065%** vs the API gold
  357.568 cm³ (target ≤0.5%). Backend replay on the same fixtures: no-fillet
  357.988 cm³, filleted 357.566 cm³ (-0.001%), removal 0.422 cm³.
- fillet edge intent: four Z-parallel edges at x=±41.275, y=±63.5,
  z=-9.525..+9.525, own ids `1:1`, `1:3`, `1:8`, `1:10` (backend replay).

## Chrome full-process demo

`playwright.demo.config.ts` runs the strict spec in the system Chrome
(`channel: 'chrome'`, 1440×900) with video + screenshots and a headed window:

```bash
cd luban-cad/apps/web
npx playwright test e2e/tutorial2.spec.ts --config=playwright.demo.config.ts --project=chrome-demo
```

The previous 2026-11-02 video was recorded before the JGe/JGW and short-edge fillet
corrections and is **superseded**. Re-record after the UI-parity work; artifacts go to
`test-results/t2-demo-chrome/` (gitignored) with a preserved copy under
`.superpowers/`. The strict spec itself is the source of truth for volume/chips.

Known deviations / notes:

- Drawing geometry is intentionally placed off-origin first (rectangle, second
  rectangle) so constraints drive it to the Onshape final state; this mirrors how the
  tutorial is taught and keeps the origin/centre pick unambiguous.
- Endpoints that land on existing endpoint coordinates automatically get a
  `coincident` relation (`sketch-auto-weld`, Onshape inference-snap equivalent); this
  is the source of gold constraints [14][16][18][45][46].
- The offset tool extends its chain only through **smooth, bivalent** junctions
  (tangent continuity + exactly two incident endpoints), matching Onshape's chain
  selection: the base-corner triple point stops the Tutorial 2 chain at three members.
- Native runtime executes the four-edge blend. As of 2026-11-02 the Delivery was
  rebuilt from the private native engine HEAD in offline bundle mode and deployed;
  the strict e2e was re-run on that artifact and passed (2 tests, ~2.4 min). This
  remains development acceptance; a release-gate pass still requires the usual
  publication checks.

## Tool-level regression (2026-11-02)

`luban-cad/apps/web/e2e/tutorial2-tools.spec.ts` isolates the sketch tools the strict
flow depends on and asserts each increment through the same real UI path:

- drawing: centre rectangle (5 entities / 10 auto constraints), free line, 3-point arc,
  and the 4-pick cubic spline (1 spline + 2 fit/endpoint coincident);
- constraints: origin coincident, midpoint, arc-line tangent, horizontal, vertical
  (each exactly +1 row on top of the rectangle's automatic relations);
- dimensions: length / radius / distance, including mixed point-line distance;
- offset: single-line chain produces parallel + exact distance (v1 single-member
  contract), panel distance 8, and the offset copy stays 8 mm from the source.

Measured 4 tests + setup, all green in ~2.3 min. Shared interaction helpers live in
`e2e/tutorial2-helpers.ts` (extracted from the strict spec without behaviour change).

## Regenerate

```bash
cd luban-cad
node scripts/onshape-tutorial2/import-onshape-tutorial2.mjs
node --test scripts/onshape-tutorial2/import-onshape-tutorial2.test.mjs
```

The converter validates the literal 18/48/9/6 inventory, constraint histogram,
feature parameters, region uniqueness and spline derivative identity before writing
`gold/tutorial2.gold.json` and `gold/manifest.sha256.json`.

## Do not commit screenshots with account data

The fresh evidence screenshots show the Onshape account name. Crop/redact any image
before copying it into `evidence/`. The raw JSON in `raw/` is public Onshape data;
the gold file contains no credentials or session data.
