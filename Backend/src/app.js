const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { pool } = require('./db');
const { notFoundHandler, errorHandler, asyncHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

app.use(helmet({
  hsts: config.isProd, // HTTPS-only hints would break plain http://localhost during development
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: config.isProd ? [] : null,
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // frontend uses inline style attributes
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '20kb' }));

const limiter = (max, windowMs) => rateLimit({
  windowMs,
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } }),
});

app.get('/api/health', asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', time: new Date().toISOString() });
}));

app.use('/api', limiter(config.rateLimit.perMinute, 60 * 1000));
app.use('/api/auth/login', limiter(config.rateLimit.authPer15Min, 15 * 60 * 1000));
app.use('/api/auth/staff', limiter(config.rateLimit.authPer15Min, 15 * 60 * 1000));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/me', require('./routes/customer'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/rider', require('./routes/rider'));
app.use('/api', notFoundHandler);

// Serve the web app from the same origin, so no CORS setup is needed.
app.use(express.static(path.join(__dirname, '..', '..', 'Frontend')));

app.use(errorHandler);

module.exports = app;
