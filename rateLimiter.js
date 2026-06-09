// rateLimiter.js
// Advanced rate limiting system for Dimandem Bot

const { RateLimitError } = require('./errorHandler');
const { logWithTimestamp } = require('./logger');

class RateLimiter {
  constructor() {
    this.buckets = new Map(); // userId -> { commands: Map, global: { count, resetTime } }
    this.globalLimits = new Map(); // command -> { count, resetTime }
    this.suspiciousUsers = new Set();

    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Get or create user bucket
  getUserBucket(userId) {
    if (!this.buckets.has(userId)) {
      this.buckets.set(userId, {
        commands: new Map(),
        global: { count: 0, resetTime: Date.now() + 60000 }
      });
    }
    return this.buckets.get(userId);
  }

  // Check if user is rate limited for a specific command
  checkCommandLimit(userId, commandName, limit = 5, windowMs = 60000) {
    const bucket = this.getUserBucket(userId);
    const now = Date.now();

    if (!bucket.commands.has(commandName)) {
      bucket.commands.set(commandName, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const commandData = bucket.commands.get(commandName);

    // Reset if window expired
    if (now > commandData.resetTime) {
      commandData.count = 0;
      commandData.resetTime = now + windowMs;
    }

    // Check limit
    if (commandData.count >= limit) {
      const resetIn = Math.ceil((commandData.resetTime - now) / 1000);
      throw new RateLimitError(
        `Rate limit exceeded for \`${commandName}\`. Try again in ${resetIn} seconds.`,
        resetIn
      );
    }

    commandData.count++;
    return true;
  }

  // Check global rate limit per user
  checkGlobalLimit(userId, limit = 30, windowMs = 60000) {
    const bucket = this.getUserBucket(userId);
    const now = Date.now();

    // Reset if window expired
    if (now > bucket.global.resetTime) {
      bucket.global.count = 0;
      bucket.global.resetTime = now + windowMs;
    }

    // Check limit
    if (bucket.global.count >= limit) {
      const resetIn = Math.ceil((bucket.global.resetTime - now) / 1000);

      // Mark as suspicious if consistently hitting global limits
      this.suspiciousUsers.add(userId);
      logWithTimestamp(`User ${userId} marked as suspicious for excessive rate limiting`);

      throw new RateLimitError(
        `Global rate limit exceeded. You're sending commands too quickly. Try again in ${resetIn} seconds.`,
        resetIn
      );
    }

    bucket.global.count++;
    return true;
  }

  // Check server-wide rate limit for expensive commands
  checkServerLimit(guildId, commandName, limit = 10, windowMs = 300000) { // 5 minute window
    const key = `${guildId}:${commandName}`;
    const now = Date.now();

    if (!this.globalLimits.has(key)) {
      this.globalLimits.set(key, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const limitData = this.globalLimits.get(key);

    // Reset if window expired
    if (now > limitData.resetTime) {
      limitData.count = 0;
      limitData.resetTime = now + windowMs;
    }

    // Check limit
    if (limitData.count >= limit) {
      const resetIn = Math.ceil((limitData.resetTime - now) / 1000);
      throw new RateLimitError(
        `Server rate limit exceeded for \`${commandName}\`. This command is temporarily unavailable for ${Math.ceil(resetIn / 60)} minutes.`,
        resetIn
      );
    }

    limitData.count++;
    return true;
  }

  // Get remaining uses for a command
  getRemainingUses(userId, commandName, limit = 5) {
    const bucket = this.getUserBucket(userId);

    if (!bucket.commands.has(commandName)) {
      return limit;
    }

    const commandData = bucket.commands.get(commandName);
    const now = Date.now();

    // Reset if window expired
    if (now > commandData.resetTime) {
      return limit;
    }

    return Math.max(0, limit - commandData.count);
  }

  // Check if user is suspicious
  isSuspicious(userId) {
    return this.suspiciousUsers.has(userId);
  }

  // Clear suspicious status
  clearSuspicious(userId) {
    this.suspiciousUsers.delete(userId);
  }

  // Get rate limit info for a user
  getUserInfo(userId) {
    const bucket = this.getUserBucket(userId);
    const now = Date.now();

    const globalResetIn = Math.max(0, Math.ceil((bucket.global.resetTime - now) / 1000));
    const commandLimits = {};

    for (const [command, data] of bucket.commands.entries()) {
      if (now <= data.resetTime) {
        commandLimits[command] = {
          count: data.count,
          resetIn: Math.ceil((data.resetTime - now) / 1000)
        };
      }
    }

    return {
      globalCount: bucket.global.count,
      globalResetIn,
      commandLimits,
      isSuspicious: this.suspiciousUsers.has(userId)
    };
  }

  // Cleanup old entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // Clean user buckets
    for (const [userId, bucket] of this.buckets.entries()) {
      // Clean expired command limits
      for (const [command, data] of bucket.commands.entries()) {
        if (now > data.resetTime) {
          bucket.commands.delete(command);
          cleaned++;
        }
      }

      // Remove empty buckets
      if (bucket.commands.size === 0 && now > bucket.global.resetTime) {
        this.buckets.delete(userId);
        cleaned++;
      }
    }

    // Clean global limits
    for (const [key, data] of this.globalLimits.entries()) {
      if (now > data.resetTime) {
        this.globalLimits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logWithTimestamp(`Rate limiter cleaned up ${cleaned} expired entries`);
    }
  }

  // Reset limits for a user (admin function)
  resetUserLimits(userId) {
    this.buckets.delete(userId);
    this.suspiciousUsers.delete(userId);
    logWithTimestamp(`Reset rate limits for user ${userId}`);
  }

  // Get statistics
  getStats() {
    return {
      totalUsers: this.buckets.size,
      suspiciousUsers: this.suspiciousUsers.size,
      activeGlobalLimits: this.globalLimits.size,
      totalCommandLimits: Array.from(this.buckets.values())
        .reduce((sum, bucket) => sum + bucket.commands.size, 0)
    };
  }
}

// Rate limit configurations for different command types
const RATE_LIMITS = {
  // Expensive commands (OpenAI API, database-heavy)
  EXPENSIVE: { limit: 3, window: 300000 },     // 3 per 5 minutes

  // Moderation commands
  MODERATION: { limit: 10, window: 300000 },   // 10 per 5 minutes

  // Fun commands
  FUN: { limit: 10, window: 60000 },           // 10 per minute

  // Info commands
  INFO: { limit: 15, window: 60000 },          // 15 per minute

  // Admin commands
  ADMIN: { limit: 20, window: 60000 },         // 20 per minute

  // Global per user
  GLOBAL: { limit: 30, window: 60000 }         // 30 per minute
};

module.exports = { RateLimiter, RATE_LIMITS };