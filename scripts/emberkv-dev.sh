#!/usr/bin/env bash
# Runs emberkv-server natively from the sibling ../emberkv checkout, with
# auth on, data under .dev/, HTTP on 127.0.0.1:8080. For the containerized
# alternative, use `docker compose up emberkv`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EMBERKV_DIR="${EMBERKV_DIR:-$ROOT/../emberkv}"

"$ROOT/scripts/emberkv-setup.sh"
mkdir -p "$ROOT/.dev/emberkv-data" "$ROOT/.dev/emberkv-backups"

if [[ ! -x "$EMBERKV_DIR/target/release/emberkv-server" ]]; then
  cargo build --release --manifest-path "$EMBERKV_DIR/Cargo.toml" -p emberkv-server
fi

exec "$EMBERKV_DIR/target/release/emberkv-server" \
  --http-listen 127.0.0.1:8080 \
  --listen 127.0.0.1:7878 \
  --data-dir "$ROOT/.dev/emberkv-data" \
  --backup-dir "$ROOT/.dev/emberkv-backups" \
  --auth-file "$ROOT/.dev/emberkv-auth.toml"
