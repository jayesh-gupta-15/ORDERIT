const express = require('express');
const config = require('../config');
const { pool, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound, conflict, badRequest } = require('../errors');
const { z, id, parse } = require('../validate');
const { STATUS, fetchOrders, fetchOrder, lockOrder, assertStatus, assertStock } = require('../services/orders');

/**
 * Customer order lifecycle:
 *   In Progress  --checkout-->  Payment Processing  --pay-->  Payment Successful
 * (the manager and rider routes take it from there). A cart that was never paid can be cancelled,
 * which removes it, because the schema has no "Cancelled" status.
 */
const router = express.Router();
router.use(requireAuth('customer'));

const OPEN = [STATUS.PROGRESS, STATUS.PROCESSING];
const qtySchema = z.coerce.number().int().min(1).max(config.rules.maxQtyPerItem);

router.get('/', asyncHandler(async (req, res) => {
  res.json({ orders: await fetchOrders(pool, 'o.user_id = ?', [req.auth.sub]) });
}));

/** The customer's open cart/payment, or null. */
router.get('/active', asyncHandler(async (req, res) => {
  const [order] = await fetchOrders(pool, `o.user_id = ? AND o.status IN (?)`, [req.auth.sub, OPEN], { limit: 1 });
  res.json({ order: order || null });
}));

router.get('/:orderId', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const order = await fetchOrder(pool, orderId, 'AND o.user_id = ?', [req.auth.sub]);
  if (!order) throw notFound('Order not found');
  res.json({ order });
}));

/** ORDER NOW: starts an empty cart. Only one open order per customer. */
router.post('/', asyncHandler(async (req, res) => {
  const orderId = await withTransaction(async conn => {
    // Serialise concurrent "order now" taps for the same customer.
    await conn.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [req.auth.sub]);
    const [open] = await conn.query(
      'SELECT order_id FROM orders WHERE user_id = ? AND status IN (?) LIMIT 1',
      [req.auth.sub, OPEN]
    );
    if (open.length) throw conflict(`You already have an open order (#${open[0].order_id})`, { orderId: open[0].order_id });
    const [addr] = await conn.query(
      'SELECT address_id FROM user_addresses WHERE user_id = ? ORDER BY address_id LIMIT 1',
      [req.auth.sub]
    );
    const [ins] = await conn.query('INSERT INTO orders (user_id, address_id) VALUES (?, ?)', [
      req.auth.sub,
      addr.length ? addr[0].address_id : null,
    ]);
    return ins.insertId;
  });
  res.status(201).json({ order: await fetchOrder(pool, orderId) });
}));

