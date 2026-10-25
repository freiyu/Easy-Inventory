#!/usr/bin/env bash
# Creates the dev databases and the limited `ezi` MySQL user (never root, PRD 6.7).
# Reads the password from backend/.env, so no secret lives in this file. Run once: bash scripts/dev-db-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(grep '^DATABASE_URL=' backend/.env | cut -d= -f2-)
pw=$(echo "$url" | sed -E 's#^mysql://[^:]+:([^@]+)@.*#\1#')
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS ezi_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS ezi_dev_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ezi'@'localhost' IDENTIFIED BY '${pw}';
CREATE USER IF NOT EXISTS 'ezi'@'127.0.0.1' IDENTIFIED BY '${pw}';
ALTER USER 'ezi'@'localhost' IDENTIFIED BY '${pw}';
ALTER USER 'ezi'@'127.0.0.1' IDENTIFIED BY '${pw}';
GRANT ALL PRIVILEGES ON ezi_dev.* TO 'ezi'@'localhost', 'ezi'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ezi_dev_shadow.* TO 'ezi'@'localhost', 'ezi'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
echo "Dev databases ezi_dev and ezi_dev_shadow ready for user ezi."
