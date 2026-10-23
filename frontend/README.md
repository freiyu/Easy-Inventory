# EZI frontend (Stage 1 prototype)

Clickable Next.js prototype (static export) with in-memory mock data. No backend, database, or real authentication.
All data goes through `src/lib/mock/store.ts`; UI text is in `src/lib/strings.ts`.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest: business rules of the mock
npm run lint && npm run typecheck && npm run build   # build writes the static site to out/
```

Prototype sign-in: pick a demo account on the login page (any password works).
The "Prototype only" button (bottom right) switches role, simulates load errors, and resets data.
Data resets on a full page reload.
