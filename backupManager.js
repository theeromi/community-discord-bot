// backupManager.js
// Database backup and recovery system for Dimandem Bot

const fs = require('fs').promises;
const path = require('path');
const { promisifyDB } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class BackupManager {
  constructor(dbPath, backupDir = './backups') {
    this.dbPath = dbPath;
    this.backupDir = backupDir;
    this.maxBackups = 7; // Keep last 7 database backups
  }

  // Initialize backup directory
  async init() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logWithTimestamp('Backup system initialized');
    } catch (error) {
      errorWithTimestamp('Failed to initialize backup system:', error);
      throw error;
    }
  }

  // Create a full database backup
  async createBackup(label = 'auto') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `dimandem_backup_${label}_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupFileName);

      await fs.copyFile(this.dbPath, backupPath);

      // Verify backup integrity
      await this.verifyBackup(backupPath);

      logWithTimestamp(`Database backup created: ${backupFileName}`);

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      errorWithTimestamp('Failed to create backup:', error);
      throw error;
    }
  }

  // Export database to JSON format
  async exportToJSON(db, outputPath = null) {
    try {
      const dbAsync = promisifyDB(db);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = outputPath || path.join(this.backupDir, `export_${timestamp}.json`);

      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        tables: {}
      };

      // Get all table names
      const tables = await dbAsync.all(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      // Export each table
      for (const table of tables) {
        const rows = await dbAsync.all(`SELECT * FROM ${table.name}`);
        exportData.tables[table.name] = rows;
      }

      await fs.writeFile(fileName, JSON.stringify(exportData, null, 2));
      logWithTimestamp(`Database exported to JSON: ${fileName}`);

      return fileName;
    } catch (error) {
      errorWithTimestamp('Failed to export database:', error);
      throw error;
    }
  }

  // Import database from JSON format
  async importFromJSON(db, jsonPath) {
    try {
      const dbAsync = promisifyDB(db);
      const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

      if (!jsonData.tables) {
        throw new Error('Invalid JSON backup format');
      }

      logWithTimestamp('Starting database import from JSON...');

      // Import each table
      for (const [tableName, rows] of Object.entries(jsonData.tables)) {
        if (rows.length === 0) continue;

        logWithTimestamp(`Importing ${rows.length} rows to table: ${tableName}`);

        // Get column names from first row
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');

        // Clear existing data (optional - comment out if you want to merge)
        // await dbAsync.run(`DELETE FROM ${tableName}`);

        // Insert data
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          await dbAsync.run(
            `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
      }

      logWithTimestamp('Database import completed successfully');
    } catch (error) {
      errorWithTimestamp('Failed to import database:', error);
      throw error;
    }
  }

  // Verify backup integrity
  async verifyBackup(backupPath) {
    try {
      const sqlite3 = require('sqlite3').verbose();
      const testDb = new sqlite3.Database(backupPath);

      return new Promise((resolve, reject) => {
        testDb.get('PRAGMA integrity_check', (err, row) => {
          testDb.close();

          if (err) {
            reject(new Error(`Backup verification failed: ${err.message}`));
          } else if (row && row.integrity_check === 'ok') {
            resolve(true);
          } else {
            reject(new Error('Backup integrity check failed'));
          }
        });
      });
    } catch (error) {
      throw new Error(`Backup verification error: ${error.message}`);
    }
  }

  // Restore database from backup
  async restoreFromBackup(backupPath) {
    try {
      // Verify backup before restore
      await this.verifyBackup(backupPath);

      // Create a backup of current database before restore
      await this.createBackup('pre-restore');

      // Restore the database
      await fs.copyFile(backupPath, this.dbPath);

      logWithTimestamp(`Database restored from: ${backupPath}`);
    } catch (error) {
      errorWithTimestamp('Failed to restore database:', error);
      throw error;
    }
  }

  // Clean up old backups
  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('dimandem_backup_') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: 0
        }));

      // Get file stats
      for (const file of backupFiles) {
        const stats = await fs.stat(file.path);
        file.mtime = stats.mtime.getTime();
      }

      // Sort by modification time (newest first)
      backupFiles.sort((a, b) => b.mtime - a.mtime);

      // Delete old backups
      if (backupFiles.length > this.maxBackups) {
        const toDelete = backupFiles.slice(this.maxBackups);

        for (const file of toDelete) {
          await fs.unlink(file.path);
          logWithTimestamp(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      errorWithTimestamp('Failed to cleanup old backups:', error);
    }
  }

  // List available backups
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('dimandem_backup_') && file.endsWith('.db'))
        .map(async file => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime
          };
        });

      const backups = await Promise.all(backupFiles);
      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      errorWithTimestamp('Failed to list backups:', error);
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
      errorWithTimestamp('Failed to get backup stats:', error);
      return { totalBackups: 0, totalSize: 0 };
    }
  }

  // Schedule automatic backups
  scheduleBackups(intervalMs = 24 * 60 * 60 * 1000) { // Default: daily
    setInterval(async () => {
      try {
        await this.createBackup('scheduled');
      } catch (error) {
        errorWithTimestamp('Scheduled backup failed:', error);
      }
    }, intervalMs);

    logWithTimestamp(`Automatic backups scheduled every ${intervalMs / 1000 / 60 / 60} hours`);
  }
}

module.exports = { BackupManager };