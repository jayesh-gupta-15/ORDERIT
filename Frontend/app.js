/* orderit Bites – front-end only demo.
   A tiny in-browser "database" (localStorage) mirrors the tables from the schema:
   User, Address, user_add_relation, rider, Category, Food Items, Order,
   food_items_order, Payment, Delievery. */
(() => {
    'use strict';
    const DB_KEY = 'orderit_db_v1';
    const SESSION_KEY = 'orderit_session_v1';
    /* ---------- helpers ---------- */
    const money = n => '₹' + Number(n).toFixed(2);
    const r2 = n => Math.round(n * 100) / 100;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
    const $ = sel => document.querySelector(sel);
    const pad = n => String(n).padStart(2, '0');
    const timeStr = d => `${pad(d.getHours())} : 
    ${pad(d.getMinutes())}:
    ${pad(d.getSeconds())}`;
    const dateTimeStr = ts => new Date(ts).toLocaleString([], { day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
    /* ---------- status constants ---------- */
    const ST = {
        PROGRESS: 'In Progress',
        PROCESSING: 'Payment_Processing',
        PAID: 'Payment Successful',
        ASSIGNED: 'Rider Assigned',
        DELIVERED: 'Delivered',
        CANCELLED: 'Cancelled'
    };
    const STEPS = [
        [ST.PROGRESS, 'Ordered'],
        [ST.PROCESSING, 'Paying'],
        [ST.PAID, 'Paid'],
        [ST.ASSIGNED, 'Rider'],
        [ST.DELIVERED, 'Delivered']
    ];
    const badgeClass = s => ({
        [ST.PROGRESS]: 'progress',
        [ST.PROCESSING]: 'processing',
        [ST.PAID]: 'paid',
        [ST.ASSIGNED]: 'assigned',
        [ST.DELIVERED]: 'delivered',
        [ST.CANCELLED]: 'cancelled'
    }[s] || '');
    /* ---------- database ---------- */
    function seed() {
        const art = ['#ffe3d6', '#fff1cf', '#dff3e6', '#e4edff', '#efe2ff', '#ffe0ea'];
        const items = [
            [1, '🍢', 'Paneer Tikka', 220, 5],
            [1, '🥟', 'Veg Samosa (2 pcs)', 60, 5],
            [1, '🥗', 'Greek Salad', 180, 5],
            [2, '🍛', 'Butter Chicken', 320, 5],
            [2, '🍚', 'Veg Biryani', 240, 5],
            [2, '🫓', 'Butter Naan', 45, 5],
            [3, '🍕', 'Margherita Pizza', 280, 5],
            [3, '🍔', 'Veg Burger', 150, 5],
            [3, '🍝', 'Pasta Alfredo', 260, 5],
            [4, '🥤', 'Mango Lassi', 110, 12],
            [4, '🍰', 'Chocolate Brownie', 130, 18],
            [4, '🍮', 'Gulab Jamun (2 pcs)', 90, 5]
        ];
        return {
            users: [], addresses: [], user_add_relation: [],
            riders: [
                {
                    rider_id: 1,
                    name: 'Ravi Kumar',
                    address_id: 1,
                    phone: '9876500001',
                    email_id: 'ravi@orderit.in'
                },
                {
                    rider_id: 2,
                    name: 'Sneha Patil',
                    address_id: 2,
                    phone: '9876500002',
                    email_id: 'sneha@orderit.in'
                },
                {
                    rider_id: 3,
                    name: 'Imran Shaikh',
                    address_id: 3,
                    phone: '9876500003',
                    email_id: 'imran@orderit.in'
                },
                {
                    rider_id: 4,
                    name: 'Anita Desai',
                    address_id: 4,
                    phone: '9876500004',
                    email_id: 'anita@orderit.in'
                }
            ],
            categories: [
                {
                    cat_id: 1,
                    name: 'Starters'
                },
                { cat_id: 2, name: 'Main Course' },
                { cat_id: 3, name: 'Fast Food' },
                { cat_id: 4, name: 'Desserts & Drinks' }
            ],
            food_items: items.map((f, i) => ({
                food_id: i + 1, category_id: f[0], emoji: f[1], name: f[2], price: f[3], gst_rate: f[4], quantity: 50, bg: art[i % art.length]
            })),
            orders: [], food_items_order: [], payments: [], deliveries: [],
            // rider home addresses use ids 1-4 so customers start from 5
            _rider_addresses: true
        };
    }
    function seedAddresses(db) {
        const homes = [
            ['12', 'Sai Heights', 'Near Andheri Station', 400058],
            ['7', 'Lotus Court', 'Opp. City Mall', 400053],
            ['31', 'Palm Residency', 'Behind Bus Depot', 400069],
            ['4B', 'Green Park', 'Next to Metro Pillar 12', 400059]
        ];
        homes.forEach((h, i) => db.addresses.push({ add_id: i + 1,
            flat_no: h[0],
            building: h[1],
            landmark: h[2],
            pincode: h[3]
        }));
        delete db._rider_addresses;
    }
    function loadDB() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw)
                return JSON.parse(raw);
        }
        catch (e) { /* fall through to seed */ }
        const fresh = seed();
        seedAddresses(fresh);
        localStorage.setItem(DB_KEY, JSON.stringify(fresh));
        return fresh;
    }
    let db = loadDB();
    const save = () => localStorage.setItem(DB_KEY, JSON.stringify(db));
    const nextId = (table, key) => db[table].reduce((m, r) => Math.max(m, r[key]), 0) + 1;
    /* ---------- session (per tab) ---------- */
    let S = {
        role: 'customer',
        userId: null,
        riderId: 1,
        tab: 'menu',
        cat: 0,
        addingAddr: false,
        modalOrderId: null
    };
    try {
        Object.assign(S, JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {});
    }
    catch (e) { /* ignore */ }
    const saveSession = () => sessionStorage.setItem(SESSION_KEY, JSON.stringify(S));
    /* ---------- queries ---------- */
    const userById = id => db.users.find(u => u.user_id === id);
    const addrById = id => db.addresses.find(a => a.add_id === id);
    const foodById = id => db.food_items.find(f => f.food_id === id);
    const orderById = id => db.orders.find(o => o.order_id === id);
    const riderById = id => db.riders.find(r => r.rider_id === id);
    const catById = id => db.categories.find(c => c.cat_id === id);
    const itemsOf = oid => db.food_items_order.filter(r => r.order_id === oid);
    const fmtAddr = a => a ? `${esc(a.flat_no)}, ${esc(a.building)} (${esc(a.landmark)}) – ${esc(a.pincode)}` : '—';
    const userAddresses = uid => db.user_add_relation.filter(r => r.user_id === uid).map(r => addrById(r.add_id)).filter(Boolean);

    const activeOrder = uid => [...db.orders].reverse().find(o => o.user_id === uid && (o.status === ST.PROGRESS || o.status === ST.PROCESSING));

    const deliveryOf = oid => db.deliveries.find(d => d.order_id === oid);
    const riderBusy = rid => db.deliveries.some(d => d.rider_id === rid && orderById(d.order_id)?.status === ST.ASSIGNED);

    const itemSummary = oid => itemsOf(oid).map(r => `<li>${r.quantity} × ${esc(foodById(r.food_id)?.name)}</li>`).join('');

    function recalcOrder(oid) {
        const o = orderById(oid);
        o.total_price = r2(itemsOf(oid).reduce((s, r) => s + r.total_amount, 0));
    }
    function recalcRow(row) {
        const f = foodById(row.food_id);
        row.price = f.price;
        row.gst = r2(f.price * row.quantity * f.gst_rate / 100);
        row.total_amount = r2(f.price * row.quantity + row.gst);
    }
    /* ---------- ui helpers ---------- */
    let toastTimer;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
    }
    const badge = s => `<span class="badge ${badgeClass(s)}">${esc(s)}</span>`;
    function stepper(status) {
        if (status === ST.CANCELLED)
            return '';
        const idx = STEPS.findIndex(s => s[0] === status);
        return `<div class="stepper">${STEPS.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''}"><i></i>${s[1]}</div>`).join('')}</div>`;
    }
    /* ---------- rendering ---------- */
    function render() {
        saveSession();
        document.querySelectorAll('#roles button').forEach(b => b.classList.toggle('active', b.dataset.role === S.role));
        const u = S.userId ? userById(S.userId) : null;
        $('#userchip').innerHTML = S.role === 'customer' && u
            ? `<span class="avatar">${esc(u.name[0].toUpperCase())}</span><span>${esc(u.name)}</span><button class="btn btn-sm btn-ghost" data-act="logout">Log out</button>`
            : '';
        const view = $('#view');
        if (S.role === 'customer')
            view.innerHTML = u ? customerView(u) : loginView();
        else if (S.role === 'manager')
            view.innerHTML = managerView();
        else
            view.innerHTML = riderView();
        renderModal();
    }
    /* ----- customer ----- */
    function loginView() {
        return `
      <div class="login-wrap card">
        <div class="hero-emoji">🍛</div>
        <h1>Hungry? Log in.</h1>
        <p class="muted">Enter your details to see the menu. If your email is already registered you'll be logged straight in.</p>
        <form data-form="login">
          <div class="field"><label for="l-name">Name</label><input id="l-name" name="name" required autocomplete="name" /></div>
          <div class="row2">
            <div class="field"><label for="l-phone">Phone</label><input id="l-phone" name="phone" required inputmode="tel" pattern="[0-9+ ]{10,15}" title="10 to 15 digits" /></div>
            <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" required autocomplete="email" /></div>
          </div>
          <button class="btn btn-primary btn-lg" type="submit">Login &amp; see menu</button>
        </form>
      </div>`;
    }
    function customerView(u) {
        const tabs = `<div class="subnav">
      <button class="${S.tab === 'menu' ? 'active' : ''}" data-act="tab" data-tab="menu">Menu</button>
      <button class="${S.tab === 'orders' ? 'active' : ''}" data-act="tab" data-tab="orders">My orders</button>
    </div>`;
        if (S.tab === 'orders')
            return tabs + myOrders(u);
        const items = db.food_items.filter(f => !S.cat || f.category_id === S.cat);
        const o = activeOrder(u.user_id);
        const locked = !o || o.status !== ST.PROGRESS;
        return `
      <div class="layout">
        <section>
          ${tabs}
          <h1>Hi ${esc(u.name.split(' ')[0])}, what are you craving?</h1>
          <div class="chips">
            <button class="chip ${!S.cat ? 'active' : ''}" data-act="cat" data-cat="0">All</button>
            ${db.categories.map(c => `<button class="chip ${S.cat === c.cat_id ? 'active' : ''}" data-act="cat" data-cat="${c.cat_id}">${esc(c.name)}</button>`).join('')}
          </div>
          <div class="menu-grid">
            ${items.map(f => `
              <article class="food">
                <div class="food-art" style="background:${f.bg}">${f.emoji}</div>
                <div class="food-body">
                  <div class="food-name">${esc(f.name)}</div>
                  <div class="food-meta">${esc(catById(f.category_id)?.name)} · GST ${f.gst_rate}%</div>
                  <div class="food-foot">
                    <span class="price">${money(f.price)}</span>
                    <button class="btn btn-sm btn-primary" data-act="add" data-food="${f.food_id}" ${o && locked ? 'disabled' : ''}>ADD TO CART</button>
                  </div>
                </div>
              </article>`).join('')}
          </div>
        </section>
        ${orderPanel(u, o)}
      </div>`;
    }
    function orderPanel(u, o) {
        if (!o) {
            return `<aside class="panel">
        <h3>Your order</h3>
        <p class="muted">Start an order, then add items from the menu to your cart.</p>
        <button class="btn btn-primary btn-lg" data-act="orderNow">ORDER NOW</button>
      </aside>`;
        }
        const rows = itemsOf(o.order_id);
        const gst = r2(rows.reduce((s, r) => s + r.gst, 0));
        const sub = r2(rows.reduce((s, r) => s + r.price * r.quantity, 0));
        const locked = o.status !== ST.PROGRESS;
        const addrs = userAddresses(u.user_id);
        if (!o.address_id && addrs.length)
            o.address_id = addrs[0].add_id;
        return `<aside class="panel">
      <div class="order-head"><h3>Order #${o.order_id}</h3>${badge(o.status)}</div>
      ${rows.length ? `<ul class="cart-list">${rows.map(r => {
        const f = foodById(r.food_id);
        return `<li class="cart-item">
          <span>${f.emoji} ${esc(f.name)}<br><span class="muted small">${money(f.price)} each</span></span>
          <span class="qty">
            <button data-act="dec" data-food="${r.food_id}" ${locked ? 'disabled' : ''} aria-label="Remove one">−</button>
            <b>${r.quantity}</b>
            <button data-act="inc" data-food="${r.food_id}" ${locked ? 'disabled' : ''} aria-label="Add one">+</button>
          </span>
        </li>`;
      }).join('')}</ul>` : `<div class="empty">Cart is empty.<br>Tap <b>ADD TO CART</b> on a dish.</div>`}
      <div class="totals">
        <div><span>Subtotal</span><span>${money(sub)}</span></div>
        <div><span>GST</span><span>${money(gst)}</span></div>
        <div class="grand"><span>Total</span><span>${money(o.total_price)}</span></div>
      </div>
      <div class="field" style="margin-top:14px">
        <label for="addr-sel">Deliver to</label>
        ${addrs.length ? `<select id="addr-sel" data-change="address" ${locked ? 'disabled' : ''}>
          ${addrs.map(a => `<option value="${a.add_id}" ${o.address_id === a.add_id ? 'selected' : ''}>${esc(a.flat_no)}, ${esc(a.building)} – ${esc(a.pincode)}</option>`).join('')}
        </select>` : `<p class="muted small">No saved address yet.</p>`}
        ${locked ? '' : `<button class="link small" data-act="toggleAddr">${S.addingAddr ? 'Cancel' : '+ Add new address'}</button>`}
      </div>
      ${S.addingAddr && !locked ? addressForm() : ''}
      ${o.status === ST.PROGRESS
        ? `<button class="btn btn-primary btn-lg" data-act="pay" ${rows.length ? '' : 'disabled'}>Proceed to Payment</button>
           <button class="btn btn-ghost" style="width:100%;margin-top:6px" data-act="cancel">Cancel order</button>`
        : `<button class="btn btn-primary btn-lg" data-act="resumePay">Resume payment</button>`}
    </aside>`;
    }
    function addressForm() {
        return `<form data-form="address" class="card" style="padding:14px;margin-bottom:12px;box-shadow:none">
      <div class="row2">
        <div class="field"><label>Flat No.</label><input name="flat_no" required /></div>
        <div class="field"><label>Pincode</label><input name="pincode" required pattern="[0-9]{6}" inputmode="numeric" title="6-digit pincode" /></div>
      </div>
      <div class="field"><label>Building / Apartment</label><input name="building" required /></div>
      <div class="field"><label>Landmark</label><input name="landmark" required /></div>
      <button class="btn btn-sm btn-green" type="submit">Save address</button>
    </form>`;
    }
    function myOrders(u) {
        const orders = db.orders.filter(o => o.user_id === u.user_id).reverse();
        if (!orders.length)
            return `<div class="card empty"><h3>No orders yet</h3><p>Your orders will show up here.</p></div>`;
        return `<div class="stack">${orders.map(o => {
      const d = deliveryOf(o.order_id);
      const rider = d && riderById(d.rider_id);
      return `<div class="card">
        <div class="order-head"><h3>Order #${o.order_id}</h3>${badge(o.status)}</div>
        <div class="info-line">${dateTimeStr(o.time_stamp)} · <b>${money(o.total_price)}</b></div>
        <ul class="order-items">${itemSummary(o.order_id) || '<li class="muted">No items</li>'}</ul>
        ${o.address_id ? `<div class="info-line">Deliver to: <b>${fmtAddr(addrById(o.address_id))}</b></div>` : ''}
        ${rider ? `<div class="info-line">Rider: <b>${esc(rider.name)}</b> · ${esc(rider.phone)} · expected by <b>${esc(d.expected_time)}</b></div>` : ''}
        ${stepper(o.status)}
      </div>`;
    }).join('')}</div>`;
    }
    /* ----- manager ----- */
    function managerView() {
        const queue = db.orders.filter(o => o.status === ST.PAID);
        const freeRiders = db.riders.filter(r => !riderBusy(r.rider_id));
        const live = db.orders.filter(o => o.status === ST.ASSIGNED).length;
        const done = db.orders.filter(o => o.status === ST.DELIVERED).length;
        return `
      <div class="page-head"><div><h1>Delivery Manager</h1><p class="muted" style="margin:0">Assign a free rider to every paid order.</p></div></div>
      <div class="stats">
        <div class="stat"><b>${queue.length}</b>Awaiting rider</div>
        <div class="stat"><b>${live}</b>Out for delivery</div>
        <div class="stat"><b>${done}</b>Delivered</div>
        <div class="stat"><b>${freeRiders.length}/${db.riders.length}</b>Riders free</div>
      </div>
      <div class="two-col">
        <section>
          <h2>Paid orders</h2>
          ${queue.length ? `<div class="stack">${queue.map(o => managerOrderCard(o, freeRiders)).join('')}</div>`
            : `<div class="card empty"><h3>All caught up</h3><p>New paid orders will appear here.</p></div>`}
        </section>
        <section>
          <h2>Riders</h2>
          <div class="card"><div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>${db.riders.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${riderBusy(r.rider_id) ? '<span class="badge busy">Busy</span>' : '<span class="badge free">Available</span>'}</td></tr>`).join('')}</tbody>
          </table></div></div>
          <h2 style="margin-top:24px">Deliveries</h2>
          <div class="card"><div class="table-wrap">${db.deliveries.length ? `<table>
            <thead><tr><th>Order</th><th>Rider</th><th>ETA</th><th>Status</th></tr></thead>
            <tbody>${[...db.deliveries].reverse().map(d => `<tr><td>#${d.order_id}</td><td>${esc(riderById(d.rider_id)?.name)}</td><td>${esc(d.expected_time)}</td><td>${badge(orderById(d.order_id)?.status)}</td></tr>`).join('')}</tbody>
          </table>` : '<p class="muted" style="margin:0">No deliveries yet.</p>'}</div></div>
        </section>
      </div>`;
    }
    function managerOrderCard(o, freeRiders) {
        const u = userById(o.user_id);
        return `<div class="card">
      <div class="order-head"><h3>Order #${o.order_id}</h3>${badge(o.status)}</div>
      <div class="info-line">Customer: <b>${esc(u?.name)}</b> · ${esc(u?.phone)}</div>
      <div class="info-line">Address: <b>${fmtAddr(addrById(o.address_id))}</b></div>
      <ul class="order-items">${itemSummary(o.order_id)}</ul>
      <div class="info-line">Total paid: <b>${money(o.total_price)}</b></div>
      ${freeRiders.length ? `<div class="assign-row">
        <div><label for="rider-${o.order_id}">Free rider</label>
          <select id="rider-${o.order_id}">${freeRiders.map(r => `<option value="${r.rider_id}">${esc(r.name)}</option>`).join('')}</select></div>
        <div><label for="eta-${o.order_id}">ETA (min)</label><input id="eta-${o.order_id}" type="number" min="5" max="120" value="30" /></div>
        <button class="btn btn-green" data-act="assign" data-order="${o.order_id}">Assign rider</button>
      </div>` : `<p class="muted small" style="margin:10px 0 0">All riders are busy. Assign once someone finishes a delivery.</p>`}
    </div>`;
    }
    /* ----- rider ----- */
    function riderView() {
        if (!riderById(S.riderId))
            S.riderId = db.riders[0].rider_id;
        const rider = riderById(S.riderId);
        const mine = db.deliveries.filter(d => d.rider_id === rider.rider_id);
        const current = mine.find(d => orderById(d.order_id)?.status === ST.ASSIGNED);
        const past = mine.filter(d => orderById(d.order_id)?.status === ST.DELIVERED).reverse();
        return `
      <div class="page-head">
        <div><h1>Rider app</h1><p class="muted" style="margin:0">Assignments from the Delivery Manager show up here.</p></div>
        <div style="min-width:220px"><label for="rider-sel">I am</label>
          <select id="rider-sel" data-change="rider">${db.riders.map(r => `<option value="${r.rider_id}" ${r.rider_id === rider.rider_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      </div>
      <div class="two-col">
        <section>
          <h2>Current delivery</h2>
          ${current ? riderCurrent(current) : `<div class="card empty"><h3>You're free</h3><p>Waiting for the next assignment…</p><span class="badge free">Available</span></div>`}
        </section>
        <section>
          <h2>Completed</h2>
          <div class="card">${past.length ? `<table><thead><tr><th>Order</th><th>Customer</th></tr></thead><tbody>
            ${past.map(d => `<tr><td>#${d.order_id}</td><td>${esc(userById(d.user_id)?.name)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="muted" style="margin:0">No completed deliveries yet.</p>'}</div>
        </section>
      </div>`;
    }
    function riderCurrent(d) {
        const o = orderById(d.order_id);
        const u = userById(d.user_id);
        return `<div class="card notify">
      <span class="notify-tag">NEW ASSIGNMENT</span>
      <div class="order-head"><h3>Order #${o.order_id}</h3><b>Deliver by ${esc(d.expected_time)}</b></div>
      <div class="info-line">Customer: <b>${esc(u?.name)}</b></div>
      <div class="info-line">Phone: <b><a href="tel:${esc(u?.phone)}">${esc(u?.phone)}</a></b></div>
      <div class="info-line">Address: <b>${fmtAddr(addrById(o.address_id))}</b></div>
      <ul class="order-items">${itemSummary(o.order_id)}</ul>
      <button class="btn btn-green btn-lg" data-act="delivered" data-order="${o.order_id}">Mark as delivered</button>
    </div>`;
    }
    /* ----- payment modal ----- */
    function renderModal() {
        const root = $('#modal');
        const o = S.modalOrderId && orderById(S.modalOrderId);
        if (!o || o.status !== ST.PROCESSING) {
            root.hidden = true;
            root.innerHTML = '';
            S.modalOrderId = null;
            return;
        }
        root.hidden = false;
        root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Payment">
      <h3>Payment gateway (simulated)</h3>
      <p class="muted small">Order #${o.order_id} · ${itemsOf(o.order_id).length} item type(s)</p>
      <div class="pay-amount">${money(o.total_price)}</div>
      <div class="field"><label for="pay-mode">Payment mode</label>
        <select id="pay-mode"><option>UPI</option><option>Credit / Debit Card</option><option>Net Banking</option><option>Wallet</option></select></div>
      <div class="modal-actions">
        <button class="btn" data-act="closePay">Back</button>
        <button class="btn btn-primary" data-act="confirmPay">Pay ${money(o.total_price)}</button>
      </div>
    </div>`;
    }
    /* ---------- actions ---------- */
    function requireUser() { return S.userId ? userById(S.userId) : null; }
    const actions = {
        role(el) { S.role = el.dataset.role; },
        logout() { S.userId = null; S.tab = 'menu'; },
        tab(el) { S.tab = el.dataset.tab; },
        cat(el) { S.cat = Number(el.dataset.cat); },
        toggleAddr() { S.addingAddr = !S.addingAddr; },
        orderNow() {
            const u = requireUser();
            if (!u || activeOrder(u.user_id))
                return;
            const addrs = userAddresses(u.user_id);
            db.orders.push({
                order_id: nextId('orders', 'order_id'), user_id: u.user_id, time_stamp: Date.now(),
                total_price: 0, status: ST.PROGRESS, address_id: addrs[0]?.add_id || null
            });
            save();
            toast('Order started – add items to your cart');
        },
        add(el) {
            const u = requireUser();
            const o = u && activeOrder(u.user_id);
            if (!o)
                return toast('Click ORDER NOW first');
            if (o.status !== ST.PROGRESS)
                return toast('Order is already in payment');
            const fid = Number(el.dataset.food);
            let row = itemsOf(o.order_id).find(r => r.food_id === fid);
            if (row)
                row.quantity += 1;
            else {
                row = { order_id: o.order_id, food_id: fid, quantity: 1, price: 0, gst: 0, total_amount: 0 };
                db.food_items_order.push(row);
            }
            recalcRow(row);
            recalcOrder(o.order_id);
            save();
            toast(`${foodById(fid).name} added to cart`);
        },
        inc(el) { changeQty(Number(el.dataset.food), 1); },
        dec(el) { changeQty(Number(el.dataset.food), -1); },
        cancel() {
            const o = activeOrder(S.userId);
            if (!o || o.status !== ST.PROGRESS)
                return;
            o.status = ST.CANCELLED;
            save();
            toast('Order cancelled');
        },
        pay() {
            const o = activeOrder(S.userId);
            if (!o || o.status !== ST.PROGRESS)
                return;
            if (!itemsOf(o.order_id).length)
                return toast('Your cart is empty');
            if (!o.address_id)
                return toast('Please add a delivery address first');
            o.status = ST.PROCESSING;
            save();
            S.modalOrderId = o.order_id;
        },
        resumePay() {
            const o = activeOrder(S.userId);
            if (o && o.status === ST.PROCESSING)
                S.modalOrderId = o.order_id;
        },
        closePay() {
            const o = S.modalOrderId && orderById(S.modalOrderId);
            if (o && o.status === ST.PROCESSING) {
                o.status = ST.PROGRESS;
                save();
            }
            S.modalOrderId = null;
        },
        confirmPay() {
            const o = orderById(S.modalOrderId);
            if (!o || o.status !== ST.PROCESSING)
                return;
            db.payments.push({
                payment_id: nextId('payments', 'payment_id'), order_id: o.order_id,
                payment_mode: $('#pay-mode').value, Time: Date.now()
            });
            o.status = ST.PAID;
            save();
            S.modalOrderId = null;
            S.tab = 'orders';
            toast('Payment successful 🎉 – sent to the Delivery Manager');
        },
        assign(el) {
            const oid = Number(el.dataset.order);
            const o = orderById(oid);
            if (!o || o.status !== ST.PAID)
                return;
            const rid = Number($(`#rider-${oid}`).value);
            const mins = Math.max(5, Math.min(120, Number($(`#eta-${oid}`).value) || 30));
            if (riderBusy(rid))
                return toast('That rider just became busy');
            db.deliveries.push({
                delivery_id: nextId('deliveries', 'delivery_id'), rider_id: rid, order_id: oid, user_id: o.user_id,
                expected_time: timeStr(new Date(Date.now() + mins * 60000))
            });
            o.status = ST.ASSIGNED;
            save();
            toast(`Assigned to ${riderById(rid).name}`);
        },
        delivered(el) {
            const o = orderById(Number(el.dataset.order));
            if (!o || o.status !== ST.ASSIGNED)
                return;
            o.status = ST.DELIVERED;
            save();
            toast('Marked as delivered. You are free again.');
        },
        reset() {
            if (!confirm('Reset all demo data (users, orders, deliveries)?'))
                return;
            localStorage.removeItem(DB_KEY);
            db = loadDB();
            S = { role: 'customer', userId: null, riderId: 1, tab: 'menu', cat: 0, addingAddr: false, modalOrderId: null };
        }
    };
    function changeQty(fid, delta) {
        const o = activeOrder(S.userId);
        if (!o || o.status !== ST.PROGRESS)
            return;
        const row = itemsOf(o.order_id).find(r => r.food_id === fid);
        if (!row)
            return;
        row.quantity += delta;
        if (row.quantity <= 0)
            db.food_items_order = db.food_items_order.filter(r => r !== row);
        else
            recalcRow(row);
        recalcOrder(o.order_id);
        save();
    }
    /* ---------- forms ---------- */
    const forms = {
        login(f) {
            const d = new FormData(f);
            const email = String(d.get('email')).trim().toLowerCase();
            let u = db.users.find(x => x.email_id.toLowerCase() === email);
            if (!u) {
                u = { user_id: nextId('users', 'user_id'), name: String(d.get('name')).trim(), phone: String(d.get('phone')).trim(), email_id: email };
                db.users.push(u);
            }
            save();
            S.userId = u.user_id;
            S.tab = 'menu';
            toast(`Welcome, ${u.name.split(' ')[0]}!`);
        },
        address(f) {
            const d = new FormData(f);
            const a = {
                add_id: nextId('addresses', 'add_id'), flat_no: String(d.get('flat_no')).trim(), building: String(d.get('building')).trim(),
                landmark: String(d.get('landmark')).trim(), pincode: String(d.get('pincode')).trim()
            };
            db.addresses.push(a);
            db.user_add_relation.push({ user_add_id: nextId('user_add_relation', 'user_add_id'), user_id: S.userId, add_id: a.add_id });
            const o = activeOrder(S.userId);
            if (o && o.status === ST.PROGRESS)
                o.address_id = a.add_id;
            save();
            S.addingAddr = false;
            toast('Address saved');
        }
    };
    /* ---------- events ---------- */
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled)
            return;
        const fn = actions[el.dataset.act];
        if (!fn)
            return;
        fn(el);
        render();
    });
    document.addEventListener('submit', e => {
        const f = e.target.closest('[data-form]');
        if (!f)
            return;
        e.preventDefault();
        forms[f.dataset.form]?.(f);
        render();
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-change]');
        if (!el)
            return;
        if (el.dataset.change === 'address') {
            const o = activeOrder(S.userId);
            if (o && o.status === ST.PROGRESS) {
                o.address_id = Number(el.value);
                save();
            }
        }
        else if (el.dataset.change === 'rider') {
            S.riderId = Number(el.value);
        }
        render();
    });
    // Other tabs changed the data (e.g. Manager assigned a rider) → refresh this tab.
    window.addEventListener('storage', e => {
        if (e.key !== DB_KEY)
            return;
        db = loadDB();
        // don't wipe a half-typed form in the middle of typing
        const typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName);
        if (!typing)
            render();
    });
    render();
})();
