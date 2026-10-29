# Building and publishing the EZI installer

For the developer. End users read [INSTALLATION.md](INSTALLATION.md).

## 1. What the installer contains

| Part | Source | Installed to |
|---|---|---|
| Server bundle `main.mjs`, host tool `cli.mjs` | `backend/` via `npm run bundle` (esbuild, argon2 stays external) | `{app}\app` |
| Static frontend | `frontend/out` via `npm run build` | `{app}\app\public` |
| Prisma schema, migrations, `prisma.config.ts`, Prisma CLI with the Windows schema engine, argon2 | staged by `stage.sh` | `{app}\app` |
| Node.js 22 (win-x64 zip) | `installer/versions.json` | `{app}\node` |
| MariaDB 11.8 LTS (winx64 zip, no debug symbols) | `installer/versions.json` | `{app}\mariadb` |
| WinSW 2.12.0 (.NET 4.6.1 build) | `installer/versions.json` | `{app}\service\ezi-service.exe` |
| Start Menu helper | `installer/control.cmd` | `{app}\tools` |

`{app}` defaults to `C:\Program Files\EZI`. Data lives in `C:\ProgramData\EZI` (`config`, `mysql-data`, `backups`, `logs`) and is never replaced by an update.

Every download is pinned by version and SHA-256 in `installer/versions.json`. To bump one, change the URL and hash together (Node: `SHASUMS256.txt`; MariaDB: the downloads REST API; WinSW and the Inno Indonesian messages file: hash a reviewed download).

## 2. Runtime design

- **Services:** `EZI-DB` is MariaDB's own service (`mariadb-install-db --service`), bound to `127.0.0.1:3307`, never opened in the firewall. `EZI` is WinSW running `node main.mjs` as `NT AUTHORITY\LocalService`, depending on `EZI-DB`. Start type is Automatic or Manual (installer option).
- **Config:** `C:\ProgramData\EZI\config\ezi.env`, read through `EZI_ENV_FILE` (`backend/src/env.ts`). Secrets are generated on the target PC (hex, `crypto.randomBytes`). The MariaDB root password is in `db-root.env` in the same folder. The data folder is restricted to Administrators and SYSTEM; LocalService can read `config` and write `backups` and `logs`.
- **Host tool:** `backend/src/tools/cli.ts` does every install step and writes a log per run (`install-*.log`, `update-*.log`, ...). Pure helpers in `tools/host.ts` are unit-tested. Restore uses `restoreDump` in `services/backup.ts`, which the integration tests cover.
- **Install:** port check, then `mariadb-install-db`, `bind-address=127.0.0.1` in `my.ini`, database and limited user, `prisma migrate deploy`, WinSW service, folder ACLs, firewall rule (Private profile, app port only), start, and a smoke test (`/api/setup/status` and `/`). A failure undoes the services and firewall rule it created and never touches existing data.
- **Update:** Inno's `PrepareToInstall` runs the OLD `cli.mjs pre-upgrade` (stop EZI, "Before update" backup, stop EZI-DB) before any file is replaced; a failed backup aborts the update. After copying, `install` sees the existing config and runs update mode (`mariadb-upgrade`, `migrate deploy`, service refresh, smoke test).
- **Uninstall:** "Pindah ke PC lain" (last backup copied to a chosen folder, data kept) or "Bersihkan PC" (optional last backup, second confirmation, then `C:\ProgramData\EZI` is deleted). Services and the firewall rule are removed in both modes.

## 3. Build

**In WSL (repo root):**

```bash
installer/stage.sh            # default output: /mnt/c/ezi-build (C:\ezi-build)
```

It builds the frontend and backend, stages the app, installs the runtime packages with `PRISMA_CLI_BINARY_TARGETS=windows`, downloads and verifies Node, MariaDB, WinSW and the Inno Indonesian messages (cached in `installer/cache/`, git-ignored), and writes `THIRD-PARTY-NOTICES.txt` with every production npm package and its license.

**On Windows (PowerShell):**

```powershell
winget install JRSoftware.InnoSetup      # once
powershell -ExecutionPolicy Bypass -File C:\ezi-build\build.ps1
```

Output: `C:\ezi-build\output\EZI-Setup-<version>.exe` and `SHA256SUMS.txt`. The version comes from `installer/versions.json` (`app`).

## 4. Verify before publishing

On a Windows 10/11 PC or VM, run the completion criteria (PRD 11.8) and the deployment smoke test (PRD 11.9): fresh install, restart, LAN access, `netstat -ano | findstr 3307` shows only `127.0.0.1`, upgrade from the previous version, restore on a test copy, the auto-start option off, and both uninstall modes.

## 5. Publish (PRD 12.1)

Only after human approval (push and releases wait for the stage approval):

1. Tag the commit with a semantic version (`v0.1.0`; `v1.0.0` only when the MVP passes acceptance).
2. Create a GitHub Release for that tag and upload `EZI-Setup-<version>.exe`, `SHA256SUMS.txt`, and release notes, including migration notes.

No GitHub Actions, code signing, portable ZIP, or VPS/cloud deployment (PRD 1.4, 11.6).