/** Add (or increase) an item. Price and GST are snapshotted on the first add. */
router.post('/:orderId/items', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const body = parse(z.object({ foodItemId: id, quantity: qtySchema.default(1) }), req.body);

  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), STATUS.PROGRESS);
    const [food] = await conn.query('SELECT * FROM food_items WHERE food_item_id = ? FOR UPDATE', [body.foodItemId]);
    if (!food.length) throw notFound('Food item not found');
    const [line] = await conn.query(
      'SELECT quantity FROM order_items WHERE order_id = ? AND food_item_id = ?',
      [orderId, body.foodItemId]
    );
    const newQty = (line.length ? line[0].quantity : 0) + body.quantity;
    if (newQty > config.rules.maxQtyPerItem) throw badRequest(`You can order at most ${config.rules.maxQtyPerItem} of one item`);
    if (newQty > food[0].stock_quantity) {
      throw conflict(food[0].stock_quantity > 0
        ? `Only ${food[0].stock_quantity} of ${food[0].name} left`
        : `${food[0].name} is out of stock`);
    }
    if (line.length) {
      await conn.query('UPDATE order_items SET quantity = ? WHERE order_id = ? AND food_item_id = ?', [newQty, orderId, body.foodItemId]);
    } else {
      await conn.query(
        'INSERT INTO order_items (order_id, food_item_id, quantity, unit_price, gst_rate) VALUES (?, ?, ?, ?, ?)',
        [orderId, body.foodItemId, newQty, food[0].unit_price, food[0].gst_rate]
      );
    }
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** Set an exact quantity; 0 removes the line. */
router.patch('/:orderId/items/:foodItemId', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const foodItemId = parse(id, req.params.foodItemId);
  const { quantity } = parse(z.object({ quantity: z.coerce.number().int().min(0).max(config.rules.maxQtyPerItem) }), req.body);

  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), STATUS.PROGRESS);
    const [line] = await conn.query(
      'SELECT quantity FROM order_items WHERE order_id = ? AND food_item_id = ? FOR UPDATE',
      [orderId, foodItemId]
    );
    if (!line.length) throw notFound('That item is not in your cart');
    if (quantity === 0) {
      await conn.query('DELETE FROM order_items WHERE order_id = ? AND food_item_id = ?', [orderId, foodItemId]);
      return;
    }
    const [food] = await conn.query('SELECT name, stock_quantity FROM food_items WHERE food_item_id = ?', [foodItemId]);
    if (quantity > food[0].stock_quantity) throw conflict(`Only ${food[0].stock_quantity} of ${food[0].name} left`);
    await conn.query('UPDATE order_items SET quantity = ? WHERE order_id = ? AND food_item_id = ?', [quantity, orderId, foodItemId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

router.delete('/:orderId/items/:foodItemId', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const foodItemId = parse(id, req.params.foodItemId);
  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), STATUS.PROGRESS);
    await conn.query('DELETE FROM order_items WHERE order_id = ? AND food_item_id = ?', [orderId, foodItemId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** Choose the delivery address (must be one of the customer's saved addresses). */
router.patch('/:orderId/address', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const { addressId } = parse(z.object({ addressId: id }), req.body);
  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), STATUS.PROGRESS);
    const [own] = await conn.query('SELECT 1 FROM user_addresses WHERE user_id = ? AND address_id = ?', [req.auth.sub, addressId]);
    if (!own.length) throw notFound('Address not found in your saved addresses');
    await conn.query('UPDATE orders SET address_id = ? WHERE order_id = ?', [addressId, orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** "Proceed to Payment": validates the cart and moves to Payment Processing. */
router.post('/:orderId/checkout', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  await withTransaction(async conn => {
    const order = await lockOrder(conn, orderId, { userId: req.auth.sub });
    assertStatus(order, STATUS.PROGRESS);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', [orderId]);
    if (!n) throw conflict('Your cart is empty');
    if (!order.address_id) throw conflict('Please choose a delivery address first');
    await assertStock(conn, orderId);
    await conn.query("UPDATE orders SET status = ? WHERE order_id = ?", [STATUS.PROCESSING, orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** "Back" on the payment dialog: return to the editable cart. */
router.post('/:orderId/checkout/cancel', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), STATUS.PROCESSING);
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [STATUS.PROGRESS, orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/**
 * One-click simulated payment. In a single transaction: re-check and decrement stock,
 * record the payment for the exact payable amount, and mark the order Payment Successful.
 */
router.post('/:orderId/pay', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  const { paymentMethod } = parse(z.object({ paymentMethod: z.enum(config.rules.paymentMethods) }), req.body);

  await withTransaction(async conn => {
    const order = await lockOrder(conn, orderId, { userId: req.auth.sub });
    assertStatus(order, STATUS.PROCESSING);
    if (!order.address_id) throw conflict('Please choose a delivery address first');

    const lines = await assertStock(conn, orderId, true); // locks food rows in id order (no deadlocks)
    if (!lines.length) throw conflict('Your cart is empty');
    for (const l of lines) {
      await conn.query('UPDATE food_items SET stock_quantity = stock_quantity - ? WHERE food_item_id = ?', [l.quantity, l.food_item_id]);
    }

    const [[{ amount }]] = await conn.query('SELECT fn_get_order_payable_amount(?) AS amount', [orderId]);
    await conn.query(
      'INSERT INTO payments (order_id, payment_method, amount) VALUES (?, ?, ?)',
      [orderId, paymentMethod, amount]
    );
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [STATUS.PAID, orderId]);
  });
  res.json({ order: await fetchOrder(pool, orderId) });
}));

/** Cancel an unpaid order. Paid orders cannot be cancelled here. */
router.delete('/:orderId', asyncHandler(async (req, res) => {
  const orderId = parse(id, req.params.orderId);
  await withTransaction(async conn => {
    assertStatus(await lockOrder(conn, orderId, { userId: req.auth.sub }), ...OPEN);
    await conn.query('DELETE FROM orders WHERE order_id = ?', [orderId]); // order_items cascade
  });
  res.status(204).end();
}));

module.exports = router;
