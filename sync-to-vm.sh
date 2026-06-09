#!/usr/bin/env bash

set -euo pipefail

# Defaults for your VM target.
VM_HOST="${VM_HOST:-192.168.1.246}"
VM_USER="${VM_USER:-imandem-bot}"
REMOTE_DIR="${REMOTE_DIR:-/home/${VM_USER}/dimandem-bot}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RESTART_DOCKER=false
DELETE_REMOTE=true

usage() {
  cat <<'EOF'
Usage: ./sync-to-vm.sh [options]

Sync the current project to the VM using rsync, including hidden files like .env.

Options:
  --host <ip-or-hostname>   Override VM host (default: 192.168.1.246)
  --user <username>         Override VM user (default: imandem-bot)
  --remote-dir <path>       Override destination path on VM
  --restart-docker          Run docker compose up -d --build on VM after sync
  --no-delete               Do not delete files on VM that were removed locally
  -h, --help                Show this help

Environment overrides:
  VM_HOST, VM_USER, REMOTE_DIR

Examples:
  ./sync-to-vm.sh
  ./sync-to-vm.sh --restart-docker
  ./sync-to-vm.sh --host 192.168.1.246 --user imandem-bot
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      VM_HOST="$2"
      shift 2
      ;;
    --user)
      VM_USER="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --restart-docker)
      RESTART_DOCKER=true
      shift
      ;;
    --no-delete)
      DELETE_REMOTE=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

for cmd in rsync ssh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' is not installed."
    exit 1
  fi
done

echo "[1/4] Creating remote directory on ${VM_USER}@${VM_HOST}:${REMOTE_DIR}"
ssh -o StrictHostKeyChecking=accept-new "${VM_USER}@${VM_HOST}" "mkdir -p '${REMOTE_DIR}'"

RSYNC_DELETE_FLAG=""
if [[ "$DELETE_REMOTE" == true ]]; then
  RSYNC_DELETE_FLAG="--delete"
fi

echo "[2/4] Syncing project files (including .env if present)"
rsync -avz "$RSYNC_DELETE_FLAG" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='npm-debug.log*' \
  --exclude='.DS_Store' \
  "${LOCAL_DIR}/" "${VM_USER}@${VM_HOST}:${REMOTE_DIR}/"

echo "[3/4] Securing remote .env permissions (if .env exists)"
ssh "${VM_USER}@${VM_HOST}" "if [ -f '${REMOTE_DIR}/.env' ]; then chmod 600 '${REMOTE_DIR}/.env'; fi"

if [[ "$RESTART_DOCKER" == true ]]; then
  echo "[4/4] Restarting bot with Docker Compose on VM"
  ssh "${VM_USER}@${VM_HOST}" "cd '${REMOTE_DIR}' && docker compose up -d --build"
else
  echo "[4/4] Sync complete (restart step skipped)"
  echo "Run this to restart with Docker when ready:"
  echo "ssh ${VM_USER}@${VM_HOST} \"cd '${REMOTE_DIR}' && docker compose up -d --build\""
fi

echo "Done. VM is now synced with the latest files from ${LOCAL_DIR}."