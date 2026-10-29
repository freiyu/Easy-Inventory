# EZI Inventory (Easy Inventory)

EZI is a small office inventory system for one Windows host PC on a local network. Other PCs and phones open it in a browser. It tracks items, stock in and out, loans, purchase requests, and expenses. It also produces reports and Excel exports and takes database backups. There are two roles, Admin and Staff. The UI is in Bahasa Indonesia, with English available in the user menu.

- **Using EZI:** [docs/INSTALLATION.md](docs/INSTALLATION.md), [docs/USER-ACCESS.md](docs/USER-ACCESS.md), [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) (Bahasa Indonesia).
- **Building the installer:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Stack

- Frontend: Next.js 16 (static export), React 19, TypeScript, Tailwind v4, shadcn/ui.
- Backend: Node.js 22, Express 5, Prisma 7 (MariaDB adapter), Zod.
- Database: MySQL in development; the installer bundles MariaDB 11.8 LTS.
- In production it runs as one process on one port: the backend serves `/api` and the static frontend.

## Development

The development environment is Ubuntu on WSL2 with the repo on the Linux filesystem.

**Software needed:**
- Node.js 22
- MySQL 8 (or MariaDB) running locally
- Git

**First setup:**

```bash
sudo scripts/dev-db-setup.sh          # creates ezi_dev, ezi_dev_shadow, ezi_test, ezi_test_restore and a limited user
cp backend/.env.example backend/.env  # fill in the placeholders; never commit .env
cd backend && npm ci && npm run db:generate && npx prisma migrate deploy
cd ../frontend && npm ci
```

`backend/.env.example` lists every variable: `DATABASE_URL`, `SHADOW_DATABASE_URL`, `SESSION_SECRET`, `PORT`, `HOST`, `TZ`, `DATA_DIR`, and the optional `MYSQLDUMP_PATH`, `MYSQL_PATH`, and `STATIC_DIR`.

**Run in development:**

```bash
cd backend && npm run dev     # API on PORT (example 4000)
cd frontend && npm run dev    # http://localhost:3000, /api is proxied to EZI_API_URL (default http://127.0.0.1:4000)
```

**Migrations:** `cd backend && npm run db:migrate` (prisma migrate dev). Never run `migrate reset` on a database that holds real data.

**Build:** `cd frontend && npm run build` writes the static export to `frontend/out`. `cd backend && npm run bundle` writes `backend/dist/main.mjs` (server) and `cli.mjs` (Windows host tool).

## Tests

```bash
cd backend && npm test                  # unit tests
cd backend && npm run test:integration  # real MySQL, ezi_test only (refuses other database names)
cd frontend && npm test                 # unit tests
cd frontend && npm run e2e              # Playwright end-to-end, on ezi_test through port 4100
npm run typecheck                       # in backend/ and frontend/; frontend also has npm run lint
```

Integration and E2E tests wipe `ezi_test`. Never point them at a database with real data.

## Installer and releases

The Windows installer (Inno Setup) is prepared in WSL with `installer/stage.sh` and compiled on Windows with `installer/build.ps1`. Releases on GitHub include `EZI-Setup-<version>.exe`, `SHA256SUMS.txt`, and release notes. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security notes

- Never commit secrets, `.env` files, real office data, or `testsprite_tests/`. The installer generates all secrets on the host PC.
- Passwords are hashed with Argon2id. Sessions are server-side, and the cookie is HttpOnly and SameSite=Lax. Cross-origin writes are refused.
- The bundled database listens only on `127.0.0.1:3307` and has no firewall rule. The app port is opened only for Private networks, and only when LAN access is enabled.
- Third-party licenses: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
