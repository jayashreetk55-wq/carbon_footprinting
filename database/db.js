/**
 * Database Module - SQLite initialization, schema creation, and query helpers.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Determine database path from environment or default
const dbPath = process.env.DB_PATH || path.join(__dirname, 'carbon_tracker.sqlite');
const dbDir = path.dirname(dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;

/**
 * Initialize and connect to the SQLite database
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Failed to connect to SQLite database:', err.message);
        return reject(err);
      }

      console.log(`✅ Connected to SQLite database at ${dbPath}`);

      // Enable Write-Ahead Logging for better concurrency
      dbInstance.run('PRAGMA journal_mode = WAL;', (pragmaErr) => {
        if (pragmaErr) {
          console.warn('⚠️ Could not enable WAL mode:', pragmaErr.message);
        }

        // Initialize schema
        createTables()
          .then(() => resolve(dbInstance))
          .catch(reject);
      });
    });
  });
}

/**
 * Create tables automatically on startup
 */
function createTables() {
  return new Promise((resolve, reject) => {
    dbInstance.serialize(() => {
      // 1. Orders table
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_name TEXT NOT NULL,
          pickup_address TEXT NOT NULL,
          delivery_address TEXT NOT NULL,
          route_distance_km REAL NOT NULL,
          estimated_duration_min INTEGER NOT NULL,
          delivery_vehicle TEXT NOT NULL,
          packaging_type TEXT NOT NULL,
          container_count INTEGER NOT NULL,
          delivery_emissions REAL NOT NULL,
          packaging_emissions REAL NOT NULL,
          total_emissions REAL NOT NULL,
          created_at TEXT NOT NULL,
          emission_factor_source TEXT,
          emission_factor_version TEXT
        );
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Geocoding Cache table (to avoid redundant external requests and respect usage policies)
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS geocode_cache (
          query TEXT PRIMARY KEY,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `, (err) => {
        if (err) return reject(err);
      });

      // 3. Routing Cache table
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS route_cache (
          cache_key TEXT PRIMARY KEY,
          pickup_lat REAL NOT NULL,
          pickup_lon REAL NOT NULL,
          delivery_lat REAL NOT NULL,
          delivery_lon REAL NOT NULL,
          distance_km REAL NOT NULL,
          duration_min INTEGER NOT NULL,
          attribution TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

/**
 * Promise wrapper for db.run (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promise wrapper for db.get (single row)
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Promise wrapper for db.all (multiple rows)
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Close database connection
 */
function close() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    dbInstance.close((err) => {
      if (err) return reject(err);
      console.log('SQLite database connection closed.');
      resolve();
    });
  });
}

module.exports = {
  initDatabase,
  run,
  get,
  all,
  close,
  getDbInstance: () => dbInstance
};
