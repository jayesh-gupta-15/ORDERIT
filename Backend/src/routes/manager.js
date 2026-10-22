const express = require('express');
const config = require('../config');
const { pool, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound, conflict, unauthorized } = require('../errors');
const { z, id, parse } = require('../validate');
const { STATUS, fetchOrders, fetchOrder, lockOrder, assertStatus } = require('../services/orders');

const router = express.Router();
router.use(requireAuth('manager'));

const secondsToTime = s => {
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

async function fetchRiders(db) {
  const [rows] = await db.query(
    `SELECT r.rider_id, r.full_name, r.phone_number, r.email, r.status, a.pincode,
            (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.rider_id AND d.delivered_at IS NOT NULL) AS completed,
            (SELECT d.order_id FROM deliveries d JOIN orders o ON o.order_id = d.order_id
              WHERE d.rider_id = r.rider_id AND o.status = ? LIMIT 1) AS current_order_id
       FROM riders r JOIN addresses a ON a.address_id = r.address_id
      ORDER BY r.full_name`,
    [STATUS.ASSIGNED]
  );
  return rows.map(r => ({
    riderId: r.rider_id,
    name: r.full_name,
    phone: r.phone_number,
    email: r.email,
    status: r.status,
    pincode: r.pincode,
    completedDeliveries: Number(r.completed),
    currentOrderId: r.current_order_id || null,
  }));
}

/** Suggests the available rider living closest (by pincode) to the customer, then the least-used one. */
function suggestRider(order, riders) {
  const free = riders.filter(r => r.status === 'Available');
  if (!free.length || !order.address) return free[0] ? free[0].riderId : null;
  const dist = r => Math.abs(r.pincode - order.address.pincode);
  free.sort((a, b) => dist(a) - dist(b) || a.completedDeliveries - b.completedDeliveries || a.riderId - b.riderId);
  return free[0].riderId;
}

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [[s]] = await pool.query(
    `SELECT
        SUM(status = ?) AS awaiting, SUM(status = ?) AS live, SUM(status = ?) AS delivered
       FROM orders`,
    [STATUS.PAID, STATUS.ASSIGNED, STATUS.DELIVERED]
  );
  const [[rv]] = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS payments FROM payments WHERE paid_at >= UTC_DATE()'
  );
  const [[avg]] = await pool.query(
    'SELECT AVG(TIMESTAMPDIFF(MINUTE, assigned_at, delivered_at)) AS minutes FROM deliveries WHERE delivered_at IS NOT NULL'
  );
  const riders = await fetchRiders(pool);
  res.json({
    awaitingRider: Number(s.awaiting || 0),
    outForDelivery: Number(s.live || 0),
    delivered: Number(s.delivered || 0),
    ridersFree: riders.filter(r => r.status === 'Available').length,
    ridersTotal: riders.length,
    revenueToday: rv.revenue,
    paymentsToday: Number(rv.payments),
    avgDeliveryMinutes: avg.minutes === null ? null : Math.round(Number(avg.minutes)),
  });
}));

/** Paid orders waiting for a rider (oldest first), each with a suggested rider. */
router.get('/orders', asyncHandler(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(Object.values(STATUS)).default(STATUS.PAID) }), req.query);
  const orders = await fetchOrders(pool, 'o.status = ?', [status], {
    orderBy: status === STATUS.PAID ? 'p.paid_at ASC, o.order_id ASC' : 'o.order_id DESC',
  });
  const riders = status === STATUS.PAID ? await fetchRiders(pool) : [];
  res.json({ orders: orders.map(o => ({ ...o, suggestedRiderId: status === STATUS.PAID ? suggestRider(o, riders) : null })) });
}));

router.get('/riders', asyncHandler(async (_req, res) => {
  res.json({ riders: await fetchRiders(pool) });
}));

router.get('/deliveries', asyncHandler(async (_req, res) => {
  const orders = await fetchOrders(pool, 'd.order_id IS NOT NULL', [], { orderBy: 'd.assigned_at DESC, o.order_id DESC', limit: 100 });
  res.json({ deliveries: orders });
}));

/** Assign an Available rider to a paid order. Everything is locked so a rider can't be double-booked. */
router.post('/orders/:orderId/assign', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const { riderId, etaMinutes } = parse(z.object({
    riderId: id,
    etaMinutes: z.coerce.number().int().min(config.rules.minEtaMinutes).max(config.rules.maxEtaMinutes).default(30),
  }), req.body);

  await withTransaction(async conn => {
    const order = await lockOrder(conn, orderId);
    assertStatus(order, STATUS.PAID);

    const [mgr] = await conn.query(
      "SELECT 1 FROM delivery_managers WHERE delivery_manager_id = ? AND status = 'Active'",
      [req.auth.sub]
    );
    if (!mgr.length) throw unauthorized('Your manager account is inactive');

    const [rider] = await conn.query('SELECT rider_id, full_name, status FROM riders WHERE rider_id = ? FOR UPDATE', [riderId]);
    if (!rider.length) throw notFound('Rider not found');
    if (rider[0].status !== 'Available') throw conflict(`${rider[0].full_name} is ${rider[0].status.toLowerCase()} and cannot take a delivery`);

    await conn.query(
      'INSERT INTO deliveries (order_id, rider_id, delivery_manager_id, expected_time) VALUES (?, ?, ?, ?)',
      [orderId, riderId, req.auth.sub, secondsToTime(etaMinutes * 60)]
    );
    await conn.query("UPDATE riders SET status = 'Busy' WHERE rider_id = ?", [riderId]);
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [STATUS.ASSIGNED, orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

module.exports = router;
