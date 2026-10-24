/**
 * Food Delivery Carbon Footprint Tracker - Express Server
 * Serves REST API endpoints and static frontend files.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./database/db');
const apiRoutes = require('./routes/api');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for API requests
app.use(cors());

// Parse incoming JSON payloads with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiting to all /api/ endpoints
app.use('/api/', apiLimiter);

// Mount API routes
app.use('/api', apiRoutes);

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname)));

// Fallback: serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 handler for API routes
app.use(notFoundHandler);

// Global centralized error handler
app.use(globalErrorHandler);

// Start server after initializing SQLite database
async function startServer() {
  try {
    await db.initDatabase();

    const server = app.listen(PORT, () => {
      console.log('====================================================');
      console.log(' 🌱 Food Delivery Carbon Footprint Tracker Server');
      console.log(` 🚀 Listening at: http://localhost:${PORT}`);
      console.log(` 🩺 Health Check: http://localhost:${PORT}/api/health`);
      console.log(` 📊 Emission Factors: http://localhost:${PORT}/api/emission-factors`);
      console.log('====================================================');
    });

    // Handle graceful shutdown
    const handleShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await db.close();
          console.log('Clean shutdown complete.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    return server;
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
