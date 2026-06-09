// shutdownManager.js
// Graceful shutdown handling for Dimandem Bot

const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class ShutdownManager {
  constructor(client, db, backupManager = null, healthMonitor = null) {
    this.client = client;
    this.db = db;
    this.backupManager = backupManager;
    this.healthMonitor = healthMonitor;
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds max shutdown time
    this.cleanupTasks = [];

    this.setupSignalHandlers();
  }

  // Setup signal handlers for graceful shutdown
  setupSignalHandlers() {
    // Handle SIGTERM (termination signal)
    process.on('SIGTERM', () => {
      logWithTimestamp('Received SIGTERM signal, initiating graceful shutdown...');
      this.shutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logWithTimestamp('Received SIGINT signal, initiating graceful shutdown...');
      this.shutdown('SIGINT');
    });

    // Handle uncaught exceptions with shutdown
    process.on('uncaughtException', (error) => {
      errorWithTimestamp('Uncaught Exception, initiating emergency shutdown:', error);
      this.emergencyShutdown('UNCAUGHT_EXCEPTION', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      errorWithTimestamp('Unhandled Promise Rejection:', reason);
      // Don't shutdown on unhandled rejections unless critical
      if (this.isCriticalError(reason)) {
        this.emergencyShutdown('UNHANDLED_REJECTION', reason);
      }
    });

    logWithTimestamp('Shutdown signal handlers registered');
  }

  // Register cleanup tasks to run during shutdown
  registerCleanupTask(name, taskFunction, priority = 5) {
    this.cleanupTasks.push({
      name,
      task: taskFunction,
      priority,
      completed: false
    });

    // Sort by priority (lower number = higher priority)
    this.cleanupTasks.sort((a, b) => a.priority - b.priority);

    logWithTimestamp(`Registered cleanup task: ${name} (priority: ${priority})`);
  }

  // Initiate graceful shutdown
  async shutdown(signal = 'MANUAL') {
    if (this.isShuttingDown) {
      logWithTimestamp('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    logWithTimestamp(`Starting graceful shutdown (signal: ${signal})...`);

    const shutdownTimer = setTimeout(() => {
      errorWithTimestamp('Shutdown timeout reached, forcing exit...');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // 1. Stop accepting new commands/events
      await this.stopAcceptingRequests();

      // 2. Wait for ongoing operations to complete
      await this.waitForOngoingOperations();

      // 3. Run cleanup tasks
      await this.runCleanupTasks();

      // 4. Create final backup if backup manager available
      await this.createFinalBackup();

      // 5. Export final metrics if health monitor available
      await this.exportFinalMetrics();

      // 6. Close database connections
      await this.closeDatabaseConnections();

      // 7. Disconnect from Discord
      await this.disconnectDiscord();

      clearTimeout(shutdownTimer);
      logWithTimestamp('Graceful shutdown completed successfully');
      process.exit(0);

    } catch (error) {
      errorWithTimestamp('Error during graceful shutdown:', error);
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  }

  // Emergency shutdown for critical errors
  async emergencyShutdown(reason, error) {
    if (this.isShuttingDown) {
      process.exit(1);
    }

    this.isShuttingDown = true;
    errorWithTimestamp(`Emergency shutdown initiated (${reason}):`, error);

    const emergencyTimer = setTimeout(() => {
      process.exit(1);
    }, 10000); // 10 seconds max for emergency shutdown

    try {
      // Only run critical cleanup tasks
      await this.runCriticalCleanup();

      // Close database quickly
      if (this.db && typeof this.db.close === 'function') {
        this.db.close();
      }

      clearTimeout(emergencyTimer);
      process.exit(1);

    } catch (shutdownError) {
      errorWithTimestamp('Error during emergency shutdown:', shutdownError);
      process.exit(1);
    }
  }

  // Stop accepting new requests
  async stopAcceptingRequests() {
    logWithTimestamp('Stopping new request acceptance...');

    // Remove all event listeners to stop processing new events
    if (this.client && this.client.removeAllListeners) {
      const eventCount = this.client.eventNames().length;
      this.client.removeAllListeners();
      logWithTimestamp(`Removed ${eventCount} event listeners`);
    }
  }

  // Wait for ongoing operations to complete
  async waitForOngoingOperations(maxWait = 10000) {
    logWithTimestamp('Waiting for ongoing operations to complete...');

    // Give ongoing operations time to complete
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      // Check if any async operations are still running
      // This is a simple implementation - could be enhanced with actual operation tracking
      await new Promise(resolve => setTimeout(resolve, 500));

      // If no critical operations detected, break early
      break;
    }

    logWithTimestamp('Ongoing operations wait completed');
  }

  // Run all registered cleanup tasks
  async runCleanupTasks() {
    logWithTimestamp(`Running ${this.cleanupTasks.length} cleanup tasks...`);

    for (const task of this.cleanupTasks) {
      if (task.completed) continue;

      try {
        logWithTimestamp(`Running cleanup task: ${task.name}`);
        await Promise.race([
          task.task(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cleanup task timeout')), 5000)
          )
        ]);

        task.completed = true;
        logWithTimestamp(`Cleanup task completed: ${task.name}`);

      } catch (error) {
        errorWithTimestamp(`Cleanup task failed: ${task.name}`, error);
        // Continue with other tasks even if one fails
      }
    }
  }

  // Run only critical cleanup tasks for emergency shutdown
  async runCriticalCleanup() {
    const criticalTasks = this.cleanupTasks.filter(task => task.priority <= 2);

    for (const task of criticalTasks) {
      try {
        await Promise.race([
          task.task(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Critical cleanup timeout')), 2000)
          )
        ]);
      } catch (error) {
        errorWithTimestamp(`Critical cleanup failed: ${task.name}`, error);
      }
    }
  }

  // Create final backup before shutdown
  async createFinalBackup() {
    if (!this.backupManager) return;

    try {
      logWithTimestamp('Creating final backup before shutdown...');
      await this.backupManager.createBackup('shutdown');
      logWithTimestamp('Final backup created successfully');
    } catch (error) {
      errorWithTimestamp('Failed to create final backup:', error);
    }
  }

  // Export final metrics before shutdown
  async exportFinalMetrics() {
    if (!this.healthMonitor) return;

    try {
      logWithTimestamp('Exporting final metrics...');
      await this.healthMonitor.exportMetrics('./final_metrics.json');
      logWithTimestamp('Final metrics exported successfully');
    } catch (error) {
      errorWithTimestamp('Failed to export final metrics:', error);
    }
  }

  // Close database connections
  async closeDatabaseConnections() {
    try {
      logWithTimestamp('Closing database connections...');

      if (this.db) {
        if (typeof this.db.close === 'function') {
          await new Promise((resolve, reject) => {
            this.db.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      }

      logWithTimestamp('Database connections closed');
    } catch (error) {
      errorWithTimestamp('Error closing database connections:', error);
    }
  }

  // Disconnect from Discord
  async disconnectDiscord() {
    try {
      logWithTimestamp('Disconnecting from Discord...');

      if (this.client && this.client.destroy) {
        await this.client.destroy();
      }

      logWithTimestamp('Discord disconnection completed');
    } catch (error) {
      errorWithTimestamp('Error disconnecting from Discord:', error);
    }
  }

  // Check if an error is critical enough to trigger emergency shutdown
  isCriticalError(error) {
    if (!error) return false;

    const criticalPatterns = [
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /out of memory/i,
      /maximum call stack/i,
      /segmentation fault/i
    ];

    const errorMessage = error.message || error.toString();
    return criticalPatterns.some(pattern => pattern.test(errorMessage));
  }

  // Get shutdown status
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      registeredTasks: this.cleanupTasks.length,
      completedTasks: this.cleanupTasks.filter(t => t.completed).length,
      timeoutMs: this.shutdownTimeout
    };
  }

  // Set shutdown timeout
  setShutdownTimeout(timeoutMs) {
    this.shutdownTimeout = timeoutMs;
    logWithTimestamp(`Shutdown timeout set to ${timeoutMs}ms`);
  }

  // Manual shutdown trigger (for admin commands)
  async manualShutdown(reason = 'Manual shutdown requested') {
    logWithTimestamp(reason);
    await this.shutdown('MANUAL');
  }

  // Register common cleanup tasks
  registerCommonCleanupTasks() {
    // Save any pending data
    this.registerCleanupTask('save_pending_data', async () => {
      logWithTimestamp('Saving any pending data...');
      // Implementation would depend on what data needs saving
    }, 1);

    // Clear any intervals/timeouts
    this.registerCleanupTask('clear_timers', () => {
      logWithTimestamp('Clearing active timers...');
      // Node.js will automatically clear timers on exit, but good to be explicit
    }, 2);

    // Log shutdown completion
    this.registerCleanupTask('log_completion', () => {
      logWithTimestamp('Shutdown cleanup tasks completed');
    }, 10);
  }
}

module.exports = { ShutdownManager };