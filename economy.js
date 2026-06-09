// economy.js — virtual currency system

const { promisifyDB } = require('./errorHandler');
const config = require('./config');

const DEFAULT_WORK_SCENARIOS = [
  { job: 'completed a small task', min: 30, max: 80 },
  { job: 'helped a community member', min: 40, max: 100 }
];

class EconomySystem {
  constructor(db) {
    this.db = db;
    this.dbAsync = promisifyDB(db);
    this.initialized = false;
  }

  // Initialize economy tables
  async initialize() {
    try {
      // Economy balance table
      await this.dbAsync.run(`
        CREATE TABLE IF NOT EXISTS economy (
          user_id TEXT PRIMARY KEY,
          balance INTEGER DEFAULT 0,
          bank INTEGER DEFAULT 0,
          total_earned INTEGER DEFAULT 0,
          total_spent INTEGER DEFAULT 0,
          daily_streak INTEGER DEFAULT 0,
          last_daily TEXT,
          last_work TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Transactions log
      await this.dbAsync.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Inventory table
      await this.dbAsync.run(`
        CREATE TABLE IF NOT EXISTS inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          active BOOLEAN DEFAULT 1,
          UNIQUE(user_id, item_id)
        )
      `);

      // Shop items table
      await this.dbAsync.run(`
        CREATE TABLE IF NOT EXISTS shop_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          price INTEGER NOT NULL,
          category TEXT,
          emoji TEXT,
          duration_hours INTEGER,
          max_quantity INTEGER,
          active BOOLEAN DEFAULT 1
        )
      `);

      // Insert default shop items
      const defaultItems = [
        { id: 'xp_boost_24h', name: 'XP Boost (24h)', description: 'Double XP for 24 hours', price: 500, category: 'boost', emoji: '⚡', duration_hours: 24 },
        { id: 'xp_boost_7d', name: 'XP Boost (7 days)', description: 'Double XP for 7 days', price: 2500, category: 'boost', emoji: '🔥', duration_hours: 168 },
        { id: 'name_color_red', name: 'Red Name Color', description: 'Change your name color to red', price: 1000, category: 'cosmetic', emoji: '🔴', duration_hours: null },
        { id: 'name_color_gold', name: 'Gold Name Color', description: 'Change your name color to gold', price: 1500, category: 'cosmetic', emoji: '🟡', duration_hours: null },
        { id: 'name_color_purple', name: 'Purple Name Color', description: 'Premium purple name color', price: 2000, category: 'cosmetic', emoji: '🟣', duration_hours: null },
        { id: 'badge_star', name: 'Star Badge', description: 'Display a star on your profile', price: 750, category: 'badge', emoji: '⭐', duration_hours: null },
        { id: 'badge_crown', name: 'Crown Badge', description: 'Display a crown on your profile', price: 1000, category: 'badge', emoji: '👑', duration_hours: null },
        { id: 'badge_fire', name: 'Fire Badge', description: 'Display a fire badge on your profile', price: 500, category: 'badge', emoji: '🔥', duration_hours: null }
      ];

      for (const item of defaultItems) {
        await this.dbAsync.run(`
          INSERT OR IGNORE INTO shop_items (id, name, description, price, category, emoji, duration_hours, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [item.id, item.name, item.description, item.price, item.category, item.emoji, item.duration_hours]);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing economy system:', error);
      throw error;
    }
  }

  // Get user balance
  async getBalance(userId) {
    const row = await this.dbAsync.get(`SELECT balance, bank FROM economy WHERE user_id = ?`, [userId]);
    return row || { balance: 0, bank: 0 };
  }

  // Add currency
  async addMoney(userId, amount, description = 'Money added') {
    if (amount <= 0) return false;

    const current = await this.getBalance(userId);
    const newBalance = current.balance + amount;

    await this.dbAsync.run(`
      INSERT INTO economy (user_id, balance, total_earned)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = balance + ?,
        total_earned = total_earned + ?,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, newBalance, amount, amount, amount]);

    // Log transaction
    await this.logTransaction(userId, 'earn', amount, newBalance, description);

    // Track money earned for achievements
    await this.dbAsync.run(`
      INSERT INTO achievement_stats (user_id, money_earned) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET money_earned = money_earned + ?
    `, [userId, amount, amount]);

    return newBalance;
  }

  // Remove currency
  async removeMoney(userId, amount, description = 'Money spent') {
    if (amount <= 0) return false;

    const current = await this.getBalance(userId);
    if (current.balance < amount) return false; // Insufficient funds

    const newBalance = current.balance - amount;

    await this.dbAsync.run(`
      UPDATE economy 
      SET balance = ?,
          total_spent = total_spent + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [newBalance, amount, userId]);

    // Log transaction
    await this.logTransaction(userId, 'spend', -amount, newBalance, description);

    return newBalance;
  }

  // Log transaction
  async logTransaction(userId, type, amount, balanceAfter, description) {
    await this.dbAsync.run(`
      INSERT INTO transactions (user_id, type, amount, balance_after, description)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, type, amount, balanceAfter, description]);
  }

  // Deposit cash to bank
  async deposit(userId, amount) {
    if (amount <= 0) return { success: false, error: 'Amount must be positive' };
    
    const current = await this.getBalance(userId);
    if (current.balance < amount) {
      return { success: false, error: 'Insufficient cash', available: current.balance };
    }
    
    const newCash = current.balance - amount;
    const newBank = current.bank + amount;
    
    await this.dbAsync.run(`
      UPDATE economy 
      SET balance = ?, bank = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [newCash, newBank, userId]);
    
    await this.logTransaction(userId, 'deposit', amount, newCash, 'Deposited to bank');
    
    return { success: true, cash: newCash, bank: newBank };
  }

  // Withdraw from bank to cash
  async withdraw(userId, amount) {
    if (amount <= 0) return { success: false, error: 'Amount must be positive' };
    
    const current = await this.getBalance(userId);
    if (current.bank < amount) {
      return { success: false, error: 'Insufficient bank balance', available: current.bank };
    }
    
    const newCash = current.balance + amount;
    const newBank = current.bank - amount;
    
    await this.dbAsync.run(`
      UPDATE economy 
      SET balance = ?, bank = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [newCash, newBank, userId]);
    
    await this.logTransaction(userId, 'withdraw', amount, newCash, 'Withdrawn from bank');
    
    return { success: true, cash: newCash, bank: newBank };
  }

  // Daily claim
  async claimDaily(userId) {
    const row = await this.dbAsync.get(`SELECT last_daily, daily_streak FROM economy WHERE user_id = ?`, [userId]);
    
    const now = new Date();
    const lastDaily = row?.last_daily ? new Date(row.last_daily) : null;
    
    // Check if already claimed today
    if (lastDaily) {
      const hoursSince = (now - lastDaily) / (1000 * 60 * 60);
      if (hoursSince < 20) { // 20-hour cooldown (allows some flexibility)
        const nextClaim = new Date(lastDaily.getTime() + 20 * 60 * 60 * 1000);
        return { success: false, nextClaim, streak: row.daily_streak || 0 };
      }
    }

    // Calculate streak
    let streak = row?.daily_streak || 0;
    if (lastDaily) {
      const daysSince = (now - lastDaily) / (1000 * 60 * 60 * 24);
      if (daysSince <= 1.5) { // Within 36 hours = streak continues
        streak++;
      } else {
        streak = 1; // Reset streak
      }
    } else {
      streak = 1;
    }

    // Calculate reward (base 100 + 10 per streak day, max 300)
    const baseReward = 100;
    const streakBonus = Math.min(streak * 10, 200);
    const totalReward = baseReward + streakBonus;

    // Update economy
    await this.dbAsync.run(`
      INSERT INTO economy (user_id, balance, total_earned, last_daily, daily_streak)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = balance + ?,
        total_earned = total_earned + ?,
        last_daily = ?,
        daily_streak = ?,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, totalReward, totalReward, now.toISOString(), streak, totalReward, totalReward, now.toISOString(), streak]);

    await this.logTransaction(userId, 'daily', totalReward, (await this.getBalance(userId)).balance, `Daily claim (${streak} day streak)`);

    return { success: true, amount: totalReward, streak };
  }

  // Work command
  async work(userId) {
    const row = await this.dbAsync.get(`SELECT last_work FROM economy WHERE user_id = ?`, [userId]);
    
    const now = new Date();
    const lastWork = row?.last_work ? new Date(row.last_work) : null;
    
    // Check cooldown (1 hour)
    if (lastWork) {
      const hoursSince = (now - lastWork) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        const nextWork = new Date(lastWork.getTime() + 60 * 60 * 1000);
        return { success: false, nextWork };
      }
    }

    // Random work scenarios — sourced from config.branding.workScenarios
    const workScenarios = (config.branding && Array.isArray(config.branding.workScenarios) && config.branding.workScenarios.length > 0)
      ? config.branding.workScenarios
      : DEFAULT_WORK_SCENARIOS;

    const scenario = workScenarios[Math.floor(Math.random() * workScenarios.length)];
    const earnings = Math.floor(Math.random() * (scenario.max - scenario.min + 1)) + scenario.min;

    // Update economy
    await this.dbAsync.run(`
      INSERT INTO economy (user_id, balance, total_earned, last_work)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = balance + ?,
        total_earned = total_earned + ?,
        last_work = ?,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, earnings, earnings, now.toISOString(), earnings, earnings, now.toISOString()]);

    await this.logTransaction(userId, 'work', earnings, (await this.getBalance(userId)).balance, scenario.job);

    return { success: true, amount: earnings, job: scenario.job };
  }

  // Get shop items
  async getShopItems(category = null) {
    if (category) {
      return await this.dbAsync.all(`SELECT * FROM shop_items WHERE category = ? AND active = 1 ORDER BY price`, [category]);
    }
    return await this.dbAsync.all(`SELECT * FROM shop_items WHERE active = 1 ORDER BY category, price`);
  }

  // Purchase item
  async purchaseItem(userId, itemId) {
    const item = await this.dbAsync.get(`SELECT * FROM shop_items WHERE id = ? AND active = 1`, [itemId]);
    if (!item) return { success: false, error: 'Item not found' };

    const balance = await this.getBalance(userId);
    if (balance.balance < item.price) {
      return { success: false, error: 'Insufficient funds' };
    }

    // Check if already owned (for non-consumable items)
    if (item.category !== 'boost') {
      const existing = await this.dbAsync.get(`SELECT * FROM inventory WHERE user_id = ? AND item_id = ? AND active = 1`, [userId, itemId]);
      if (existing) {
        return { success: false, error: 'You already own this item' };
      }
    }

    // Deduct money
    await this.removeMoney(userId, item.price, `Purchased ${item.name}`);

    // Add to inventory
    const expiresAt = item.duration_hours ? new Date(Date.now() + item.duration_hours * 60 * 60 * 1000).toISOString() : null;
    
    await this.dbAsync.run(`
      INSERT INTO inventory (user_id, item_id, expires_at, active)
      VALUES (?, ?, ?, 1)
    `, [userId, itemId, expiresAt]);

    return { success: true, item };
  }

  // Get user inventory
  async getInventory(userId) {
    return await this.dbAsync.all(`
      SELECT i.*, s.name, s.emoji, s.category, s.description
      FROM inventory i
      JOIN shop_items s ON i.item_id = s.id
      WHERE i.user_id = ? AND i.active = 1
      ORDER BY i.purchased_at DESC
    `, [userId]);
  }

  // Check if user has active boost
  async hasActiveBoost(userId, boostType = 'xp_boost') {
    const now = new Date().toISOString();
    const boost = await this.dbAsync.get(`
      SELECT * FROM inventory i
      JOIN shop_items s ON i.item_id = s.id
      WHERE i.user_id = ? 
        AND i.active = 1 
        AND s.id LIKE ?
        AND (i.expires_at IS NULL OR i.expires_at > ?)
    `, [userId, `${boostType}%`, now]);
    
    return !!boost;
  }

  // Get leaderboard
  async getLeaderboard(limit = 10) {
    return await this.dbAsync.all(`
      SELECT e.user_id, u.username, e.balance, e.total_earned, e.daily_streak
      FROM economy e
      LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.balance DESC
      LIMIT ?
    `, [limit]);
  }
}

module.exports = EconomySystem;
