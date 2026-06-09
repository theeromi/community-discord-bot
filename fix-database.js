#!/usr/bin/env node
// fix-database.js — check and repair the SQLite database

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = process.env.DB_PATH || './dimandem.db';

console.log('🔍 Checking database health...');

// Function to test database integrity
function checkDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Test basic operations
      db.run("PRAGMA integrity_check;", (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Try to read from users table
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
          db.close();
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
    });
  });
}

// Function to recreate database if needed
function recreateDatabase() {
  console.log('🛠️ Recreating database...');

  // Remove corrupted database
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new sqlite3.Database(dbPath);

  const schema = `
    CREATE TABLE users (
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

    CREATE INDEX idx_users_xp ON users(xp DESC);
    CREATE INDEX idx_users_level ON users(level DESC);
  `;

  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Error recreating database:', err);
    } else {
      console.log('✅ Database recreated successfully!');
    }
    db.close();
  });
}

// Main execution
checkDatabase()
  .then((result) => {
    console.log(`✅ Database is healthy! Found ${result.count} users.`);
  })
  .catch((error) => {
    console.log('❌ Database has issues:', error.message);
    console.log('🔧 Attempting to fix...');
    recreateDatabase();
  });