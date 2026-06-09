#!/usr/bin/env node
// init-database.js — initialise a fresh SQLite database

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database file path (override with DB_PATH env var for cloud volume mounts)
const dbPath = process.env.DB_PATH || './dimandem.db';

// Backup existing database if it exists
if (fs.existsSync(dbPath)) {
  const backupPath = `./dimandem_backup_${Date.now()}.db`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`✅ Existing database backed up to: ${backupPath}`);
}

// Create new database
const db = new sqlite3.Database(dbPath);

console.log('🔧 Initializing fresh Dimandem Bot database...');

// Create tables
const initSchema = `
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);
CREATE INDEX IF NOT EXISTS idx_users_messages ON users(messages DESC);
CREATE INDEX IF NOT EXISTS idx_users_voice ON users(voiceMinutes DESC);

INSERT OR IGNORE INTO users (id, username, xp, level, messages, voiceMinutes, joinDate)
VALUES ('test_user_1', 'TestUser', 150, 1, 50, 120, datetime('now'));
-- Reputation system
CREATE TABLE IF NOT EXISTS reputation (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reputation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giver_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  reason TEXT,
  given_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rep_points ON reputation(points DESC);
CREATE INDEX IF NOT EXISTS idx_rep_log_giver ON reputation_log(giver_id, given_at DESC);

-- AFK status
CREATE TABLE IF NOT EXISTS afk_status (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  message TEXT,
  set_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message TEXT NOT NULL,
  remind_at DATETIME NOT NULL,
  reminded BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at, reminded);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

-- Achievement tracking (for stats like trivia wins, gifts given, etc.)
CREATE TABLE IF NOT EXISTS achievement_stats (
  user_id TEXT PRIMARY KEY,
  trivia_wins INTEGER DEFAULT 0,
  money_earned INTEGER DEFAULT 0,
  gifts_given INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  coinflip_streak INTEGER DEFAULT 0,
  best_coinflip_streak INTEGER DEFAULT 0
);

-- Giveaways
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  host_id TEXT NOT NULL,
  winner_id TEXT,
  end_time DATETIME NOT NULL,
  ended BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(ended, end_time);

-- Insert some test data (optional)
INSERT OR IGNORE INTO users (id, username, xp, level, messages, voiceMinutes, joinDate)
VALUES ('test_user_1', 'TestUser', 150, 1, 50, 120, datetime('now'));
`;

// Execute the schema
db.exec(initSchema, (err) => {
  if (err) {
    console.error('❌ Error creating database:', err);
    process.exit(1);
  }

  console.log('✅ Database initialized successfully!');

  // Verify the database
  db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
    if (err) {
      console.error('❌ Error verifying database:', err);
    } else {
      console.log('📋 Created tables:', tables.map(t => t.name).join(', '));
    }

    // Close database
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err);
      } else {
        console.log('🎉 Database setup complete! You can now restart your bot.');
      }
    });
  });
});