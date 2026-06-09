// healthMonitor.js
// Health monitoring and performance tracking for Dimandem Bot

const fs = require('fs').promises;
const path = require('path');
const { promisifyDB } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class HealthMonitor {
  constructor(client, db) {
    this.client = client;
    this.db = promisifyDB(db);
    this.metrics = {
      startTime: Date.now(),
      commandsExecuted: 0,
      commandsPerHour: [],
      errors: 0,
      warnings: 0,
      memoryUsage: [],
      responseTime: [],
      databaseQueries: 0,
      apiCalls: 0,
      messagesProcessed: 0,
      uptime: 0
    };

    this.healthStatus = {
      database: 'unknown',
      discord: 'unknown',
      memory: 'unknown',
      overall: 'unknown'
    };

    // Start monitoring intervals
    this.startMonitoring();
  }

  // Start monitoring intervals
  startMonitoring() {
    // Capture baseline metrics immediately so early health commands have data.
    this.updateMetrics();
    this.performHealthCheck().catch((error) => {
      errorWithTimestamp('Initial health check failed:', error);
    });

    // Update metrics every minute
    setInterval(() => this.updateMetrics(), 60000);

    // Perform health checks every 5 minutes
    setInterval(() => this.performHealthCheck(), 300000);

    // Clean old metrics every hour
    setInterval(() => this.cleanOldMetrics(), 3600000);

    logWithTimestamp('Health monitoring started');
  }

  // Update performance metrics
  updateMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.uptime = Date.now() - this.metrics.startTime;

    // Track memory usage
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });

    // Keep only last 24 hours of memory data
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.metrics.memoryUsage = this.metrics.memoryUsage.filter(m => m.timestamp > oneDayAgo);

    // Track commands per hour
    const currentHour = new Date().getHours();
    if (!this.metrics.commandsPerHour[currentHour]) {
      this.metrics.commandsPerHour[currentHour] = 0;
    }
  }

  // Perform comprehensive health check
  async performHealthCheck() {
    logWithTimestamp('Performing health check...');

    try {
      // Check database health
      await this.checkDatabaseHealth();

      // Check Discord connection health
      this.checkDiscordHealth();

      // Check memory health
      this.checkMemoryHealth();

      // Update overall health status
      this.updateOverallHealth();

      logWithTimestamp(`Health check completed - Status: ${this.healthStatus.overall}`);

    } catch (error) {
      errorWithTimestamp('Health check failed:', error);
      this.healthStatus.overall = 'critical';
    }
  }

  // Check database connectivity and performance
  async checkDatabaseHealth() {
    try {
      const start = Date.now();
      await this.db.get('SELECT 1 as test');
      const responseTime = Date.now() - start;

      if (responseTime < 100) {
        this.healthStatus.database = 'healthy';
      } else if (responseTime < 500) {
        this.healthStatus.database = 'warning';
      } else {
        this.healthStatus.database = 'critical';
      }

      this.metrics.databaseQueries++;
      this.metrics.responseTime.push({
        timestamp: Date.now(),
        duration: responseTime,
        type: 'database'
      });

    } catch (error) {
      errorWithTimestamp('Database health check failed:', error);
      this.healthStatus.database = 'critical';
      this.metrics.errors++;
    }
  }

  // Check Discord connection health
  checkDiscordHealth() {
    try {
      if (this.client.isReady()) {
        const ping = this.client.ws.ping;

        if (ping < 100) {
          this.healthStatus.discord = 'healthy';
        } else if (ping < 300) {
          this.healthStatus.discord = 'warning';
        } else {
          this.healthStatus.discord = 'critical';
        }

        this.metrics.responseTime.push({
          timestamp: Date.now(),
          duration: ping,
          type: 'discord'
        });

      } else {
        this.healthStatus.discord = 'critical';
        this.metrics.errors++;
      }
    } catch (error) {
      errorWithTimestamp('Discord health check failed:', error);
      this.healthStatus.discord = 'critical';
      this.metrics.errors++;
    }
  }

  // Check memory usage health
  checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB < 200) {
      this.healthStatus.memory = 'healthy';
    } else if (heapUsedMB < 500) {
      this.healthStatus.memory = 'warning';
    } else {
      this.healthStatus.memory = 'critical';
    }
  }

  // Update overall health status
  updateOverallHealth() {
    const statuses = [
      this.healthStatus.database,
      this.healthStatus.discord,
      this.healthStatus.memory
    ];

    if (statuses.includes('critical')) {
      this.healthStatus.overall = 'critical';
    } else if (statuses.includes('warning')) {
      this.healthStatus.overall = 'warning';
    } else {
      this.healthStatus.overall = 'healthy';
    }
  }

  // Record command execution
  recordCommand(commandName, duration, success = true) {
    this.metrics.commandsExecuted++;

    const currentHour = new Date().getHours();
    if (!this.metrics.commandsPerHour[currentHour]) {
      this.metrics.commandsPerHour[currentHour] = 0;
    }
    this.metrics.commandsPerHour[currentHour]++;

    this.metrics.responseTime.push({
      timestamp: Date.now(),
      duration,
      type: 'command',
      command: commandName,
      success
    });

    if (!success) {
      this.metrics.errors++;
    }
  }

  // Record API call
  recordAPICall(service, duration, success = true) {
    this.metrics.apiCalls++;

    this.metrics.responseTime.push({
      timestamp: Date.now(),
      duration,
      type: 'api',
      service,
      success
    });

    if (!success) {
      this.metrics.errors++;
    }
  }

  // Record message processing
  recordMessage() {
    this.metrics.messagesProcessed++;
  }

  // Clean old metrics data
  cleanOldMetrics() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Clean response time data
    this.metrics.responseTime = this.metrics.responseTime.filter(r => r.timestamp > oneDayAgo);

    logWithTimestamp('Cleaned old metrics data');
  }

  // Get current health status
  getHealthStatus() {
    return {
      ...this.healthStatus,
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime
    };
  }

  // Get performance metrics
  getMetrics() {
    const memUsage = process.memoryUsage();

    return {
      uptime: this.metrics.uptime,
      startTime: new Date(this.metrics.startTime).toISOString(),
      commandsExecuted: this.metrics.commandsExecuted,
      commandsPerHour: this.metrics.commandsPerHour,
      messagesProcessed: this.metrics.messagesProcessed,
      databaseQueries: this.metrics.databaseQueries,
      apiCalls: this.metrics.apiCalls,
      errors: this.metrics.errors,
      warnings: this.metrics.warnings,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
      },
      discord: {
        ping: this.client.ws.ping,
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size
      },
      averageResponseTime: this.getAverageResponseTime(),
      timestamp: new Date().toISOString()
    };
  }

  // Calculate average response time for different types
  getAverageResponseTime() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentTimes = this.metrics.responseTime.filter(r => r.timestamp > oneHourAgo);

    const byType = {};
    for (const time of recentTimes) {
      if (!byType[time.type]) {
        byType[time.type] = [];
      }
      byType[time.type].push(time.duration);
    }

    const averages = {};
    for (const [type, times] of Object.entries(byType)) {
      averages[type] = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    }

    return averages;
  }

  // Export metrics to file
  async exportMetrics(filePath = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = filePath || `./metrics_${timestamp}.json`;

      const exportData = {
        healthStatus: this.getHealthStatus(),
        metrics: this.getMetrics(),
        exportTime: new Date().toISOString()
      };

      await fs.writeFile(fileName, JSON.stringify(exportData, null, 2));
      logWithTimestamp(`Metrics exported to: ${fileName}`);

      return fileName;
    } catch (error) {
      errorWithTimestamp('Failed to export metrics:', error);
      throw error;
    }
  }

  // Get health summary for status command
  getHealthSummary() {
    const uptime = this.formatUptime(this.metrics.uptime);
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;

    return {
      status: this.healthStatus.overall,
      uptime,
      commandsExecuted: this.metrics.commandsExecuted,
      memoryUsage: `${memUsedMB}MB`,
      ping: `${this.client.ws.ping}ms`,
      guilds: this.client.guilds.cache.size,
      errors: this.metrics.errors
    };
  }

  // Format uptime in human-readable format
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  }

  // Check if system is under heavy load
  isUnderHeavyLoad() {
    const recentCommands = this.metrics.commandsPerHour.slice(-1)[0] || 0;
    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    return recentCommands > 1000 || // More than 1000 commands in the last hour
           memUsage > 500 ||        // More than 500MB memory usage
           this.client.ws.ping > 500; // High Discord latency
  }

  // Get system alerts
  getAlerts() {
    const alerts = [];

    if (this.healthStatus.overall === 'critical') {
      alerts.push({ level: 'critical', message: 'System health is critical' });
    }

    if (this.healthStatus.memory === 'critical') {
      const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      alerts.push({ level: 'critical', message: `High memory usage: ${memUsage}MB` });
    }

    if (this.healthStatus.discord === 'critical') {
      alerts.push({ level: 'critical', message: 'Discord connection issues detected' });
    }

    if (this.healthStatus.database === 'critical') {
      alerts.push({ level: 'critical', message: 'Database connectivity issues' });
    }

    if (this.metrics.errors > 50) { // More than 50 errors since start
      alerts.push({ level: 'warning', message: `High error count: ${this.metrics.errors}` });
    }

    return alerts;
  }
}

module.exports = { HealthMonitor };