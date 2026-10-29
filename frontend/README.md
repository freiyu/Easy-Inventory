# EZI frontend

Next.js app (static export). In production the backend serves the built `out/` folder and `/api` on one port.
All data goes through the typed API client in `src/lib/api/`; UI text is in `src/lib/strings.ts` (English) and `src/lib/strings.id.ts` (Bahasa Indonesia).

```bash
npm ci
npm run dev        # http://localhost:3000, /api is proxied to EZI_API_URL (default http://127.0.0.1:4000)
npm test           # Vitest unit tests
npm run lint && npm run typecheck && npm run build   # build writes the static site to out/
npm run e2e        # Playwright end-to-end tests (needs the backend E2E server on ezi_test)
```

See the [main README](../README.md) for the full setup.
