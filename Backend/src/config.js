const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const int = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProd) throw new Error('JWT_SECRET must be set to a random string of 32+ characters in production.');
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET missing/short - using a temporary one. Logins will reset on restart.');
}

const managerPasscode = env.MANAGER_PASSCODE || 'manager123';
const riderPasscode = env.RIDER_PASSCODE || 'rider123';
if (isProd && (managerPasscode === 'manager123' || riderPasscode === 'rider123')) {
  throw new Error('Change MANAGER_PASSCODE and RIDER_PASSCODE from their defaults in production.');
}

module.exports = {
  isProd,
  port: int(env.PORT, 3000),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === 'true' ? 1 : false,
  db: {
    host: env.DB_HOST || 'localhost',
    port: int(env.DB_PORT, 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'food_delivery_system',
    poolSize: int(env.DB_POOL_SIZE, 10),
  },
  jwt: { secret: jwtSecret, expiresIn: env.JWT_EXPIRES_IN || '12h' },
  staff: { managerPasscode, riderPasscode },
  rules: {
    maxQtyPerItem: int(env.MAX_QTY_PER_ITEM, 20),
    paymentMethods: ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash on Delivery'],
    minEtaMinutes: 5,
    maxEtaMinutes: 120,
  },
  rateLimit: {
    perMinute: int(env.RATE_LIMIT_PER_MIN, 300),
    authPer15Min: int(env.AUTH_RATE_LIMIT_PER_15MIN, 40),
  },
};
