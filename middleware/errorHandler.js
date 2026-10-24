/**
 * Error Handling Middleware - Centralized error catching and response formatting
 */

/**
 * 404 Not Found Handler for unknown API routes
 */
function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  }
  next();
}

/**
 * Global Error Handler
 */
function globalErrorHandler(err, req, res, next) {
  console.error(`💥 Error [${req.method} ${req.url}]:`, err.message);

  // Distinguish client-friendly messages vs internal errors
  const statusCode = err.statusCode || (err.message.includes('not found') || err.message.includes('Please') ? 400 : 500);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected server error occurred while processing your request.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = {
  notFoundHandler,
  globalErrorHandler
};
