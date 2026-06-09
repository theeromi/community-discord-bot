// cache.js
// Caching layer for Dimandem Bot

const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class Cache {
  constructor(options = {}) {
    this.data = new Map();
    this.expiries = new Map();
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };

    // Start cleanup timer
    this.startCleanupTimer();

    logWithTimestamp('Cache system initialized');
  }

  // Set a value in cache with optional TTL
  set(key, value, ttl = null) {
    try {
      // Check if cache is full and evict if necessary
      if (this.data.size >= this.maxSize && !this.data.has(key)) {
        this.evictLRU();
      }

      const expiryTime = ttl !== null ? Date.now() + ttl : Date.now() + this.defaultTTL;

      this.data.set(key, {
        value,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      });

      this.expiries.set(key, expiryTime);
      this.stats.sets++;

      return true;
    } catch (error) {
      errorWithTimestamp('Cache set error:', error);
      return false;
    }
  }

  // Get a value from cache
  get(key) {
    try {
      // Check if key exists and is not expired
      if (!this.data.has(key) || this.isExpired(key)) {
        this.stats.misses++;
        return null;
      }

      const item = this.data.get(key);
      item.accessCount++;
      item.lastAccessed = Date.now();

      this.stats.hits++;
      return item.value;
    } catch (error) {
      errorWithTimestamp('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  // Check if a key exists and is not expired
  has(key) {
    return this.data.has(key) && !this.isExpired(key);
  }

  // Delete a key from cache
  delete(key) {
    try {
      const deleted = this.data.delete(key);
      this.expiries.delete(key);

      if (deleted) {
        this.stats.deletes++;
      }

      return deleted;
    } catch (error) {
      errorWithTimestamp('Cache delete error:', error);
      return false;
    }
  }

  // Clear all cache
  clear() {
    try {
      const size = this.data.size;
      this.data.clear();
      this.expiries.clear();

      logWithTimestamp(`Cache cleared: ${size} items removed`);
      return true;
    } catch (error) {
      errorWithTimestamp('Cache clear error:', error);
      return false;
    }
  }

  // Check if a key is expired
  isExpired(key) {
    const expiryTime = this.expiries.get(key);
    return expiryTime && Date.now() > expiryTime;
  }

  // Evict least recently used item
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.data.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Clean up expired items
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, expiryTime] of this.expiries.entries()) {
      if (now > expiryTime) {
        this.data.delete(key);
        this.expiries.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logWithTimestamp(`Cache cleanup: ${cleaned} expired items removed`);
    }

    return cleaned;
  }

  // Start automatic cleanup timer
  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  // Get cache statistics
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;

    return {
      size: this.data.size,
      maxSize: this.maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      ...this.stats
    };
  }

  // Get cache info for a specific key
  getInfo(key) {
    if (!this.data.has(key)) {
      return null;
    }

    const item = this.data.get(key);
    const expiryTime = this.expiries.get(key);
    const ttl = expiryTime - Date.now();

    return {
      key,
      size: JSON.stringify(item.value).length,
      created: new Date(item.timestamp).toISOString(),
      lastAccessed: new Date(item.lastAccessed).toISOString(),
      accessCount: item.accessCount,
      ttl: Math.max(0, ttl),
      expired: ttl <= 0
    };
  }

  // Get all cache keys
  keys() {
    return Array.from(this.data.keys()).filter(key => !this.isExpired(key));
  }

  // Cache wrapper for functions
  wrap(key, fn, ttl = null) {
    return async (...args) => {
      const cacheKey = typeof key === 'function' ? key(...args) : key;

      // Try to get from cache first
      const cached = this.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute function and cache result
      try {
        const result = await fn(...args);
        this.set(cacheKey, result, ttl);
        return result;
      } catch (error) {
        // Don't cache errors
        throw error;
      }
    };
  }
}

// Specialized cache for different types of data
class BotCache extends Cache {
  constructor() {
    super({
      maxSize: 5000,
      defaultTTL: 10 * 60 * 1000, // 10 minutes
      cleanupInterval: 2 * 60 * 1000 // 2 minutes
    });

    // Predefined cache categories with different TTLs
    this.ttls = {
      user: 15 * 60 * 1000,      // 15 minutes
      guild: 30 * 60 * 1000,     // 30 minutes
      command: 5 * 60 * 1000,    // 5 minutes
      config: 60 * 60 * 1000,    // 1 hour
      temp: 60 * 1000,           // 1 minute
      session: 3 * 60 * 1000     // 3 minutes
    };
  }

