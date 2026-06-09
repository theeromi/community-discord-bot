// migrations.js
// Database migration system for Dimandem Bot

const fs = require('fs').promises;
const path = require('path');
const { promisifyDB, DatabaseError } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class MigrationManager {
  constructor(db, migrationsDir = './migrations') {
    this.db = promisifyDB(db);
    this.migrationsDir = migrationsDir;
    this.initMigrationsTable();
  }

  // Initialize migrations tracking table
  async initMigrationsTable() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          execution_time INTEGER, -- milliseconds
          checksum TEXT
        )
      `);

      // Create migrations directory if it doesn't exist
      try {
        await fs.mkdir(this.migrationsDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, that's fine
      }

      logWithTimestamp('Migration system initialized');
    } catch (error) {
      errorWithTimestamp('Failed to initialize migration system:', error);
      throw error;
    }
  }

  // Create a new migration file
  async createMigration(name, type = 'sql') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const version = timestamp.replace(/[-T]/g, '').replace(/[-]/g, '');
      const filename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.${type}`;
      const filepath = path.join(this.migrationsDir, filename);

      let template = '';
      if (type === 'sql') {
        template = `-- Migration: ${name}
-- Version: ${version}
-- Created: ${new Date().toISOString()}

-- UP: Apply the migration
-- Add your SQL statements here

-- Example:
-- CREATE TABLE example_table (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- DOWN: Rollback the migration (optional, for future use)
-- Add rollback SQL statements here

-- Example:
-- DROP TABLE IF EXISTS example_table;
`;
      } else if (type === 'js') {
        template = `// Migration: ${name}
// Version: ${version}
// Created: ${new Date().toISOString()}

const { promisifyDB } = require('../errorHandler');

module.exports = {
  version: '${version}',
  name: '${name}',

  async up(db) {
    const dbAsync = promisifyDB(db);

    // Add your migration logic here
    // Example:
    // await dbAsync.run(\`
    //   CREATE TABLE example_table (
    //     id INTEGER PRIMARY KEY AUTOINCREMENT,
    //     name TEXT NOT NULL,
    //     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    //   )
    // \`);
  },

  async down(db) {
    const dbAsync = promisifyDB(db);

    // Add your rollback logic here (optional)
    // Example:
    // await dbAsync.run('DROP TABLE IF EXISTS example_table');
  }
};
`;
      }

      await fs.writeFile(filepath, template);
      logWithTimestamp(`Created migration file: ${filename}`);

      return {
        version,
        filename,
        filepath
      };

    } catch (error) {
      errorWithTimestamp('Failed to create migration:', error);
      throw error;
    }
  }

  // Get list of migration files
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
        .sort()
        .map(file => {
          const version = file.split('_')[0];
          const name = file.substring(version.length + 1).replace(/\.(sql|js)$/, '').replace(/_/g, ' ');
          const type = file.endsWith('.sql') ? 'sql' : 'js';

          return {
            version,
            name,
            filename: file,
            filepath: path.join(this.migrationsDir, file),
            type
          };
        });
    } catch (error) {
      errorWithTimestamp('Failed to read migration files:', error);
      return [];
    }
  }

  // Get applied migrations from database
  async getAppliedMigrations() {
    try {
      return await this.db.all(`
        SELECT version, name, applied_at, execution_time
        FROM schema_migrations
        ORDER BY version ASC
      `);
    } catch (error) {
      errorWithTimestamp('Failed to get applied migrations:', error);
      return [];
    }
  }

  // Get pending migrations
  async getPendingMigrations() {
    try {
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      const appliedVersions = new Set(appliedMigrations.map(m => m.version));

      return allMigrations.filter(migration => !appliedVersions.has(migration.version));
    } catch (error) {
      errorWithTimestamp('Failed to get pending migrations:', error);
      return [];
    }
  }

  // Calculate file checksum
  async calculateChecksum(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const crypto = require('crypto');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  // Execute SQL migration
  async executeSQLMigration(migration) {
    try {
      const content = await fs.readFile(migration.filepath, 'utf8');

      // Split by semicolons and filter out comments and empty lines
      const statements = content
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.includes('-- DOWN:'))
        .filter(stmt => {
          // Stop at DOWN section for now (rollback support can be added later)
          return !stmt.includes('-- DOWN:');
        });

      for (const statement of statements) {
        if (statement.trim()) {
          await this.db.run(statement);
        }
      }

    } catch (error) {
      throw new Error(`SQL migration failed: ${error.message}`);
    }
  }

  // Execute JavaScript migration
  async executeJSMigration(migration) {
    try {
      // Import the migration module
      const migrationModule = require(path.resolve(migration.filepath));

      if (typeof migrationModule.up !== 'function') {
        throw new Error('Migration must export an "up" function');
      }

      // Execute the up function
      await migrationModule.up(this.db);

    } catch (error) {
      throw new Error(`JavaScript migration failed: ${error.message}`);
    }
  }

  // Run a single migration
  async runMigration(migration) {
    const startTime = Date.now();

    try {
      logWithTimestamp(`Applying migration: ${migration.version} - ${migration.name}`);

      if (migration.type === 'sql') {
        await this.executeSQLMigration(migration);
      } else if (migration.type === 'js') {
        await this.executeJSMigration(migration);
      } else {
        throw new Error(`Unsupported migration type: ${migration.type}`);
      }

      const executionTime = Date.now() - startTime;
      const checksum = await this.calculateChecksum(migration.filepath);

      // Record migration as applied
      await this.db.run(`
        INSERT INTO schema_migrations (version, name, execution_time, checksum)
        VALUES (?, ?, ?, ?)
      `, [migration.version, migration.name, executionTime, checksum]);

      logWithTimestamp(`Migration completed: ${migration.version} (${executionTime}ms)`);

      return { success: true, executionTime };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      errorWithTimestamp(`Migration failed: ${migration.version}`, error);

      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  // Run all pending migrations
  async runPendingMigrations() {
    try {
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        logWithTimestamp('No pending migrations to run');
        return { migrationsRun: 0, results: [] };
      }

      logWithTimestamp(`Running ${pendingMigrations.length} pending migrations...`);
      const results = [];

      for (const migration of pendingMigrations) {
        const result = await this.runMigration(migration);
        results.push({
          migration: migration.version,
          name: migration.name,
          ...result
        });

        // Stop on first failure
        if (!result.success) {
          errorWithTimestamp('Migration sequence stopped due to failure');
          break;
        }
      }

      const successCount = results.filter(r => r.success).length;
      logWithTimestamp(`Migration sequence completed: ${successCount}/${pendingMigrations.length} successful`);

      return {
        migrationsRun: successCount,
        totalMigrations: pendingMigrations.length,
        results
      };

    } catch (error) {
      errorWithTimestamp('Failed to run pending migrations:', error);
      throw error;
    }
  }

  // Get migration status
  async getStatus() {
    try {
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = await this.getPendingMigrations();

      const appliedVersions = new Set(appliedMigrations.map(m => m.version));

      const status = allMigrations.map(migration => ({
        version: migration.version,
        name: migration.name,
        type: migration.type,
        applied: appliedVersions.has(migration.version),
        appliedAt: appliedMigrations.find(m => m.version === migration.version)?.applied_at || null
      }));

      return {
        totalMigrations: allMigrations.length,
        appliedMigrations: appliedMigrations.length,
        pendingMigrations: pendingMigrations.length,
        status
      };

    } catch (error) {
      errorWithTimestamp('Failed to get migration status:', error);
      throw error;
    }
  }

  // Validate migration integrity
  async validateIntegrity() {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const issues = [];

      for (const migration of appliedMigrations) {
        const filepath = path.join(this.migrationsDir,
          `${migration.version}_${migration.name.replace(/\s+/g, '_')}.sql`);

        try {
          const currentChecksum = await this.calculateChecksum(filepath);

          if (migration.checksum && currentChecksum !== migration.checksum) {
            issues.push({
              version: migration.version,
              issue: 'checksum_mismatch',
              details: 'Migration file has been modified after application'
            });
          }
        } catch (error) {
          issues.push({
            version: migration.version,
            issue: 'file_missing',
            details: 'Migration file no longer exists'
          });
        }
      }

      return {
        isValid: issues.length === 0,
        issues
      };

    } catch (error) {
      errorWithTimestamp('Failed to validate migration integrity:', error);
      throw error;
    }
  }

  // Create initial database schema migration
  async createInitialMigration() {
    try {
      const initialSchema = `-- Initial database schema for Dimandem Bot
-- Version: initial
-- Created: ${new Date().toISOString()}

-- Users table for XP and profile data
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  voiceMinutes INTEGER DEFAULT 0,
  joinDate TEXT,
  birthday TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table (if not using separate audit system)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  moderator_name TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  reason TEXT,
  details TEXT,
  channel_id TEXT,
  message_id TEXT,
  expires_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);
CREATE INDEX IF NOT EXISTS idx_audit_guild_id ON audit_logs(guild_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_logs(action_type);
`;

      const timestamp = '00000000000000'; // Use a very early timestamp for initial migration
      const filename = `${timestamp}_initial_schema.sql`;
      const filepath = path.join(this.migrationsDir, filename);

      await fs.writeFile(filepath, initialSchema);
      logWithTimestamp(`Created initial migration: ${filename}`);

      return filename;

    } catch (error) {
      errorWithTimestamp('Failed to create initial migration:', error);
      throw error;
    }
  }

  // Reset migrations (dangerous - for development only)
  async resetMigrations() {
    try {
      logWithTimestamp('WARNING: Resetting all migrations');

      await this.db.run('DELETE FROM schema_migrations');
      logWithTimestamp('All migration records cleared');

      return true;
    } catch (error) {
      errorWithTimestamp('Failed to reset migrations:', error);
      throw error;
    }
  }
}

module.exports = { MigrationManager };