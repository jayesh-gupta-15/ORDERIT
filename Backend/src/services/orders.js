const { lineAmounts, toRupees } = require('../money');
const { notFound, conflict } = require('../errors');

const STATUS = {
  PROGRESS: 'In Progress',
  PROCESSING: 'Payment Processing',
  PAID: 'Payment Successful',
  ASSIGNED: 'Rider Assigned',
  DELIVERED: 'Delivered',
};

const ORDER_SELECT = `
  SELECT o.order_id, o.user_id, o.address_id, o.status, o.created_at,
         u.full_name AS customer_name, u.phone_number AS customer_phone,
         a.flat_number, a.building_name, a.landmark, a.pincode,
         p.payment_method, p.amount AS paid_amount, p.paid_at,
         d.rider_id, d.delivery_manager_id, d.assigned_at, d.expected_time, d.picked_up_at, d.delivered_at,
         r.full_name AS rider_name, r.phone_number AS rider_phone
    FROM orders o
    JOIN users u            ON u.user_id = o.user_id
    LEFT JOIN addresses a   ON a.address_id = o.address_id
    LEFT JOIN payments p    ON p.order_id = o.order_id
    LEFT JOIN deliveries d  ON d.order_id = o.order_id
    LEFT JOIN riders r      ON r.rider_id = d.rider_id`;

const ITEMS_SELECT = `
  SELECT oi.order_id, oi.food_item_id, oi.quantity, oi.unit_price, oi.gst_rate,
         f.name, f.stock_quantity, c.name AS category_name
    FROM order_items oi
    JOIN food_items f ON f.food_item_id = oi.food_item_id
    JOIN categories c ON c.category_id = f.category_id
   WHERE oi.order_id IN (?)
   ORDER BY oi.order_id, f.name`;

function serializeAddress(row) {
  if (!row.address_id) return null;
  return {
    addressId: row.address_id,
    flatNumber: row.flat_number,
    buildingName: row.building_name,
    landmark: row.landmark,
    pincode: row.pincode,
  };
}

function serializeItems(rows) {
  let subtotal = 0;
  let gst = 0;
  const items = rows.map(r => {
    const amt = lineAmounts(r.quantity, r.unit_price, r.gst_rate);
    subtotal += amt.subtotal;
    gst += amt.gst;
    return {
      foodItemId: r.food_item_id,
      name: r.name,
      categoryName: r.category_name,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      gstRate: r.gst_rate,
      stockQuantity: r.stock_quantity,
      lineSubtotal: toRupees(amt.subtotal),
      lineGst: toRupees(amt.gst),
      lineTotal: toRupees(amt.total),
    };
  });
  return { items, totals: { subtotal: toRupees(subtotal), gst: toRupees(gst), total: toRupees(subtotal + gst) } };
}

/** expected_time is a duration (HH:MM:SS) from assignment; expectedBy is the resulting clock time. */
function expectedBy(assignedAt, expectedTime) {
  if (!assignedAt || !expectedTime) return null;
  const [h, m, s] = String(expectedTime).split(':').map(Number);
  return new Date(new Date(assignedAt).getTime() + (h * 3600 + m * 60 + (s || 0)) * 1000);
}

function serializeOrder(row, itemRows) {
  const { items, totals } = serializeItems(itemRows);
  return {
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
    address: serializeAddress(row),
    customer: { userId: row.user_id, name: row.customer_name, phone: row.customer_phone },
    items,
    totals,
    payment: row.payment_method
      ? { method: row.payment_method, amount: row.paid_amount, paidAt: row.paid_at }
      : null,
    delivery: row.rider_id
      ? {
          riderId: row.rider_id,
          riderName: row.rider_name,
          riderPhone: row.rider_phone,
          assignedAt: row.assigned_at,
          expectedDuration: row.expected_time,
          expectedBy: expectedBy(row.assigned_at, row.expected_time),
          pickedUpAt: row.picked_up_at,
          deliveredAt: row.delivered_at,
        }
      : null,
  };
}

/** Fetches orders (with items) matching `where`. `db` may be the pool or a transaction connection. */
async function fetchOrders(db, where = '1=1', params = [], { orderBy = 'o.order_id DESC', limit = 100 } = {}) {
  const [rows] = await db.query(`${ORDER_SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT ?`, [...params, limit]);
  if (!rows.length) return [];
  const [itemRows] = await db.query(ITEMS_SELECT, [rows.map(r => r.order_id)]);
  const byOrder = new Map();
  for (const it of itemRows) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id).push(it);
  }
  return rows.map(r => serializeOrder(r, byOrder.get(r.order_id) || []));
}

async function fetchOrder(db, orderId, extraWhere = '', extraParams = []) {
  const [order] = await fetchOrders(db, `o.order_id = ? ${extraWhere}`, [orderId, ...extraParams], { limit: 1 });
  return order || null;
}

/** Locks one order row for the duration of the transaction. Not-owned orders look like missing ones. */
async function lockOrder(conn, orderId, { userId } = {}) {
  const [rows] = await conn.query(
    `SELECT order_id, user_id, address_id, status FROM orders
      WHERE order_id = ? ${userId ? 'AND user_id = ?' : ''} FOR UPDATE`,
    userId ? [orderId, userId] : [orderId]
  );
  if (!rows.length) throw notFound('Order not found');
  return rows[0];
}

function assertStatus(order, ...allowed) {
  if (!allowed.includes(order.status)) {
    throw conflict(`Order #${order.order_id} is "${order.status}"; this action needs "${allowed.join('" or "')}"`);
  }
}

/** Throws a 409 naming every cart line that exceeds stock. Pass lock=true inside the payment transaction. */
async function assertStock(conn, orderId, lock = false) {
  const [rows] = await conn.query(
    `SELECT f.food_item_id, f.name, f.stock_quantity, oi.quantity
       FROM order_items oi JOIN food_items f ON f.food_item_id = oi.food_item_id
      WHERE oi.order_id = ? ORDER BY f.food_item_id ${lock ? 'FOR UPDATE' : ''}`,
    [orderId]
  );
  const short = rows.filter(r => r.quantity > r.stock_quantity);
  if (short.length) {
    throw conflict(
      'Not enough stock: ' + short.map(r => `${r.name} (only ${r.stock_quantity} left)`).join(', '),
      short.map(r => ({ foodItemId: r.food_item_id, requested: r.quantity, available: r.stock_quantity }))
    );
  }
  return rows;
}

module.exports = { STATUS, fetchOrders, fetchOrder, lockOrder, assertStatus, assertStock, serializeAddress };
