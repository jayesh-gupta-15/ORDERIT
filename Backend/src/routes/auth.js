const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { pool, withTransaction } = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { unauthorized, conflict, badRequest } = require('../errors');
const { z, id, phone, email, name, parse, normalizePhone } = require('../validate');

const router = express.Router();

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const publicUser = u => ({ userId: u.user_id, name: u.full_name, phone: u.phone_number, email: u.email });

/**
 * Customer login / sign-up.
 * - New email  -> account is created (name + phone required).
 * - Known email -> phone number must match the one on file (the schema has no passwords).
 */
router.post('/login', asyncHandler(async (req, res) => {
  const body = parse(z.object({ email, phone, name: name.optional() }), req.body);

  const user = await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT * FROM users WHERE email = ? FOR UPDATE', [body.email]);
    if (rows.length) {
      if (normalizePhone(rows[0].phone_number) !== body.phone) throw unauthorized('Email and phone do not match our records');
      return rows[0];
    }
    if (!body.name) throw badRequest('name: Name is required to create a new account');
    const [dup] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [body.phone]);
    if (dup.length) throw conflict('That phone number is already registered with a different email');
    const [ins] = await conn.query(
      'INSERT INTO users (full_name, phone_number, email) VALUES (?, ?, ?)',
      [body.name, body.phone, body.email]
    );
    return { user_id: ins.insertId, full_name: body.name, phone_number: body.phone, email: body.email };
  });

  const token = sign({ role: 'customer', sub: user.user_id });
  res.json({ token, role: 'customer', user: publicUser(user) });
}));

/** Rider names for the rider app's "I am" picker (no contact details exposed). */
router.get('/riders', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT rider_id, full_name FROM riders ORDER BY full_name');
  res.json({ riders: rows.map(r => ({ riderId: r.rider_id, name: r.full_name })) });
}));

/** Delivery managers for the manager app's picker. */
router.get('/managers', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query("SELECT delivery_manager_id, full_name FROM delivery_managers WHERE status = 'Active' ORDER BY full_name");
  res.json({ managers: rows.map(m => ({ managerId: m.delivery_manager_id, name: m.full_name })) });
}));

/** Staff login (manager or rider) using a shared passcode from the server environment. */
router.post('/staff', asyncHandler(async (req, res) => {
  const body = parse(z.object({
    role: z.enum(['manager', 'rider']),
    passcode: z.string().min(1).max(200),
    id: id.optional(),
  }), req.body);

  const expected = body.role === 'manager' ? config.staff.managerPasscode : config.staff.riderPasscode;
  if (!safeEqual(body.passcode, expected)) throw unauthorized('Wrong passcode');

  if (body.role === 'manager') {
    const [rows] = await pool.query(
      `SELECT delivery_manager_id, full_name FROM delivery_managers
        WHERE status = 'Active' ${body.id ? 'AND delivery_manager_id = ?' : ''}
        ORDER BY delivery_manager_id LIMIT 1`,
      body.id ? [body.id] : []
    );
    if (!rows.length) throw unauthorized('No active delivery manager found');
    const m = rows[0];
    return res.json({
      token: sign({ role: 'manager', sub: m.delivery_manager_id }),
      role: 'manager',
      user: { managerId: m.delivery_manager_id, name: m.full_name },
    });
  }

  if (!body.id) throw badRequest('id: Rider id is required');
  const [rows] = await pool.query('SELECT rider_id, full_name FROM riders WHERE rider_id = ?', [body.id]);
  if (!rows.length) throw unauthorized('Unknown rider');
  res.json({
    token: sign({ role: 'rider', sub: rows[0].rider_id }),
    role: 'rider',
    user: { riderId: rows[0].rider_id, name: rows[0].full_name },
  });
}));

router.get('/me', requireAuth(), asyncHandler(async (req, res) => {
  const { role, sub } = req.auth;
  const queries = {
    customer: ['SELECT user_id, full_name, phone_number, email FROM users WHERE user_id = ?', r => publicUser(r)],
    manager: ['SELECT delivery_manager_id, full_name FROM delivery_managers WHERE delivery_manager_id = ?',
      r => ({ managerId: r.delivery_manager_id, name: r.full_name })],
    rider: ['SELECT rider_id, full_name, phone_number, status FROM riders WHERE rider_id = ?',
      r => ({ riderId: r.rider_id, name: r.full_name, phone: r.phone_number, status: r.status })],
  };
  const [sql, shape] = queries[role];
  const [rows] = await pool.query(sql, [sub]);
  if (!rows.length) throw unauthorized('Account no longer exists');
  res.json({ role, user: shape(rows[0]) });
}));

module.exports = router;