  // Cache user data
  setUser(userId, userData) {
    return this.set(`user:${userId}`, userData, this.ttls.user);
  }

  getUser(userId) {
    return this.get(`user:${userId}`);
  }

  // Cache guild data
  setGuild(guildId, guildData) {
    return this.set(`guild:${guildId}`, guildData, this.ttls.guild);
  }

  getGuild(guildId) {
    return this.get(`guild:${guildId}`);
  }

  // Cache command results
  setCommand(commandKey, result) {
    return this.set(`cmd:${commandKey}`, result, this.ttls.command);
  }

  getCommand(commandKey) {
    return this.get(`cmd:${commandKey}`);
  }

  // Cache configuration
  setConfig(configKey, configData) {
    return this.set(`config:${configKey}`, configData, this.ttls.config);
  }

  getConfig(configKey) {
    return this.get(`config:${configKey}`);
  }

  // Cache temporary data
  setTemp(key, data) {
    return this.set(`temp:${key}`, data, this.ttls.temp);
  }

  getTemp(key) {
    return this.get(`temp:${key}`);
  }

  // Cache session data
  setSession(sessionKey, sessionData) {
    return this.set(`session:${sessionKey}`, sessionData, this.ttls.session);
  }

  getSession(sessionKey) {
    return this.get(`session:${sessionKey}`);
  }

  // Invalidate all cache for a specific user
  invalidateUser(userId) {
    const keysToDelete = this.keys().filter(key => key.startsWith(`user:${userId}`));
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  // Invalidate all cache for a specific guild
  invalidateGuild(guildId) {
    const keysToDelete = this.keys().filter(key =>
      key.startsWith(`guild:${guildId}`) || key.includes(`:${guildId}:`));
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  // Get cache statistics by category
  getStatsByCategory() {
    const categories = {};
    const allKeys = this.keys();

    for (const key of allKeys) {
      const category = key.split(':')[0];
      if (!categories[category]) {
        categories[category] = { count: 0, totalSize: 0 };
      }

      categories[category].count++;
      const info = this.getInfo(key);
      if (info) {
        categories[category].totalSize += info.size;
      }
    }

    return categories;
  }

  // Warm up cache with commonly accessed data
  async warmUp(db) {
    try {
      logWithTimestamp('Starting cache warm-up...');

      // This would be implemented based on your specific needs
      // For example, loading frequently accessed user data, guild settings, etc.

      logWithTimestamp('Cache warm-up completed');
    } catch (error) {
      errorWithTimestamp('Cache warm-up failed:', error);
    }
  }
}

// Cache decorator for database operations
function cached(ttl = 5 * 60 * 1000) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const cache = new Cache({ defaultTTL: ttl });

    descriptor.value = async function(...args) {
      const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;

      const cached = cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      cache.set(cacheKey, result);
      return result;
    };

    return descriptor;
  };
}

// Multi-level cache for complex scenarios
class MultiLevelCache {
  constructor() {
    this.l1 = new Cache({ maxSize: 500, defaultTTL: 2 * 60 * 1000 }); // Fast, small
    this.l2 = new Cache({ maxSize: 2000, defaultTTL: 10 * 60 * 1000 }); // Larger, longer TTL
  }

  get(key) {
    // Try L1 first
    let value = this.l1.get(key);
    if (value !== null) {
      return value;
    }

    // Try L2
    value = this.l2.get(key);
    if (value !== null) {
      // Promote to L1
      this.l1.set(key, value);
      return value;
    }

    return null;
  }

  set(key, value, ttl = null) {
    this.l1.set(key, value, ttl);
    this.l2.set(key, value, ttl ? ttl * 2 : null); // L2 TTL is longer
  }

  delete(key) {
    this.l1.delete(key);
    this.l2.delete(key);
  }

  clear() {
    this.l1.clear();
    this.l2.clear();
  }

  getStats() {
    return {
      l1: this.l1.getStats(),
      l2: this.l2.getStats(),
      combined: {
        totalSize: this.l1.getStats().size + this.l2.getStats().size,
        totalHits: this.l1.getStats().hits + this.l2.getStats().hits,
        totalMisses: this.l1.getStats().misses + this.l2.getStats().misses
      }
    };
  }
}

module.exports = {
  Cache,
  BotCache,
  MultiLevelCache,
  cached
};