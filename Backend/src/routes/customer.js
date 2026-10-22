const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound, conflict } = require('../errors');
const { z, id, parse } = require('../validate');
const { serializeAddress } = require('../services/orders');

const router = express.Router();
router.use(requireAuth('customer'));

const shape = r => serializeAddress({ ...r, address_id: r.address_id });

router.get('/addresses', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.* FROM addresses a JOIN user_addresses ua ON ua.address_id = a.address_id
      WHERE ua.user_id = ? ORDER BY a.address_id`,
    [req.auth.sub]
  );
  res.json({ addresses: rows.map(shape) });
}));

const addressSchema = z.object({
  flatNumber: z.string().trim().min(1).max(50),
  buildingName: z.string().trim().min(1).max(120),
  landmark: z.string().trim().min(1).max(160),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Pincode must be a valid 6-digit value'),
});

router.post('/addresses', asyncHandler(async (req, res) => {
  const a = parse(addressSchema, req.body);
  const address = await withTransaction(async conn => {
    // Re-use an identical address the user already saved instead of piling up duplicates.
    const [dup] = await conn.query(
      `SELECT a.* FROM addresses a JOIN user_addresses ua ON ua.address_id = a.address_id
        WHERE ua.user_id = ? AND a.flat_number = ? AND a.building_name = ? AND a.landmark = ? AND a.pincode = ?`,
      [req.auth.sub, a.flatNumber, a.buildingName, a.landmark, Number(a.pincode)]
    );
    if (dup.length) return dup[0];
    const [ins] = await conn.query(
      'INSERT INTO addresses (flat_number, building_name, landmark, pincode) VALUES (?, ?, ?, ?)',
      [a.flatNumber, a.buildingName, a.landmark, Number(a.pincode)]
    );
    await conn.query('INSERT INTO user_addresses (user_id, address_id) VALUES (?, ?)', [req.auth.sub, ins.insertId]);
    return { address_id: ins.insertId, flat_number: a.flatNumber, building_name: a.buildingName, landmark: a.landmark, pincode: Number(a.pincode) };
  });
  res.status(201).json({ address: shape(address) });
}));

/** Removes the address from the user's book. Past orders keep their address (ON DELETE RESTRICT). */
router.delete('/addresses/:addressId', asyncHandler(async (req, res) => {
  const addressId = parse(id, req.params.addressId);
  await withTransaction(async conn => {
    const [link] = await conn.query(
      'SELECT 1 FROM user_addresses WHERE user_id = ? AND address_id = ? FOR UPDATE',
      [req.auth.sub, addressId]
    );
    if (!link.length) throw notFound('Address not found');
    const [open] = await conn.query(
      `SELECT order_id FROM orders WHERE user_id = ? AND address_id = ?
          AND status IN ('In Progress', 'Payment Processing') LIMIT 1`,
      [req.auth.sub, addressId]
    );
    if (open.length) throw conflict('This address is used by your open order. Pick another address first.');
    await conn.query('DELETE FROM user_addresses WHERE user_id = ? AND address_id = ?', [req.auth.sub, addressId]);
  });
  res.status(204).end();
}));

module.exports = router;
