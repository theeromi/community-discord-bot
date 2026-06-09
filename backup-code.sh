#!/bin/bash

# Code Backup Script for Dimandem Bot
# Creates a complete backup of all source code and configuration files
# Run manually or schedule with cron

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_BASE_DIR="${SCRIPT_DIR}/code-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/backup_${TIMESTAMP}"
LOG_FILE="${BACKUP_BASE_DIR}/backup.log"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"
log "Starting code backup to: $BACKUP_DIR"

# Files and directories to backup (exclude common non-essential files)
EXCLUDE_PATTERNS=(
    'node_modules'
    '*.db'
    '*.db.*'
    '.git'
    '.env'
    'code-backups'
    'backups'
    '*.log'
    '*.tar.gz'
    '*.zip'
    '.DS_Store'
    'final_metrics.json'
)

# Build rsync exclude arguments
RSYNC_EXCLUDE=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    RSYNC_EXCLUDE="$RSYNC_EXCLUDE --exclude='$pattern'"
done

# Use rsync to copy files (preserves permissions, timestamps, etc.)
log "Copying files..."
eval rsync -av "$RSYNC_EXCLUDE" "${SCRIPT_DIR}/" "${BACKUP_DIR}/" 2>&1 | tee -a "$LOG_FILE"

# Create a compressed archive
log "Creating compressed archive..."
ARCHIVE_NAME="dimandem-bot-code_${TIMESTAMP}.tar.gz"
cd "$BACKUP_BASE_DIR"
tar -czf "$ARCHIVE_NAME" "backup_${TIMESTAMP}" 2>&1 | tee -a "$LOG_FILE"

# Get archive size
ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
log "Archive created: $ARCHIVE_NAME (${ARCHIVE_SIZE})"

# Clean up uncompressed backup directory (optional - comment out if you want to keep both)
# rm -rf "${BACKUP_DIR}"

# Clean up old backups (keep last 30 days)
log "Cleaning up old backups..."
find "$BACKUP_BASE_DIR" -name "backup_*" -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true
find "$BACKUP_BASE_DIR" -name "dimandem-bot-code_*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true

# Calculate total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_BASE_DIR" | cut -f1)
BACKUP_COUNT=$(find "$BACKUP_BASE_DIR" -name "dimandem-bot-code_*.tar.gz" -type f | wc -l)

log "${GREEN}Code backup completed successfully!${NC}"
log "Total backups: $BACKUP_COUNT"
log "Total size: $TOTAL_SIZE"
log "Latest backup: $ARCHIVE_NAME"
log "=========================================="

exit 0

