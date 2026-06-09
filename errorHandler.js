// errorHandler.js
// Enhanced error handling system for Dimandem Bot

const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class BotError extends Error {
  constructor(message, code, type = 'GENERIC') {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.type = type;
    this.timestamp = new Date().toISOString();
  }
}

class DatabaseError extends BotError {
  constructor(message, operation, query = null) {
    super(message, 'DB_ERROR', 'DATABASE');
    this.operation = operation;
    this.query = query;
  }
}

class ValidationError extends BotError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', 'VALIDATION');
    this.field = field;
    this.value = value;
  }
}

class PermissionError extends BotError {
  constructor(message, requiredPermission = null) {
    super(message, 'PERMISSION_ERROR', 'PERMISSION');
    this.requiredPermission = requiredPermission;
  }
}

class APIError extends BotError {
  constructor(message, service, statusCode = null) {
    super(message, 'API_ERROR', 'API');
    this.service = service;
    this.statusCode = statusCode;
  }
}

// Enhanced database operation wrapper with retry logic
async function dbOperation(operation, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      errorWithTimestamp(`Database operation failed (attempt ${i + 1}/${retries}):`, error);

      if (i === retries - 1) {
        throw new DatabaseError(
          `Database operation failed after ${retries} attempts: ${error.message}`,
          'OPERATION_FAILED',
          error.sql || 'Unknown query'
        );
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// Promisify database operations for better error handling
function promisifyDB(db) {
  return {
    get: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
          if (err) {
            reject(new DatabaseError(`SELECT operation failed: ${err.message}`, 'SELECT', query));
          } else {
            resolve(row);
          }
        });
      });
    },

    all: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) {
            reject(new DatabaseError(`SELECT ALL operation failed: ${err.message}`, 'SELECT_ALL', query));
          } else {
            resolve(rows);
          }
        });
      });
    },

    run: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
          if (err) {
            reject(new DatabaseError(`INSERT/UPDATE/DELETE operation failed: ${err.message}`, 'MODIFY', query));
          } else {
            resolve({ lastID: this.lastID, changes: this.changes });
          }
        });
      });
    }
  };
}

// Enhanced API call wrapper with retry and timeout
async function apiCall(apiFunction, serviceName, timeout = 10000, retries = 2) {
  const attemptCall = async () => {
    return Promise.race([
      apiFunction(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new APIError(`${serviceName} API timeout`, serviceName, 408)), timeout)
      )
    ]);
  };

  for (let i = 0; i < retries + 1; i++) {
    try {
      return await attemptCall();
    } catch (error) {
      errorWithTimestamp(`${serviceName} API call failed (attempt ${i + 1}/${retries + 1}):`, error);

      if (i === retries) {
        if (error instanceof APIError) {
          throw error;
        }
        throw new APIError(
          `${serviceName} API failed after ${retries + 1} attempts: ${error.message}`,
          serviceName,
          error.status || error.statusCode
        );
      }

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Global error handler for commands
function handleCommandError(error, message, commandName) {
  errorWithTimestamp(`Command ${commandName} failed:`, error);

  let userMessage = '⚠️ Something went wrong. Please try again later.';

  if (error instanceof ValidationError) {
    userMessage = `❌ Invalid input: ${error.message}`;
  } else if (error instanceof PermissionError) {
    userMessage = `🔒 Permission denied: ${error.message}`;
  } else if (error instanceof DatabaseError) {
    userMessage = '💾 Database error occurred. The issue has been logged.';
  } else if (error instanceof APIError) {
    userMessage = `🌐 External service (${error.service}) is currently unavailable. Please try again later.`;
  }

  return message.reply(userMessage).catch(err =>
    errorWithTimestamp('Failed to send error message to user:', err)
  );
}

// Rate limiting error
class RateLimitError extends BotError {
  constructor(message, cooldownTime) {
    super(message, 'RATE_LIMIT', 'RATE_LIMIT');
    this.cooldownTime = cooldownTime;
  }
}

module.exports = {
  BotError,
  DatabaseError,
  ValidationError,
  PermissionError,
  APIError,
  RateLimitError,
  dbOperation,
  promisifyDB,
  apiCall,
  handleCommandError
};