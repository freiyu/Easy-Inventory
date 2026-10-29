#!/usr/bin/env bash
# Prepares everything the Windows installer packs (PRD 11.2, 11.7). Runs in WSL from any folder:
#   installer/stage.sh [output folder]      default /mnt/c/ezi-build (a Windows folder, so ISCC can read it)
# Then, on Windows: powershell -ExecutionPolicy Bypass -File C:\ezi-build\build.ps1
# Downloads are checked against the SHA-256 values in versions.json and cached in installer/cache (git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/mnt/c/ezi-build}"
STAGE="$OUT/stage"
CACHE="$ROOT/installer/cache"
v() { node -p "require('$ROOT/installer/versions.json').$1"; }

fetch() { # name -> cached file path, verified
  local url sha file
  url="$(v "$1.url")"; sha="$(v "$1.sha256")"; file="$CACHE/$(basename "$url")"
  mkdir -p "$CACHE"
  if [ ! -f "$file" ] || ! echo "$sha  $file" | sha256sum -c --status; then
    echo "Downloading $url" >&2
    curl -fsSL --retry 3 -o "$file.part" "$url"
    echo "$sha  $file.part" | sha256sum -c --status || { echo "SHA-256 mismatch for $url" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
  echo "$file"
}

echo "== Build frontend and backend"
(cd "$ROOT/frontend" && npm run build)
(cd "$ROOT/backend" && npm run bundle)

echo "== Stage app files into $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/app" "$STAGE/service" "$STAGE/tools"
cp "$ROOT/backend/dist/main.mjs" "$ROOT/backend/dist/cli.mjs" "$ROOT/backend/prisma.config.ts" "$STAGE/app/"
cp -r "$ROOT/frontend/out" "$STAGE/app/public"
mkdir -p "$STAGE/app/prisma"
cp -r "$ROOT/backend/prisma/schema.prisma" "$ROOT/backend/prisma/migrations" "$STAGE/app/prisma/"

# Runtime packages that stay outside the bundle: argon2 (native, ships a win32-x64 prebuild), the mariadb driver
# (LGPL-2.1: kept as a separate, replaceable package) and the Prisma CLI for `migrate deploy`, with its Windows schema
# engine. Versions match the backend lock file.
ver() { node -p "require('$ROOT/backend/node_modules/$1/package.json').version"; }
echo '{ "private": true, "type": "module" }' > "$STAGE/app/package.json"
(cd "$STAGE/app" && PRISMA_CLI_BINARY_TARGETS=windows npm install --omit=dev --no-audit --no-fund --no-package-lock \
  "argon2@$(ver argon2)" "mariadb@$(ver mariadb)" "prisma@$(ver prisma)")
# npm's .bin entries are WSL symlinks that Windows cannot open (ISCC: "The file cannot be accessed by the system").
# EZI never uses them: the host tool runs node_modules/prisma/build/index.js directly.
rm -rf "$STAGE/app/node_modules/.bin"
test -z "$(find "$STAGE" -type l)"
test -d "$STAGE/app/node_modules/argon2/prebuilds/win32-x64"
ls "$STAGE/app/node_modules/@prisma/engines/" | grep -q "schema-engine-windows.exe"

echo "== Node, MariaDB, WinSW"
NODE_ZIP="$(fetch node)"; DB_ZIP="$(fetch mariadb)"; WINSW="$(fetch winsw)"; ISL="$(fetch innoIndonesian)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$NODE_ZIP" -d "$TMP/node" && mv "$TMP"/node/node-* "$STAGE/node"
rm -rf "$STAGE/node/node_modules/npm" "$STAGE/node/node_modules/corepack" "$STAGE/node/"{npm,npx,corepack}*
unzip -q "$DB_ZIP" -d "$TMP/db" && mv "$TMP"/db/mariadb-* "$STAGE/mariadb"
# Keep only the programs EZI runs (server, client, dump, install, upgrade, check) and their DLLs: no debug symbols,
# headers, tests or backup tools (keeps the installer small). mariadb-install-db and mariadb-upgrade still call the
# old names (mysqld.exe, mysql.exe, mysqlcheck.exe), so those copies stay too.
find "$STAGE/mariadb/bin" -type f ! -name "*.dll" ! -name mariadbd.exe ! -name mariadb.exe ! -name mariadb-dump.exe \
  ! -name mariadb-install-db.exe ! -name mariadb-upgrade.exe ! -name mariadb-check.exe \
  ! -name mysqld.exe ! -name mysql.exe ! -name mysqlcheck.exe -delete
find "$STAGE/mariadb" -name "*.pdb" -delete
rm -rf "$STAGE/mariadb/include" "$STAGE/mariadb/mysql-test" "$STAGE/mariadb/sql-bench" "$STAGE/mariadb/data"
cp "$WINSW" "$STAGE/service/ezi-service.exe"
sed 's/\r*$/\r/' "$ROOT/installer/control.cmd" > "$STAGE/tools/control.cmd" # cmd.exe needs CRLF

echo "== Installer script and notices"
cp "$ROOT/installer/ezi.iss" "$ROOT/installer/build.ps1" "$ROOT/installer/ezi.ico" "$OUT/"
cp "$ISL" "$OUT/Indonesian.isl"
# Notices plus the name, version and license of every production npm package (bundled or shipped).
{
  cat "$ROOT/THIRD-PARTY-NOTICES.md"
  echo
  for dir in "$ROOT/backend" "$ROOT/frontend" "$STAGE/app"; do
    (cd "$dir" && npm ls --omit=dev --all --parseable 2>/dev/null) | tail -n +2
  done | sort -u | while read -r pkg; do
    node -e 'const p=require(process.argv[1]+"/package.json");console.log(`- ${p.name} ${p.version}: ${typeof p.license==="string"?p.license:"see package"}`)' "$pkg"
  done | sort -u
} > "$OUT/THIRD-PARTY-NOTICES.txt"
cp "$OUT/THIRD-PARTY-NOTICES.txt" "$STAGE/THIRD-PARTY-NOTICES.txt"
echo "#define AppVersion \"$(v app)\"" > "$OUT/version.iss"
du -sh "$STAGE"
echo "Done. On Windows run: powershell -ExecutionPolicy Bypass -File $(wslpath -w "$OUT" 2>/dev/null || echo "$OUT")\\build.ps1"
