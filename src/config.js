'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

// Optionally load a local `.env` file without adding a dependency.
if (fs.existsSync(ENV_FILE) && process.env.NODE_ENV !== 'test' && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.warn(`[config] Could not load .env: ${err.message}`);
  }
}

const packageJson = require('../package.json');

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: toPositiveInt(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  autoOpen: process.env.AUTO_OPEN === '1',
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || 'orderflow.db'),
  publicDir: path.join(ROOT_DIR, 'public'),
  rootDir: ROOT_DIR,
  version: packageJson.version,
};
