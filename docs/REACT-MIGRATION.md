# React migration — first production slice

## Implemented

- React 19, TypeScript strict, Vite 8, CSS Modules.
- `/icones` and `/entrar` render their main content through React. Existing URL,
  shell, sprite, cookies, auth endpoints and redirect destinations stay intact.
- Reusable Icon, GoogleIcon, Panel, Field and ErrorBoundary components.
- No HTML string rendering inside the migrated React views; user/server text is
  escaped by React. Form inputs preserve values across mode changes and failures.
- The temporary typed `legacy.ts` boundary delegates shell/API behavior to BX.
  React owns only `#app`; legacy navigation never mutates that subtree.
- Express remains the router. React Router/Query/Zustand are not added before a
  route actually needs client navigation/caching or complex state. This is not a
  claim that the remaining 19 pages or the Builder have been migrated.

## Build and deployment

`npm ci && npm run build` performs strict typechecking and generates `public/react`.
Only this generated directory is emptied by Vite; legacy public assets are safe.
Entry URLs are stable with ETag/no-cache from Express; shared JS chunks are hashed.
Both migrated HTML files explicitly include the generated stylesheet and entry.

The Dockerfile builds frontend assets in a separate stage and copies only output
into the existing Node/Express image. No Vite dev server or test server is deployed.
The existing Prisma migration/seed and data volume behavior are unchanged.

For local work, run `npm run test:server` (isolated port 4174), then
`npm run dev:frontend` for incremental rebuilds and refresh the browser. This first
stage uses watch builds, not HMR; the same Express URLs are exercised as production.

## Validation

- `npm run typecheck`, `npm run build`, three catalog tests, and the unchanged-page
  contract guard passed. The guard now covers the 19 non-migrated pages.
- `npm run test:react`: 153 icon tiles, clipboard copying, emoji copying, sprite
  properties, login tab state, escaped query errors and failed-password recovery
  passed at 1440px and 390px; no uncaught JS errors or page overflow.
- `npm run test:e2e`: real local registration, password login/logout, permissions,
  deck CRUD, avatar upload, tournament/bye/results, PNG/JSON and management menus
  passed against production-mode Vite output after the login migration.
- Real Google OAuth consent remains outside automation; its link, configuration
  gate and backend flow were preserved. No production user accounts used in tests.

## Next slices

Public list pages, shared React navigation, then tournament/profile flows. Extract
the Builder catalog and state only with tests for closure dependencies, slot rules,
drag/drop and persistence. Do not convert the entire app into a SPA in one commit.

References: [React incremental adoption](https://react.dev/learn/add-react-to-an-existing-project)
and [Vite backend integration](https://vite.dev/guide/backend-integration.html).
