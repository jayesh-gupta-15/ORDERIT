/* End-to-end test of the whole order lifecycle against the real database.
 *   npm test
 * It starts the API on a random port, creates a throwaway customer, and walks
 * customer -> manager -> rider, checking the rules along the way.
 * Safe to re-run; it only adds new rows (and uses up a little stock).
 */
const assert = require('assert');
const config = require('../src/config');
const app = require('../src/app');
const { pool } = require('../src/db');

let base;
let passed = 0;

async function call(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
    throw err;
  }
}
const expectStatus = (r, status) => assert.strictEqual(r.status, status, `expected ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);

async function main() {
  const server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  const stamp = Date.now();
  const phone = '+91' + String(stamp).slice(-10);
  const email = `tester${stamp}@example.com`;
  let cust, orderId, mgr, riderToken, riderId, addressId;

  try {
    await step('health check hits the database', async () => {
      const r = await call('GET', '/health');
      expectStatus(r, 200);
    });

    await step('menu is grouped by category', async () => {
      const r = await call('GET', '/menu');
      expectStatus(r, 200);
      assert(r.body.items.length >= 30 && r.body.categories.length >= 10);
      const f = r.body.items.find(i => i.name.startsWith('Veg Spring Rolls'));
      assert.strictEqual(f.priceInclGst, 189);
    });

    await step('protected routes reject anonymous users', async () => expectStatus(await call('GET', '/orders'), 401));

    await step('login rejects unknown emails; register needs a name, then creates the account', async () => {
      expectStatus(await call('POST', '/auth/login', { body: { email, phone } }), 401);
      expectStatus(await call('POST', '/auth/register', { body: { email, phone } }), 400);
      const r = await call('POST', '/auth/register', { body: { email, phone, name: 'Test Customer' } });
      expectStatus(r, 201);
      cust = r.body.token;
      expectStatus(await call('POST', '/auth/register', { body: { email, phone: '+919000000001', name: 'Dup' } }), 409);
    });

    await step('login checks the phone on file', async () => {
      expectStatus(await call('POST', '/auth/login', { body: { email, phone: '+919999999999' } }), 401);
      expectStatus(await call('POST', '/auth/login', { body: { email: email.toUpperCase(), phone: phone.slice(3) } }), 200);
    });

    await step('address validation + save', async () => {
      const bad = await call('POST', '/me/addresses', { token: cust, body: { flatNumber: '1', buildingName: 'B', landmark: 'L', pincode: '12' } });
      expectStatus(bad, 400);
      const r = await call('POST', '/me/addresses', { token: cust, body: { flatNumber: '9A', buildingName: 'Test Tower', landmark: 'Near Test', pincode: '400601' } });
      expectStatus(r, 201);
      addressId = r.body.address.addressId;
    });

    await step('ORDER NOW creates one cart, auto-selecting the address', async () => {
      const r = await call('POST', '/orders', { token: cust });
      expectStatus(r, 201);
      orderId = r.body.order.orderId;
      assert.strictEqual(r.body.order.status, 'In Progress');
      assert.strictEqual(r.body.order.address.addressId, addressId);
      expectStatus(await call('POST', '/orders', { token: cust }), 409);
    });

    await step('cart totals match GST rules (per-line rounding)', async () => {
      // item 1: 240 @5%, item 24: 350 @40%
      expectStatus(await call('POST', `/orders/${orderId}/items`, { token: cust, body: { foodItemId: 1, quantity: 2 } }), 200);
      const r = await call('POST', `/orders/${orderId}/items`, { token: cust, body: { foodItemId: 24 } });
      expectStatus(r, 200);
      assert.deepStrictEqual(r.body.order.totals, { subtotal: 830, gst: 164, total: 994 });
    });

    await step('cart quantity: set, stock and cap limits', async () => {
      expectStatus(await call('PATCH', `/orders/${orderId}/items/24`, { token: cust, body: { quantity: 16 } }), 409); // stock is 15
      expectStatus(await call('PATCH', `/orders/${orderId}/items/1`, { token: cust, body: { quantity: 99 } }), 400);
      const r = await call('PATCH', `/orders/${orderId}/items/1`, { token: cust, body: { quantity: 1 } });
      assert.strictEqual(r.body.order.totals.total, 252 + 490); // 240+12 and 350+140
    });

    await step('another customer cannot see or touch the order', async () => {
      const other = await call('POST', '/auth/login', { body: { email: 'aarav.sharma@example.com', phone: '+919876543210' } });
      expectStatus(other, 200);
      expectStatus(await call('GET', `/orders/${orderId}`, { token: other.body.token }), 404);
      expectStatus(await call('POST', `/orders/${orderId}/items`, { token: other.body.token, body: { foodItemId: 1 } }), 404);
    });

    await step('checkout locks the cart; back unlocks it', async () => {
      expectStatus(await call('POST', `/orders/${orderId}/checkout`, { token: cust }), 200);
      expectStatus(await call('POST', `/orders/${orderId}/items`, { token: cust, body: { foodItemId: 1 } }), 409);
      expectStatus(await call('POST', `/orders/${orderId}/checkout/cancel`, { token: cust }), 200);
      expectStatus(await call('POST', `/orders/${orderId}/checkout`, { token: cust }), 200);
    });

    let stockBefore;
    await step('payment: validates method, charges exact amount, cuts stock, only once', async () => {
      stockBefore = (await call('GET', '/menu')).body.items.find(i => i.foodItemId === 24).stockQuantity;
      expectStatus(await call('POST', `/orders/${orderId}/pay`, { token: cust, body: { paymentMethod: 'Bitcoin' } }), 400);
      const r = await call('POST', `/orders/${orderId}/pay`, { token: cust, body: { paymentMethod: 'UPI' } });
      expectStatus(r, 200);
      assert.strictEqual(r.body.order.status, 'Payment Successful');
      assert.strictEqual(r.body.order.payment.amount, 742);
      const stockAfter = (await call('GET', '/menu')).body.items.find(i => i.foodItemId === 24).stockQuantity;
      assert.strictEqual(stockAfter, stockBefore - 1);
      expectStatus(await call('POST', `/orders/${orderId}/pay`, { token: cust, body: { paymentMethod: 'UPI' } }), 409);
      expectStatus(await call('DELETE', `/orders/${orderId}`, { token: cust }), 409); // paid orders can't be cancelled
    });

    await step('manager: wrong passcode rejected, customers locked out', async () => {
      expectStatus(await call('POST', '/auth/staff', { body: { role: 'manager', passcode: 'nope' } }), 401);
      const r = await call('POST', '/auth/staff', { body: { role: 'manager', passcode: config.staff.managerPasscode } });
      expectStatus(r, 200);
      mgr = r.body.token;
      expectStatus(await call('GET', '/manager/orders', { token: cust }), 403);
    });

    let suggested;
    await step('manager sees the paid order with a suggested rider', async () => {
      const r = await call('GET', '/manager/orders', { token: mgr });
      expectStatus(r, 200);
      const o = r.body.orders.find(x => x.orderId === orderId);
      assert(o, 'order not in queue');
      assert.strictEqual(o.customer.name, 'Test Customer');
      suggested = o.suggestedRiderId;
      assert(suggested, 'expected a suggested rider');
      const dash = await call('GET', '/manager/dashboard', { token: mgr });
      assert(dash.body.awaitingRider >= 1);
    });

    await step('assignment: busy/offline riders refused; free rider accepted once', async () => {
      const riders = (await call('GET', '/manager/riders', { token: mgr })).body.riders;
      const notFree = riders.find(r => r.status !== 'Available');
      if (notFree) expectStatus(await call('POST', `/manager/orders/${orderId}/assign`, { token: mgr, body: { riderId: notFree.riderId, etaMinutes: 30 } }), 409);
      expectStatus(await call('POST', `/manager/orders/${orderId}/assign`, { token: mgr, body: { riderId: suggested, etaMinutes: 3 } }), 400); // ETA too small
      const r = await call('POST', `/manager/orders/${orderId}/assign`, { token: mgr, body: { riderId: suggested, etaMinutes: 45 } });
      expectStatus(r, 200);
      assert.strictEqual(r.body.order.status, 'Rider Assigned');
      assert.strictEqual(r.body.order.delivery.expectedDuration, '00:45:00');
      riderId = suggested;
      expectStatus(await call('POST', `/manager/orders/${orderId}/assign`, { token: mgr, body: { riderId, etaMinutes: 30 } }), 409);
      const after = (await call('GET', '/manager/riders', { token: mgr })).body.riders.find(x => x.riderId === riderId);
      assert.strictEqual(after.status, 'Busy');
    });

    await step('rider: sees customer details, must pick up before delivering', async () => {
      const r = await call('POST', '/auth/staff', { body: { role: 'rider', id: riderId, passcode: config.staff.riderPasscode } });
      expectStatus(r, 200);
      riderToken = r.body.token;
      const cur = await call('GET', '/rider/deliveries/current', { token: riderToken });
      assert.strictEqual(cur.body.order.orderId, orderId);
      assert.strictEqual(cur.body.order.customer.phone, phone);
      assert(cur.body.order.address.pincode === 400601);
      expectStatus(await call('POST', `/rider/deliveries/${orderId}/deliver`, { token: riderToken }), 409);
      expectStatus(await call('PATCH', '/rider/status', { token: riderToken, body: { status: 'Offline' } }), 409); // busy
      expectStatus(await call('POST', `/rider/deliveries/${orderId}/pickup`, { token: riderToken }), 200);
      expectStatus(await call('POST', `/rider/deliveries/${orderId}/pickup`, { token: riderToken }), 409);
    });

    await step('another rider cannot complete this delivery', async () => {
      const riders = (await call('GET', '/auth/riders')).body.riders;
      const otherId = riders.find(r => r.riderId !== riderId).riderId;
      const t = (await call('POST', '/auth/staff', { body: { role: 'rider', id: otherId, passcode: config.staff.riderPasscode } })).body.token;
      expectStatus(await call('POST', `/rider/deliveries/${orderId}/deliver`, { token: t }), 404);
    });

    await step('delivery completes: order Delivered, rider free again', async () => {
      const r = await call('POST', `/rider/deliveries/${orderId}/deliver`, { token: riderToken });
      expectStatus(r, 200);
      assert.strictEqual(r.body.order.status, 'Delivered');
      assert((await call('GET', '/rider/deliveries/history', { token: riderToken })).body.orders.some(o => o.orderId === orderId));
      assert.strictEqual((await call('GET', '/rider/me', { token: riderToken })).body.rider.status, 'Available');
      const mine = (await call('GET', `/orders/${orderId}`, { token: cust })).body.order;
      assert.strictEqual(mine.status, 'Delivered');
      assert(mine.delivery.deliveredAt);
    });

    await step('cancelling an unpaid cart removes it', async () => {
      const o = (await call('POST', '/orders', { token: cust })).body.order;
      expectStatus(await call('POST', `/orders/${o.orderId}/checkout`, { token: cust }), 409); // empty cart
      expectStatus(await call('DELETE', `/orders/${o.orderId}`, { token: cust }), 204);
      expectStatus(await call('GET', `/orders/${o.orderId}`, { token: cust }), 404);
    });

    await step('double-click safety: two simultaneous payments, one wins', async () => {
      const o = (await call('POST', '/orders', { token: cust })).body.order;
      await call('POST', `/orders/${o.orderId}/items`, { token: cust, body: { foodItemId: 29, quantity: 3 } });
      expectStatus(await call('POST', `/orders/${o.orderId}/checkout`, { token: cust }), 200);
      const stock = () => call('GET', '/menu').then(r => r.body.items.find(i => i.foodItemId === 29).stockQuantity);
      const before = await stock();
      const results = await Promise.all([1, 2, 3].map(() => call('POST', `/orders/${o.orderId}/pay`, { token: cust, body: { paymentMethod: 'Debit Card' } })));
      assert.deepStrictEqual(results.map(r => r.status).sort(), [200, 409, 409]);
      assert.strictEqual(await stock(), before - 3); // stock cut exactly once
    });

    await step('stock oversell protection: last units go to one buyer only', async () => {
      // Drain item 24 down to 1 unit, then two customers race for it.
      await pool.query('UPDATE food_items SET stock_quantity = 1 WHERE food_item_id = 24');
      const mk = async n => {
        const l = await call('POST', '/auth/register', { body: { email: `racer${stamp}${n}@example.com`, phone: '+91' + String(stamp + n).slice(-10), name: 'Racer ' + n } });
        const t = l.body.token;
        await call('POST', '/me/addresses', { token: t, body: { flatNumber: '1', buildingName: 'Race', landmark: 'Track', pincode: '400601' } });
        const o = (await call('POST', '/orders', { token: t })).body.order;
        expectStatus(await call('POST', `/orders/${o.orderId}/items`, { token: t, body: { foodItemId: 24 } }), 200);
        expectStatus(await call('POST', `/orders/${o.orderId}/checkout`, { token: t }), 200);
        return { t, id: o.orderId };
      };
      const [a, b] = [await mk(1), await mk(2)];
      const res = await Promise.all([a, b].map(x => call('POST', `/orders/${x.id}/pay`, { token: x.t, body: { paymentMethod: 'UPI' } })));
      assert.deepStrictEqual(res.map(r => r.status).sort(), [200, 409]);
      const [[row]] = await pool.query('SELECT stock_quantity FROM food_items WHERE food_item_id = 24');
      assert.strictEqual(row.stock_quantity, 0);
    });

    console.log(`\nAll ${passed} checks passed.`);
  } finally {
    // Leave the demo menu usable for the next run.
    await pool.query('UPDATE food_items SET stock_quantity = GREATEST(stock_quantity, 15) WHERE food_item_id = 24').catch(() => {});
    server.close();
    await pool.end();
  }
}

main().catch(err => {
  if (!process.exitCode) console.error(err);
  process.exitCode = 1;
});
