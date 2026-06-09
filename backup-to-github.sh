#!/bin/bash

# GitHub Backup Script for dimandem-bot
# This script backs up your bot to GitHub daily or weekly
# Schedule with cron: 0 2 * * 0 /Volumes/Dimandem/dimandem-bot/backup-to-github.sh (weekly, Sunday 2am)
# Or: 0 2 * * * /Volumes/Dimandem/dimandem-bot/backup-to-github.sh (daily, 2am)

set -e

BACKUP_DIR="/tmp/dimandem-backup-$$"
BOT_SOURCE="/Volumes/Dimandem/dimandem-bot"
GITHUB_REPO="https://github.com/theeromi/community-discord-bot.git"
LOG_FILE="/Volumes/Dimandem/dimandem-bot/backup.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting GitHub backup..." >> "$LOG_FILE"

# Create temporary backup directory
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

# Clone the existing GitHub repo (to preserve history)
if ! git clone "$GITHUB_REPO" repo 2>> "$LOG_FILE"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to clone repo" >> "$LOG_FILE"
    rm -rf "$BACKUP_DIR"
    exit 1
fi

cd repo

# Configure git
git config user.name "dimandem-backup"
git config user.email "backup@dimandem.local"

# Copy bot files (excluding node_modules, .env, and databases)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Copying bot files..." >> "$LOG_FILE"
rsync -av \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='*.db' \
    --exclude='*.db.*' \
    --exclude='*.bak' \
    --exclude='.git' \
    --exclude='dimandem-bot.tar.gz' \
    --exclude='backups/' \
    "$BOT_SOURCE/" . 2>> "$LOG_FILE"

# Check if there are changes
if git diff --quiet && git diff --cached --quiet; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to commit, backup skipped" >> "$LOG_FILE"
    rm -rf "$BACKUP_DIR"
    exit 0
fi

# Stage and commit changes
git add .
git commit -m "Automated backup - $(date '+%Y-%m-%d %H:%M:%S')" 2>> "$LOG_FILE"

# Push to GitHub
if git push origin main 2>> "$LOG_FILE"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup successful!" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Push failed (may need authentication)" >> "$LOG_FILE"
fi

# Cleanup
rm -rf "$BACKUP_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed" >> "$LOG_FILE"
