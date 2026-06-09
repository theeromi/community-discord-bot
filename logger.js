// logger.js
// Simple logger utility for Dimandem Bot

function logWithTimestamp(...args) {
  const now = new Date().toISOString();
  console.log(`[${now}]`, ...args);
}

function errorWithTimestamp(...args) {
  const now = new Date().toISOString();
  console.error(`[${now}]`, ...args);
}

module.exports = { logWithTimestamp, errorWithTimestamp };
