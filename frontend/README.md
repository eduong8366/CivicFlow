# CivicFlow frontend

Angular 22 (standalone components, signals, zoneless) with Angular Material, styled in the
"Civic Standard" look: USWDS-like navy, Source Serif 4 headings over Public Sans (self-hosted).

## Run

Start the API first (`dotnet run` in `backend/src/CivicFlow.Api`, http://localhost:5109), then:

```sh
npm install
npm start        # ng serve on http://localhost:4200, proxying /api to the API
```

The sign-in page lists the seeded demo accounts in development builds.

## Test and build

```sh
npm test         # Vitest, once: npx ng test --watch=false
npm run build    # production build in dist/
```

## Layout

- `src/app/core/auth` — session (sessionStorage), bearer-token interceptor, route guards
- `src/app/core/api` — ProblemDetails helpers
- `src/app/layout` — the signed-in shell and role-based navigation
- `src/app/features` — screens; pages still to come are routed to a placeholder naming their milestone
