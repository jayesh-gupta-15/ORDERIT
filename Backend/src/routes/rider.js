const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound, conflict } = require('../errors');
const { z, id, parse } = require('../validate');
const { STATUS, fetchOrders, fetchOrder, lockOrder, assertStatus } = require('../services/orders');

const router = express.Router();
router.use(requireAuth('rider'));

/** The rider's own delivery for an order, locked. Other riders' orders look like missing ones. */
async function lockMyDelivery(conn, orderId, riderId) {
  const [rows] = await conn.query('SELECT * FROM deliveries WHERE order_id = ? AND rider_id = ? FOR UPDATE', [orderId, riderId]);
  if (!rows.length) throw notFound('Delivery not found');
  return rows[0];
}

router.get('/me', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT rider_id, full_name, phone_number, email, status FROM riders WHERE rider_id = ?', [req.auth.sub]);
  if (!rows.length) throw notFound('Rider not found');
  const r = rows[0];
  res.json({ rider: { riderId: r.rider_id, name: r.full_name, phone: r.phone_number, email: r.email, status: r.status } });
}));

/** Go online/offline. Not allowed mid-delivery. */
router.patch('/status', asyncHandler(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['Available', 'Offline']) }), req.body);
  await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT status FROM riders WHERE rider_id = ? FOR UPDATE', [req.auth.sub]);
    if (!rows.length) throw notFound('Rider not found');
    if (rows[0].status === 'Busy') throw conflict('Finish your current delivery before changing status');
    await conn.query('UPDATE riders SET status = ? WHERE rider_id = ?', [status, req.auth.sub]);
  });
  res.json({ status });
}));

/** The delivery in progress (customer name, phone and address included), or null. */
router.get('/deliveries/current', asyncHandler(async (req, res) => {
  const [order] = await fetchOrders(pool, 'd.rider_id = ? AND o.status = ?', [req.auth.sub, STATUS.ASSIGNED], { limit: 1 });
  res.json({ order: order || null });
}));

router.get('/deliveries/history', asyncHandler(async (req, res) => {
  const orders = await fetchOrders(pool, 'd.rider_id = ? AND o.status = ?', [req.auth.sub, STATUS.DELIVERED], {
    orderBy: 'd.delivered_at DESC',
    limit: 100,
  });
  res.json({ orders });
}));

/** Rider has collected the food from the kitchen. */
router.post('/deliveries/:orderId/pickup', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  await withTransaction(async conn => {
    const delivery = await lockMyDelivery(conn, orderId, req.auth.sub);
    assertStatus(await lockOrder(conn, orderId), STATUS.ASSIGNED);
    if (delivery.picked_up_at) throw conflict('Pickup was already recorded');
    await conn.query('UPDATE deliveries SET picked_up_at = CURRENT_TIMESTAMP WHERE order_id = ?', [orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** Rider has handed the food over: order -> Delivered, rider -> Available. */
router.post('/deliveries/:orderId/deliver', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  await withTransaction(async conn => {
    const delivery = await lockMyDelivery(conn, orderId, req.auth.sub);
    assertStatus(await lockOrder(conn, orderId), STATUS.ASSIGNED);
    if (!delivery.picked_up_at) throw conflict('Record the pickup before marking the order delivered');
    await conn.query('UPDATE deliveries SET delivered_at = CURRENT_TIMESTAMP WHERE order_id = ?', [orderId]);
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [STATUS.DELIVERED, orderId]);
    await conn.query("UPDATE riders SET status = 'Available' WHERE rider_id = ?", [req.auth.sub]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

module.exports = router;
