// configValidator.js
// Configuration and environment validation for Dimandem Bot

const fs = require('fs');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  // Validate environment variables
  validateEnvironment() {
    logWithTimestamp('Validating environment variables...');

    const requiredEnvVars = [
      { name: 'DISCORD_TOKEN', description: 'Discord bot token' },
      { name: 'OPENAI_API_KEY', description: 'OpenAI API key for AI features' }
    ];

    const optionalEnvVars = [
      { name: 'BOT_OWNER_ID', description: 'Discord user ID of bot owner', default: null },
      { name: 'NODE_ENV', description: 'Environment (development/production)', default: 'development' },
      { name: 'LOG_LEVEL', description: 'Logging level', default: 'info' }
    ];

    // Check required environment variables
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar.name]) {
        this.errors.push(`Missing required environment variable: ${envVar.name} (${envVar.description})`);
      } else {
        // Validate token format
        if (envVar.name === 'DISCORD_TOKEN') {
          this.validateDiscordToken(process.env[envVar.name]);
        }
        if (envVar.name === 'OPENAI_API_KEY') {
          this.validateOpenAIKey(process.env[envVar.name]);
        }
      }
    }

    // Check optional environment variables
    for (const envVar of optionalEnvVars) {
      if (!process.env[envVar.name] && envVar.default !== null) {
        this.warnings.push(`Optional environment variable not set: ${envVar.name} (${envVar.description}), using default: ${envVar.default}`);
      }
    }

    // Validate BOT_OWNER_ID format if provided
    if (process.env.BOT_OWNER_ID && !/^\d{17,19}$/.test(process.env.BOT_OWNER_ID)) {
      this.warnings.push('BOT_OWNER_ID should be a Discord user ID (17-19 digits)');
    }

    logWithTimestamp(`Environment validation completed: ${this.errors.length} errors, ${this.warnings.length} warnings`);
  }

  // Validate Discord token format
  validateDiscordToken(token) {
    if (!token.startsWith('Bot ') && !token.match(/^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{38}$/)) {
      this.warnings.push('Discord token format appears invalid - ensure it\'s a proper bot token');
    }
  }

  // Validate OpenAI API key format
  validateOpenAIKey(key) {
    if (!key.startsWith('sk-')) {
      this.warnings.push('OpenAI API key format appears invalid - should start with "sk-"');
    }
  }

  // Validate config.js file
  validateConfig() {
    logWithTimestamp('Validating configuration file...');

    let config;
    try {
      config = require('./config');
    } catch (error) {
      this.errors.push(`Failed to load config.js: ${error.message}`);
      return;
    }

    const requiredConfig = [
      { key: 'prefix', type: 'string', description: 'Command prefix' },
      { key: 'generalChannelName', type: 'string', description: 'General channel name' },
      { key: 'rulesChannelName', type: 'string', description: 'Rules channel name' },
      { key: 'talkativeParrotRole', type: 'string', description: 'Voice activity role name' },
      { key: 'level1YardieRole', type: 'string', description: 'Level 1 role name' },
      { key: 'levelThresholds', type: 'array', description: 'XP thresholds for levels' },
      { key: 'dailyChallengeHour', type: 'number', description: 'Hour for daily challenge' },
      { key: 'birthdayCheckHour', type: 'number', description: 'Hour for birthday check' },
      { key: 'voiceRoleMinutes', type: 'number', description: 'Minutes in voice for role' },
      { key: 'dailyChallengeTimeout', type: 'number', description: 'Daily challenge timeout in ms' }
    ];

    // Check required configuration keys
    for (const configItem of requiredConfig) {
      if (!(configItem.key in config)) {
        this.errors.push(`Missing required config key: ${configItem.key} (${configItem.description})`);
        continue;
      }

      const value = config[configItem.key];
      const expectedType = configItem.type;

      // Type validation
      if (expectedType === 'array' && !Array.isArray(value)) {
        this.errors.push(`Config key '${configItem.key}' should be an array`);
      } else if (expectedType !== 'array' && typeof value !== expectedType) {
        this.errors.push(`Config key '${configItem.key}' should be of type ${expectedType}, got ${typeof value}`);
      }

      // Specific validations
      this.validateSpecificConfig(configItem.key, value);
    }

    logWithTimestamp(`Configuration validation completed: ${this.errors.length} errors, ${this.warnings.length} warnings`);
  }

  // Validate specific configuration values
  validateSpecificConfig(key, value) {
    switch (key) {
      case 'prefix':
        if (value.length === 0 || value.length > 3) {
          this.warnings.push('Command prefix should be 1-3 characters long');
        }
        break;

      case 'levelThresholds':
        if (!Array.isArray(value) || value.length === 0) {
          this.errors.push('levelThresholds must be a non-empty array');
        } else {
          for (let i = 0; i < value.length; i++) {
            if (typeof value[i] !== 'number' || value[i] <= 0) {
              this.errors.push(`levelThresholds[${i}] must be a positive number`);
            }
            if (i > 0 && value[i] <= value[i - 1]) {
              this.errors.push(`levelThresholds[${i}] must be greater than previous threshold`);
            }
          }
        }
        break;

      case 'dailyChallengeHour':
      case 'birthdayCheckHour':
        if (value < 0 || value > 23) {
          this.errors.push(`${key} must be between 0 and 23 (hour of day)`);
        }
        break;

      case 'voiceRoleMinutes':
        if (value <= 0 || value > 1440) { // Max 24 hours
          this.warnings.push(`${key} should be between 1 and 1440 minutes`);
        }
        break;

      case 'dailyChallengeTimeout':
        if (value < 5000 || value > 300000) { // 5 seconds to 5 minutes
          this.warnings.push(`${key} should be between 5000 and 300000 milliseconds`);
        }
        break;
    }
  }

  // Validate database file
  validateDatabase() {
    logWithTimestamp('Validating database...');

    const dbPath = process.env.DB_PATH || './dimandem.db';

    if (!fs.existsSync(dbPath)) {
      this.warnings.push('Database file does not exist - will be created on first run');
      return;
    }

    try {
      const stats = fs.statSync(dbPath);
      if (stats.size === 0) {
        this.warnings.push('Database file exists but is empty');
      }
    } catch (error) {
      this.errors.push(`Cannot access database file: ${error.message}`);
    }
  }

  // Validate questions.json file
  validateQuestions() {
    logWithTimestamp('Validating trivia questions...');

    const questionsPath = './questions.json';

    if (!fs.existsSync(questionsPath)) {
      this.warnings.push('questions.json file not found - trivia features will not work');
      return;
    }

    try {
      const questionsData = fs.readFileSync(questionsPath, 'utf8');
      const questions = JSON.parse(questionsData);

      if (!Array.isArray(questions)) {
        this.errors.push('questions.json must contain an array of questions');
        return;
      }

      if (questions.length === 0) {
        this.warnings.push('questions.json is empty - trivia features will not work');
        return;
      }

      // Validate question format
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        if (!question.question || !question.answer) {
          this.errors.push(`Question ${i + 1} is missing 'question' or 'answer' field`);
        }
        if (typeof question.question !== 'string' || typeof question.answer !== 'string') {
          this.errors.push(`Question ${i + 1} 'question' and 'answer' must be strings`);
        }
      }

      logWithTimestamp(`Found ${questions.length} trivia questions`);
    } catch (error) {
      this.errors.push(`Failed to parse questions.json: ${error.message}`);
    }
  }

  // Validate file permissions
  validatePermissions() {
    logWithTimestamp('Validating file permissions...');

    const criticalFiles = [
      { path: process.env.DB_PATH || './dimandem.db', writable: true },
      { path: './config.js', readable: true },
      { path: './questions.json', readable: true },
      { path: process.env.BACKUP_DIR || './backups', writable: true, directory: true }
    ];

    for (const file of criticalFiles) {
      try {
        if (file.directory) {
          // Check if directory exists and is writable
          if (!fs.existsSync(file.path)) {
            fs.mkdirSync(file.path, { recursive: true });
            logWithTimestamp(`Created directory: ${file.path}`);
          }
          fs.accessSync(file.path, fs.constants.W_OK);
        } else {
          if (fs.existsSync(file.path)) {
            const mode = file.writable ? fs.constants.W_OK : fs.constants.R_OK;
            fs.accessSync(file.path, mode);
          }
        }
      } catch (error) {
        this.errors.push(`Permission error for ${file.path}: ${error.message}`);
      }
    }
  }

  // Run all validations
  validateAll() {
    logWithTimestamp('Starting comprehensive validation...');

    this.errors = [];
    this.warnings = [];

    this.validateEnvironment();
    this.validateConfig();
    this.validateDatabase();
    this.validateQuestions();
    this.validatePermissions();

    // Report results
    if (this.errors.length > 0) {
      errorWithTimestamp('Validation failed with errors:');
      this.errors.forEach(error => errorWithTimestamp(`  ❌ ${error}`));
    }

    if (this.warnings.length > 0) {
      logWithTimestamp('Validation warnings:');
      this.warnings.forEach(warning => logWithTimestamp(`  ⚠️  ${warning}`));
    }

    if (this.errors.length === 0) {
      logWithTimestamp('✅ Validation completed successfully');
    }

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  // Get validation summary
  getSummary() {
    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

module.exports = { ConfigValidator };