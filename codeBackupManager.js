// codeBackupManager.js
// Code backup manager for Dimandem Bot - Backs up source code files

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

const execAsync = promisify(exec);

class CodeBackupManager {
  constructor(backupDir = './code-backups') {
    this.backupDir = backupDir;
    this.maxBackups = 30; // Keep 30 days of backups
    this.excludePatterns = [
      'node_modules',
      '*.db',
      '*.db.*',
      '.git',
      '.env',
      'code-backups',
      'backups',
      '*.log',
      '*.tar.gz',
      '*.zip',
      '.DS_Store',
      'final_metrics.json',
      'backup.log'
    ];
  }

  // Initialize backup directory
  async init() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logWithTimestamp('Code backup system initialized');
    } catch (error) {
      errorWithTimestamp('Failed to initialize code backup system:', error);
      throw error;
    }
  }

  // Create a code backup
  async createBackup(label = 'auto') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDirName = `backup_${label}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupDirName);
      const botRoot = path.join(__dirname);

      await fs.mkdir(backupPath, { recursive: true });

      // Build rsync exclude arguments
      const excludes = this.excludePatterns.map(pattern => `--exclude=${pattern}`).join(' ');

      // Use rsync if available, otherwise use Node.js copy
      try {
        // Try rsync first (more efficient)
        await execAsync(`rsync -av ${excludes} "${botRoot}/" "${backupPath}/"`, {
          cwd: botRoot,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        logWithTimestamp(`Code backup created using rsync: ${backupDirName}`);
      } catch (rsyncError) {
        // Fallback to Node.js file copy
        logWithTimestamp('rsync not available, using Node.js file copy...');
        await this.copyFilesRecursive(botRoot, backupPath);
        logWithTimestamp(`Code backup created: ${backupDirName}`);
      }

      // Create compressed archive
      const archiveName = `dimandem-bot-code_${label}_${timestamp}.tar.gz`;
      const archivePath = path.join(this.backupDir, archiveName);

      try {
        await execAsync(`tar -czf "${archivePath}" -C "${this.backupDir}" "${backupDirName}"`, {
          maxBuffer: 10 * 1024 * 1024
        });

        // Get archive size
        const stats = await fs.stat(archivePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

        logWithTimestamp(`Compressed archive created: ${archiveName} (${sizeMB} MB)`);

        // Clean up uncompressed directory (optional)
        // await fs.rm(backupPath, { recursive: true, force: true });

        // Clean up old backups
        await this.cleanupOldBackups();

        return {
          backupPath,
          archivePath,
          size: stats.size,
          sizeMB: parseFloat(sizeMB)
        };
      } catch (tarError) {
        // If tar fails, keep uncompressed backup
        logWithTimestamp('Warning: Could not create compressed archive, keeping uncompressed backup');
        return { backupPath, archivePath: null, size: 0, sizeMB: 0 };
      }
    } catch (error) {
      errorWithTimestamp('Failed to create code backup:', error);
      throw error;
    }
  }

  // Recursive file copy (fallback when rsync not available)
  async copyFilesRecursive(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Check if should be excluded
      if (this.shouldExclude(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.copyFilesRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // Check if file/directory should be excluded
  shouldExclude(name) {
    for (const pattern of this.excludePatterns) {
      // Simple pattern matching
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(name)) return true;
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }

  // Clean up old backups
  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupDirs = files
        .filter(file => file.startsWith('backup_'))
        .map(async file => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stats.mtime.getTime()
          };
        });

      const archives = files
        .filter(file => file.startsWith('dimandem-bot-code_') && file.endsWith('.tar.gz'))
        .map(async file => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stats.mtime.getTime()
          };
        });

      const allBackups = await Promise.all([...backupDirs, ...archives]);

      // Sort by modification time (newest first)
      allBackups.sort((a, b) => b.mtime - a.mtime);

      // Delete old backups
      if (allBackups.length > this.maxBackups) {
        const toDelete = allBackups.slice(this.maxBackups);

        for (const backup of toDelete) {
          try {
            const stats = await fs.stat(backup.path);
            if (stats.isDirectory()) {
              await fs.rm(backup.path, { recursive: true, force: true });
            } else {
              await fs.unlink(backup.path);
            }
            logWithTimestamp(`Deleted old code backup: ${backup.name}`);
          } catch (deleteError) {
            errorWithTimestamp(`Failed to delete old backup ${backup.name}:`, deleteError);
          }
        }
      }
    } catch (error) {
      errorWithTimestamp('Failed to cleanup old code backups:', error);
    }
  }

  // List available backups
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        if (file.startsWith('backup_') || file.startsWith('dimandem-bot-code_')) {
          backups.push({
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime,
            isArchive: file.endsWith('.tar.gz')
          });
        }
      }

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      errorWithTimestamp('Failed to list code backups:', error);
      return [];
    }
  }

  // Get backup statistics
  async getStats() {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);

      return {
        totalBackups: backups.length,
        totalSize: Math.round(totalSize / 1024 / 1024 * 100) / 100, // MB
        oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
        newestBackup: backups.length > 0 ? backups[0].created : null
      };
    } catch (error) {
      errorWithTimestamp('Failed to get code backup stats:', error);
      return { totalBackups: 0, totalSize: 0 };
    }
  }

  // Schedule automatic code backups
  scheduleBackups(intervalMs = 24 * 60 * 60 * 1000) { // Default: daily
    setInterval(async () => {
      try {
        await this.createBackup('scheduled');
      } catch (error) {
        errorWithTimestamp('Scheduled code backup failed:', error);
      }
    }, intervalMs);

    logWithTimestamp(`Automatic code backups scheduled every ${intervalMs / 1000 / 60 / 60} hours`);
  }
}

module.exports = { CodeBackupManager };

