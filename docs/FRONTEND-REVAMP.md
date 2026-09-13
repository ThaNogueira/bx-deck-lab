# Frontend revamp — incremental rollout

## Inventory and dependencies

The current frontend has 21 HTML entry points, a shared navigation/API layer
(`public/js/shared.js`), the Builder/catalog application (`public/app.js`), and
page-specific scripts. Express serves extensionless and dynamic URLs.

| Area | Contracts to preserve | Risk |
| --- | --- | --- |
| Home / meta / collection | Hash routes, catalog, local storage | Medium |
| Builder | Standard/CX/integrated slots, picker, drag/drop, undo, generation, publishing | High |
| Decks / pieces / products | Dynamic slugs, image URLs, filters, pagination | Medium |
| Tournaments / management / table | Standings, pairings, scoring, declarations, export, permissions | High |
| Community / profile / sales | Auth, uploads, forms, dialogs, owner actions | High |
| Login / registration | Auth endpoints, redirects, validation, Google OAuth | High |
| Poster / maintenance / icons / admin | Print layout, restricted routes, operational actions | Medium/high |

Critical dependency: the backend extracts catalog data from app.js. React conversion
must not remove that catalog before it has been extracted and independently tested.
HTML IDs, data attributes and existing listeners are integration contracts.

## Implemented first stage

All 21 entry points load `design-system.css` after legacy CSS. New CSS is split into
tokens, compatibility components and screen composition. This is a transitional
layer, not a completed conversion to isolated JS components. No business rules,
API calls, scripts, IDs or routes are changed. Existing CSS remains for structural
contracts, especially miniature geometry, Builder states and mobile sheets.

Graphite surfaces, lime actions, flat panels, clearer type hierarchy, visible
keyboard focus, readable inputs, mobile header actions and reduced-motion support.
Danger/error colors stay separate from the brand color. Print stays light.

## Validation environment

`node scripts/preview.mjs` starts a loopback-only preview on port 4173. It serves
local frontend assets and reads public production APIs/uploads without forwarding
cookies. POST/PUT/PATCH/DELETE are blocked. This is NOT an authenticated test server.

Run `node scripts/visual-smoke.mjs` with Playwright installed, or set
`PLAYWRIGHT_MODULE` to an installed package. Defaults to installed Edge in headless
mode; `BROWSER_CHANNEL` can override it. Screenshots/results go to ignored
`artifacts/revamp`. Checks desktop/mobile routes, hidden states, token loading,
registration/login tab switching and Builder generation menu. Layout overflow and
runtime exceptions are recorded for review.

## Remaining migration and release gates

First smoke run: 24 route/viewport combinations (12 routes at 1440px and 390px)
passed token/hidden-state checks, with no page-level horizontal overflow and no
uncaught JavaScript errors. Login/register tabs and Builder generation dropdown
passed in both viewports. Initial login-tab test clicked before asynchronous
initialization; corrected test readiness by waiting for network idle. These results
do not prove authenticated functionality or all interaction states.

- Authenticated regression environment is now implemented: `npm run test:server`
  starts Express/Prisma on loopback port 4174 with `data/qa/revamp.db` and dedicated
  uploads. Production credentials are not loaded. The isolated test flag is only
  effective together with NODE_ENV=test; production jobs and upload paths stay unchanged.
- `npm run test:e2e` passed browser registration/login/logout, server-side session
  revocation, deck create/edit/delete, invalid input, anonymous/non-owner permissions,
  avatar upload/retrieval, tournament join/start/bye/resolve/finish and PNG export.
- Management search retained focus while typing; modal close, standings deck popup,
  pairing layout toggle, account/notification menus and JSON export after finish
  passed at 1440px and 390px. An admin fixture also rendered the admin dashboard.
- 24 additional authenticated/dynamic route-width captures had no uncaught JS
  errors or page overflow. Some operations are API integration tests, not UI CRUD.
- `npm test`: three catalog regression tests passed. `npm run test:contracts`:
  all 21 entry points retain existing content, scripts, forms and IDs.
- Real Google OAuth still requires a configured test OAuth client and a human
  account; no production Google session was used. This has NOT been fully tested.
- Visually inspect all dynamic details and restricted screens with representative
  data before declaring full regression coverage.
- Catalog tests cover extraction, categories and mutable-state isolation, not every
  Bey legality rule. Full drag/drop, all scoring variants and every admin action
  are still outside the current regression coverage.
- Adopt React/TypeScript/Vite one route at a time only after extraction; retain
  Express/Prisma and current URLs. No migration was performed in this stage.
- Remove legacy styles feature by feature as components become isolated; do not
  delete the entire stylesheet during a visual rollout.
- Production deployment is gated on visual review and regression checks.

## Architecture decision

No React rewrite in this visual release. `mergeLocalPart` inside the catalog
prelude captures inventory, persistence and deck/session state from the surrounding
Builder. `chooseColor` also captures inventory and browser dialogs. Extracting that
block as a pure module without breaking closures requires separate work and tests.
The compatibility CSS is explicitly temporary, not a completed component migration.

## Reproduction

Install dependencies with `npm ci`; Playwright is pinned as a dev dependency.
Tests use locally installed Edge in headless mode. Node 22.13+ is required for the
isolated SQLite bootstrap. Start `npm run test:server`, then `npm run test:e2e` in
another terminal. Restart the test server between repeated runs if the existing
auth rate limiter is reached; tests intentionally do not bypass that limiter.
Fixtures remain under ignored `data/qa`, screenshots under ignored `artifacts`.
Dependency installation reported six existing audit findings (3 moderate, 3 high);
no automatic major-version/security upgrade was applied in this design change.
