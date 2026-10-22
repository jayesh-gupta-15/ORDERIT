/* ORDERIT – web client.
   Talks to the Node.js/MySQL backend (see ../Backend). All data lives in the database;
   the browser only keeps a login token per role in sessionStorage (one session per tab). */
(() => {
    'use strict';
    // Same-origin by default (the backend serves this folder). Override with window.ORDERIT_API if hosted elsewhere.
    const API = window.ORDERIT_API || (location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
    const SESSION_KEY = 'orderit_session_v2';
    const POLL_MS = 5000;

    /* ---------- helpers ---------- */
    const money = n => '₹' + Number(n).toFixed(2);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
    const $ = sel => document.querySelector(sel);
    const dateTimeStr = ts => ts ? new Date(ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const clockStr = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

    /* ---------- status constants (must match the database CHECK constraint) ---------- */
    const ST = {
        PROGRESS: 'In Progress',
        PROCESSING: 'Payment Processing',
        PAID: 'Payment Successful',
        ASSIGNED: 'Rider Assigned',
        DELIVERED: 'Delivered'
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
        Available: 'free',
        Busy: 'busy',
        Offline: 'cancelled'
    }[s] || '');
    const PAY_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash on Delivery'];

    /* ---------- menu art (the database stores no images, so pick an emoji from the dish name) ---------- */
    const ART_BG = ['#ffe3d6', '#fff1cf', '#dff3e6', '#e4edff', '#efe2ff', '#ffe0ea'];
    const EMOJI = [
        [/dim sum|spring roll/i, '🥟'], [/roll/i, '🌯'], [/tikka/i, '🍢'], [/corn/i, '🌽'],
        [/dal|makhani/i, '🍲'], [/mushroom/i, '🍄'], [/dosa/i, '🥞'], [/idli/i, '🍚'],
        [/biryani|masala/i, '🍛'], [/noodle/i, '🍜'], [/manchurian/i, '🥘'], [/pasta|penne|ravioli/i, '🍝'],
        [/sandwich/i, '🥪'], [/burger/i, '🍔'], [/pizza/i, '🍕'], [/ice cream|sundae/i, '🍨'],
        [/coffee/i, '☕'], [/mojito/i, '🍹'], [/soda|lime|drink/i, '🥤'], [/naan/i, '🫓']
    ];
    const emojiFor = name => (EMOJI.find(([re]) => re.test(name)) || [0, '🍽️'])[1];

    /* ---------- state ---------- */
    // S survives reloads (per tab). D is the data fetched from the server.
    let S = { role: 'customer', authMode: 'login', tokens: {}, users: {}, riderId: null, tab: 'menu', cat: 0, addingAddr: false, payOpen: false };
    try {
        Object.assign(S, JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {});
    }
    catch (e) { /* ignore */ }
    const saveSession = () => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } };
    let D = emptyData();
    let offline = false;
    let busy = false;

    function emptyData() {
        return { menu: null, addresses: [], orders: [], active: null, dash: null, queue: [], riders: [], deliveries: [],
            riderChoices: [], current: null, history: [], me: null };
    }

    /* ---------- API ---------- */
    async function api(method, path, body, role = S.role) {
        const headers = { 'Content-Type': 'application/json' };
        if (S.tokens[role]) headers.Authorization = 'Bearer ' + S.tokens[role];
        let res;
        try {
            res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        }
        catch (e) {
            offline = true;
            throw new Error('Cannot reach the ORDERIT server. Is it running?');
        }
        offline = false;
        const data = res.status === 204 ? null : await res.json().catch(() => null);
        if (!res.ok) {
            if (res.status === 401 && S.tokens[role]) {
                delete S.tokens[role];
                delete S.users[role];
            }
            throw new Error(data?.error?.message || `Request failed (${res.status})`);
        }
        return data;
    }

    /* ---------- loading data ---------- */
    async function refresh() {
        const role = S.role;
        if (role === 'customer') {
            if (!S.tokens.customer) { D.menu = null; return; }
            const [menu, addrs, orders, active] = await Promise.all([
                api('GET', '/menu'), api('GET', '/me/addresses'), api('GET', '/orders'), api('GET', '/orders/active')
            ]);
            D.menu = menu;
            D.addresses = addrs.addresses;
            D.orders = orders.orders;
            D.active = active.order;
            if (!D.active || D.active.status !== ST.PROCESSING) S.payOpen = false;
        }
        else if (role === 'manager') {
            if (!S.tokens.manager) return;
            const [dash, queue, riders, deliveries] = await Promise.all([
                api('GET', '/manager/dashboard'), api('GET', '/manager/orders'), api('GET', '/manager/riders'), api('GET', '/manager/deliveries')
            ]);
            D.dash = dash;
            D.queue = queue.orders;
            D.riders = riders.riders;
            D.deliveries = deliveries.deliveries;
        }
        else {
            D.riderChoices = (await api('GET', '/auth/riders')).riders;
            if (!D.riderChoices.some(r => r.riderId === S.riderId)) S.riderId = D.riderChoices[0]?.riderId ?? null;
            if (S.tokens.rider && S.users.rider?.riderId !== S.riderId) { delete S.tokens.rider; delete S.users.rider; }
            if (!S.tokens.rider) return;
            const [me, current, history] = await Promise.all([
                api('GET', '/rider/me'), api('GET', '/rider/deliveries/current'), api('GET', '/rider/deliveries/history')
            ]);
            D.me = me.rider;
            D.current = current.order;
            D.history = history.orders;
        }
    }

    /* ---------- ui helpers ---------- */
    let toastTimer;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
    }
    const badge = s => `<span class="badge ${badgeClass(s)}">${esc(s)}</span>`;
    const fmtAddr = a => a ? `${esc(a.flatNumber)}, ${esc(a.buildingName)} (${esc(a.landmark)}) – ${esc(a.pincode)}` : '—';
    const itemSummary = o => o.items.map(i => `<li>${i.quantity} × ${esc(i.name)}</li>`).join('');
    function stepper(status) {
        const idx = STEPS.findIndex(s => s[0] === status);
        return `<div class="stepper">${STEPS.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''}"><i></i>${s[1]}</div>`).join('')}</div>`;
    }

    /* ---------- rendering ---------- */
    function render() {
        saveSession();
        document.querySelectorAll('#roles button').forEach(b => b.classList.toggle('active', b.dataset.role === S.role));
        const user = S.users[S.role];
        $('#userchip').innerHTML = S.tokens[S.role] && user
            ? `<span class="avatar">${esc((user.name || '?')[0].toUpperCase())}</span><span>${esc(user.name)}</span><button class="btn btn-sm btn-ghost" data-act="logout">Log out</button>`
            : '';
        const view = $('#view');
        if (offline) view.innerHTML = offlineView();
        else if (S.role === 'customer')
            view.innerHTML = S.tokens.customer && D.menu ? customerView(S.users.customer) : loginView();
        else if (S.role === 'manager')
            view.innerHTML = S.tokens.manager ? managerView() : staffLoginView('manager');
        else
            view.innerHTML = riderView();
        renderModal();
    }

    function offlineView() {
        return `<div class="card empty"><h3>Can't reach the server</h3>
      <p>Start the backend (<code>npm start</code> in the Backend folder) and open <b>http://localhost:3000</b>.</p>
      <button class="btn btn-primary" data-act="retry">Try again</button></div>`;
    }

    /* ----- login screens ----- */
    function loginView() {
        const reg = S.authMode === 'register';
        return `
      <div class="login-wrap card">
        <div class="hero-emoji">🍛</div>
        <h1>${reg ? 'Hungry? Join us.' : 'Hungry? Log in.'}</h1>
        <div class="subnav">
          <button class="${reg ? '' : 'active'}" data-act="authMode" data-mode="login">Login</button>
          <button class="${reg ? 'active' : ''}" data-act="authMode" data-mode="register">Register</button>
        </div>
        <p class="muted">${reg
            ? 'Create your account to start ordering. Your details are saved to our database.'
            : 'Welcome back! Log in with the email and phone number on your account.'}</p>
        <form data-form="${reg ? 'register' : 'login'}">
          ${reg ? '<div class="field"><label for="l-name">Name</label><input id="l-name" name="name" required autocomplete="name" /></div>' : ''}
          <div class="row2">
            <div class="field"><label for="l-phone">Phone</label><input id="l-phone" name="phone" required inputmode="tel" pattern="[0-9+ ]{10,15}" title="10 to 15 digits" /></div>
            <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" required autocomplete="email" /></div>
          </div>
          <button class="btn btn-primary btn-lg" type="submit">${reg ? 'Register &amp; see menu' : 'Login &amp; see menu'}</button>
        </form>
      </div>`;
    }

    function staffLoginView(role) {
        const rider = role === 'rider';
        return `
      <div class="login-wrap card">
        <div class="hero-emoji">${rider ? '🛵' : '📋'}</div>
        <h1>${rider ? 'Rider' : 'Delivery Manager'} sign-in</h1>
        <p class="muted">Enter the staff passcode set by your administrator.</p>
        <form data-form="staff" data-role="${role}">
          <div class="field"><label for="s-pass">Passcode</label><input id="s-pass" name="passcode" type="password" required autocomplete="current-password" /></div>
          <button class="btn btn-primary btn-lg" type="submit">Sign in</button>
        </form>
      </div>`;
    }

    /* ----- customer ----- */
    function customerView(u) {
        const tabs = `<div class="subnav">
      <button class="${S.tab === 'menu' ? 'active' : ''}" data-act="tab" data-tab="menu">Menu</button>
      <button class="${S.tab === 'orders' ? 'active' : ''}" data-act="tab" data-tab="orders">My orders</button>
    </div>`;
        if (S.tab === 'orders')
            return tabs + myOrders();
        const items = D.menu.items.filter(f => !S.cat || f.categoryId === S.cat);
        const o = D.active;
        const locked = !o || o.status !== ST.PROGRESS;
        return `
      <div class="layout">
        <section>
          ${tabs}
          <h1>Hi ${esc(u.name.split(' ')[0])}, what are you craving?</h1>
          <div class="chips">
            <button class="chip ${!S.cat ? 'active' : ''}" data-act="cat" data-cat="0">All</button>
            ${D.menu.categories.map(c => `<button class="chip ${S.cat === c.categoryId ? 'active' : ''}" data-act="cat" data-cat="${c.categoryId}">${esc(c.name)}</button>`).join('')}
          </div>
          <div class="menu-grid">
            ${items.map(f => `
              <article class="food">
                <div class="food-art" style="background:${ART_BG[f.foodItemId % ART_BG.length]}">${emojiFor(f.name)}</div>
                <div class="food-body">
                  <div class="food-name">${esc(f.name)}</div>
                  <div class="food-meta">${esc(f.categoryName)} · GST ${f.gstRate}%${f.inStock && f.stockQuantity <= 5 ? ` · only ${f.stockQuantity} left` : ''}</div>
                  <div class="food-foot">
                    <span class="price">${money(f.unitPrice)}</span>
                    <button class="btn btn-sm btn-primary" data-act="add" data-food="${f.foodItemId}" ${!f.inStock || (o && locked) ? 'disabled' : ''}>${f.inStock ? 'ADD TO CART' : 'SOLD OUT'}</button>
                  </div>
                </div>
              </article>`).join('')}
          </div>
        </section>
        ${orderPanel(o)}
      </div>`;
    }

    function orderPanel(o) {
        if (!o) {
            return `<aside class="panel">
        <h3>Your order</h3>
        <p class="muted">Start an order, then add items from the menu to your cart.</p>
        <button class="btn btn-primary btn-lg" data-act="orderNow">ORDER NOW</button>
      </aside>`;
        }
        const locked = o.status !== ST.PROGRESS;
        const addrs = D.addresses;
        const selected = o.address?.addressId;
        return `<aside class="panel">
      <div class="order-head"><h3>Order #${o.orderId}</h3>${badge(o.status)}</div>
      ${o.items.length ? `<ul class="cart-list">${o.items.map(r => `<li class="cart-item">
          <span>${emojiFor(r.name)} ${esc(r.name)}<br><span class="muted small">${money(r.unitPrice)} each</span></span>
          <span class="qty">
            <button data-act="dec" data-food="${r.foodItemId}" ${locked ? 'disabled' : ''} aria-label="Remove one">−</button>
            <b>${r.quantity}</b>
            <button data-act="inc" data-food="${r.foodItemId}" ${locked ? 'disabled' : ''} aria-label="Add one">+</button>
          </span>
        </li>`).join('')}</ul>` : `<div class="empty">Cart is empty.<br>Tap <b>ADD TO CART</b> on a dish.</div>`}
      <div class="totals">
        <div><span>Subtotal</span><span>${money(o.totals.subtotal)}</span></div>
        <div><span>GST</span><span>${money(o.totals.gst)}</span></div>
        <div class="grand"><span>Total</span><span>${money(o.totals.total)}</span></div>
      </div>
      <div class="field" style="margin-top:14px">
        <label for="addr-sel">Deliver to</label>
        ${addrs.length ? `<select id="addr-sel" data-change="address" ${locked ? 'disabled' : ''}>
          ${selected ? '' : '<option value="" selected disabled>Choose an address…</option>'}
          ${addrs.map(a => `<option value="${a.addressId}" ${selected === a.addressId ? 'selected' : ''}>${esc(a.flatNumber)}, ${esc(a.buildingName)} – ${esc(a.pincode)}</option>`).join('')}
        </select>` : `<p class="muted small">No saved address yet.</p>`}
        ${locked ? '' : `<button class="link small" data-act="toggleAddr">${S.addingAddr ? 'Cancel' : '+ Add new address'}</button>`}
      </div>
      ${S.addingAddr && !locked ? addressForm() : ''}
      ${o.status === ST.PROGRESS
        ? `<button class="btn btn-primary btn-lg" data-act="pay" ${o.items.length && selected ? '' : 'disabled'}>Proceed to Payment</button>
           <button class="btn btn-ghost" style="width:100%;margin-top:6px" data-act="cancel">Cancel order</button>`
        : `<button class="btn btn-primary btn-lg" data-act="resumePay">Resume payment</button>`}
    </aside>`;
    }

    function addressForm() {
        return `<form data-form="address" class="card" style="padding:14px;margin-bottom:12px;box-shadow:none">
      <div class="row2">
        <div class="field"><label>Flat No.</label><input name="flatNumber" required /></div>
        <div class="field"><label>Pincode</label><input name="pincode" required pattern="[1-9][0-9]{5}" inputmode="numeric" title="6-digit pincode" /></div>
      </div>
      <div class="field"><label>Building / Apartment</label><input name="buildingName" required /></div>
      <div class="field"><label>Landmark</label><input name="landmark" required /></div>
      <button class="btn btn-sm btn-green" type="submit">Save address</button>
    </form>`;
    }

    function myOrders() {
        if (!D.orders.length)
            return `<div class="card empty"><h3>No orders yet</h3><p>Your orders will show up here.</p></div>`;
        return `<div class="stack">${D.orders.map(o => {
      const d = o.delivery;
      return `<div class="card">
        <div class="order-head"><h3>Order #${o.orderId}</h3>${badge(o.status)}</div>
        <div class="info-line">${dateTimeStr(o.createdAt)} · <b>${money(o.payment ? o.payment.amount : o.totals.total)}</b>${o.payment ? ` · paid by ${esc(o.payment.method)}` : ''}</div>
        <ul class="order-items">${itemSummary(o) || '<li class="muted">No items</li>'}</ul>
        ${o.address ? `<div class="info-line">Deliver to: <b>${fmtAddr(o.address)}</b></div>` : ''}
        ${d ? `<div class="info-line">Rider: <b>${esc(d.riderName)}</b> · ${esc(d.riderPhone)} · ${d.deliveredAt ? `delivered at <b>${clockStr(d.deliveredAt)}</b>` : `expected by <b>${clockStr(d.expectedBy)}</b>`}</div>` : ''}
        ${stepper(o.status)}
      </div>`;
    }).join('')}</div>`;
    }

    /* ----- manager ----- */
    function managerView() {
        const dash = D.dash;
        if (!dash) return '<div class="card empty"><p>Loading…</p></div>';
        const freeRiders = D.riders.filter(r => r.status === 'Available');
        return `
      <div class="page-head"><div><h1>Delivery Manager</h1><p class="muted" style="margin:0">Assign a free rider to every paid order. Today: ${money(dash.revenueToday)} from ${dash.paymentsToday} payment(s)${dash.avgDeliveryMinutes !== null ? ` · average delivery ${dash.avgDeliveryMinutes} min` : ''}.</p></div></div>
      <div class="stats">
        <div class="stat"><b>${dash.awaitingRider}</b>Awaiting rider</div>
        <div class="stat"><b>${dash.outForDelivery}</b>Out for delivery</div>
        <div class="stat"><b>${dash.delivered}</b>Delivered</div>
        <div class="stat"><b>${dash.ridersFree}/${dash.ridersTotal}</b>Riders free</div>
      </div>
      <div class="two-col">
        <section>
          <h2>Paid orders</h2>
          ${D.queue.length ? `<div class="stack">${D.queue.map(o => managerOrderCard(o, freeRiders)).join('')}</div>`
            : `<div class="card empty"><h3>All caught up</h3><p>New paid orders will appear here.</p></div>`}
        </section>
        <section>
          <h2>Riders</h2>
          <div class="card"><div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>${D.riders.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody>
          </table></div></div>
          <h2 style="margin-top:24px">Deliveries</h2>
          <div class="card"><div class="table-wrap">${D.deliveries.length ? `<table>
            <thead><tr><th>Order</th><th>Rider</th><th>ETA</th><th>Status</th></tr></thead>
            <tbody>${D.deliveries.map(o => `<tr><td>#${o.orderId}</td><td>${esc(o.delivery.riderName)}</td><td>${o.delivery.deliveredAt ? '—' : clockStr(o.delivery.expectedBy)}</td><td>${badge(o.status)}</td></tr>`).join('')}</tbody>
          </table>` : '<p class="muted" style="margin:0">No deliveries yet.</p>'}</div></div>
        </section>
      </div>`;
    }

    function managerOrderCard(o, freeRiders) {
        return `<div class="card">
      <div class="order-head"><h3>Order #${o.orderId}</h3>${badge(o.status)}</div>
      <div class="info-line">Customer: <b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}</div>
      <div class="info-line">Address: <b>${fmtAddr(o.address)}</b></div>
      <ul class="order-items">${itemSummary(o)}</ul>
      <div class="info-line">Total paid: <b>${money(o.payment ? o.payment.amount : o.totals.total)}</b> · ${esc(o.payment?.method)}</div>
      ${freeRiders.length ? `<div class="assign-row">
        <div><label for="rider-${o.orderId}">Free rider</label>
          <select id="rider-${o.orderId}">${freeRiders.map(r => `<option value="${r.riderId}" ${r.riderId === o.suggestedRiderId ? 'selected' : ''}>${esc(r.name)}${r.riderId === o.suggestedRiderId ? ' ★ nearest' : ''}</option>`).join('')}</select></div>
        <div><label for="eta-${o.orderId}">ETA (min)</label><input id="eta-${o.orderId}" type="number" min="5" max="120" value="30" /></div>
        <button class="btn btn-green" data-act="assign" data-order="${o.orderId}">Assign rider</button>
      </div>` : `<p class="muted small" style="margin:10px 0 0">All riders are busy or offline. Assign once someone is free.</p>`}
    </div>`;
    }

    /* ----- rider ----- */
    function riderPicker() {
        return `<div style="min-width:220px"><label for="rider-sel">I am</label>
          <select id="rider-sel" data-change="rider">${D.riderChoices.map(r => `<option value="${r.riderId}" ${r.riderId === S.riderId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>`;
    }

    function riderView() {
        if (!S.tokens.rider) {
            return `<div class="page-head"><div><h1>Rider app</h1><p class="muted" style="margin:0">Pick your name, then sign in.</p></div>${riderPicker()}</div>`
                + staffLoginView('rider');
        }
        const me = D.me;
        if (!me) return '<div class="card empty"><p>Loading…</p></div>';
        return `
      <div class="page-head">
        <div><h1>Rider app</h1><p class="muted" style="margin:0">Assignments from the Delivery Manager show up here.</p></div>
        ${riderPicker()}
      </div>
      <div class="two-col">
        <section>
          <h2>Current delivery</h2>
          ${D.current ? riderCurrent(D.current) : `<div class="card empty"><h3>${me.status === 'Offline' ? "You're offline" : "You're free"}</h3>
            <p>${me.status === 'Offline' ? 'Go online to receive assignments.' : 'Waiting for the next assignment…'}</p>
            ${badge(me.status)}
            <div style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="riderStatus" data-status="${me.status === 'Offline' ? 'Available' : 'Offline'}">${me.status === 'Offline' ? 'Go online' : 'Go offline'}</button></div></div>`}
        </section>
        <section>
          <h2>Completed</h2>
          <div class="card">${D.history.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Delivered</th></tr></thead><tbody>
            ${D.history.map(o => `<tr><td>#${o.orderId}</td><td>${esc(o.customer.name)}</td><td>${clockStr(o.delivery.deliveredAt)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="muted" style="margin:0">No completed deliveries yet.</p>'}</div>
        </section>
      </div>`;
    }

    function riderCurrent(o) {
        const d = o.delivery;
        return `<div class="card notify">
      <span class="notify-tag">${d.pickedUpAt ? 'ON THE WAY' : 'NEW ASSIGNMENT'}</span>
      <div class="order-head"><h3>Order #${o.orderId}</h3><b>Deliver by ${clockStr(d.expectedBy)}</b></div>
      <div class="info-line">Customer: <b>${esc(o.customer.name)}</b></div>
      <div class="info-line">Phone: <b><a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></b></div>
      <div class="info-line">Address: <b>${fmtAddr(o.address)}</b></div>
      ${o.payment?.method === 'Cash on Delivery' ? `<div class="info-line">Collect cash: <b>${money(o.payment.amount)}</b></div>` : ''}
      <ul class="order-items">${itemSummary(o)}</ul>
      ${d.pickedUpAt
        ? `<button class="btn btn-green btn-lg" data-act="delivered" data-order="${o.orderId}">Mark as delivered</button>`
        : `<button class="btn btn-primary btn-lg" data-act="pickup" data-order="${o.orderId}">Mark as picked up</button>`}
    </div>`;
    }

    /* ----- payment modal ----- */
    function renderModal() {
        const root = $('#modal');
        const o = D.active;
        if (!S.tokens.customer || !S.payOpen || !o || o.status !== ST.PROCESSING) {
            root.hidden = true;
            root.innerHTML = '';
            return;
        }
        root.hidden = false;
        root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Payment">
      <h3>Payment gateway (simulated)</h3>
      <p class="muted small">Order #${o.orderId} · ${o.items.length} item type(s)</p>
      <div class="pay-amount">${money(o.totals.total)}</div>
      <div class="field"><label for="pay-mode">Payment mode</label>
        <select id="pay-mode">${PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="modal-actions">
        <button class="btn" data-act="closePay">Back</button>
        <button class="btn btn-primary" data-act="confirmPay">Pay ${money(o.totals.total)}</button>
      </div>
    </div>`;
    }

    /* ---------- actions (each one calls the API; the page then re-fetches and re-renders) ---------- */
    const orderPath = (suffix = '') => `/orders/${D.active.orderId}${suffix}`;
    const actions = {
        role(el) { S.role = el.dataset.role; D = emptyData(); S.payOpen = false; },
        retry() { /* refresh happens after every action */ },
        logout() { delete S.tokens[S.role]; delete S.users[S.role]; S.tab = 'menu'; S.payOpen = false; D = emptyData(); },
        authMode(el) { S.authMode = el.dataset.mode; },
        tab(el) { S.tab = el.dataset.tab; },
        cat(el) { S.cat = Number(el.dataset.cat); },
        toggleAddr() { S.addingAddr = !S.addingAddr; },
        async orderNow() {
            if (D.active) return;
            await api('POST', '/orders');
            toast('Order started – add items to your cart');
        },
        async add(el) {
            if (!D.active) return toast('Click ORDER NOW first');
            const f = D.menu.items.find(x => x.foodItemId === Number(el.dataset.food));
            await api('POST', orderPath('/items'), { foodItemId: Number(el.dataset.food), quantity: 1 });
            toast(`${f.name} added to cart`);
        },
        inc(el) { return changeQty(Number(el.dataset.food), 1); },
        dec(el) { return changeQty(Number(el.dataset.food), -1); },
        async cancel() {
            await api('DELETE', orderPath());
            toast('Order cancelled');
        },
        async pay() {
            await api('POST', orderPath('/checkout'));
            S.payOpen = true;
        },
        resumePay() { S.payOpen = true; },
        async closePay() {
            S.payOpen = false;
            await api('POST', orderPath('/checkout/cancel'));
        },
        async confirmPay() {
            await api('POST', orderPath('/pay'), { paymentMethod: $('#pay-mode').value });
            S.payOpen = false;
            S.tab = 'orders';
            toast('Payment successful 🎉 – sent to the Delivery Manager');
        },
        async assign(el) {
            const oid = Number(el.dataset.order);
            const eta = Number($(`#eta-${oid}`).value) || 30;
            const res = await api('POST', `/manager/orders/${oid}/assign`, { riderId: Number($(`#rider-${oid}`).value), etaMinutes: eta });
            toast(`Assigned to ${res.order.delivery.riderName}`);
        },
        async pickup(el) {
            await api('POST', `/rider/deliveries/${el.dataset.order}/pickup`);
            toast('Pickup recorded. Safe ride!');
        },
        async delivered(el) {
            await api('POST', `/rider/deliveries/${el.dataset.order}/deliver`);
            toast('Marked as delivered. You are free again.');
        },
        async riderStatus(el) {
            await api('PATCH', '/rider/status', { status: el.dataset.status });
            toast(el.dataset.status === 'Available' ? 'You are online' : 'You are offline');
        }
    };

    async function changeQty(foodItemId, delta) {
        const line = D.active?.items.find(i => i.foodItemId === foodItemId);
        if (!line) return;
        await api('PATCH', orderPath(`/items/${foodItemId}`), { quantity: line.quantity + delta });
    }

    /* ---------- forms ---------- */
    const forms = {
        async login(f) {
            const d = new FormData(f);
            const body = { email: String(d.get('email')).trim(), phone: String(d.get('phone')).trim() };
            const res = await api('POST', '/auth/login', body);
            S.tokens.customer = res.token;
            S.users.customer = res.user;
            S.tab = 'menu';
            toast(`Welcome back, ${res.user.name.split(' ')[0]}!`);
        },
        async register(f) {
            const d = new FormData(f);
            const body = { name: String(d.get('name')).trim(), email: String(d.get('email')).trim(), phone: String(d.get('phone')).trim() };
            const res = await api('POST', '/auth/register', body);
            S.tokens.customer = res.token;
            S.users.customer = res.user;
            S.tab = 'menu';
            toast(`Account created. Welcome, ${res.user.name.split(' ')[0]}!`);
        },
        async staff(f) {
            const role = f.dataset.role;
            const body = { role, passcode: new FormData(f).get('passcode') };
            if (role === 'rider') body.id = S.riderId;
            const res = await api('POST', '/auth/staff', body);
            S.tokens[role] = res.token;
            S.users[role] = res.user;
            toast(`Signed in as ${res.user.name}`);
        },
        async address(f) {
            const d = new FormData(f);
            const res = await api('POST', '/me/addresses', Object.fromEntries(['flatNumber', 'buildingName', 'landmark', 'pincode'].map(k => [k, String(d.get(k)).trim()])));
            if (D.active && D.active.status === ST.PROGRESS)
                await api('PATCH', orderPath('/address'), { addressId: res.address.addressId });
            S.addingAddr = false;
            toast('Address saved');
        }
    };

    /* ---------- events ---------- */
    // Runs a user action, shows any error as a toast, then re-syncs with the server.
    async function run(fn) {
        if (busy) return;
        busy = true;
        try {
            await fn();
        }
        catch (e) {
            toast(e.message);
        }
        try {
            await refresh();
        }
        catch (e) {
            if (!offline) toast(e.message);
        }
        busy = false;
        render();
    }

    document.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled)
            return;
        const fn = actions[el.dataset.act];
        if (fn)
            run(() => fn(el));
    });
    document.addEventListener('submit', e => {
        const f = e.target.closest('[data-form]');
        if (!f)
            return;
        e.preventDefault();
        run(() => forms[f.dataset.form]?.(f));
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-change]');
        if (!el)
            return;
        if (el.dataset.change === 'address') {
            run(() => api('PATCH', orderPath('/address'), { addressId: Number(el.value) }));
        }
        else if (el.dataset.change === 'rider') {
            run(() => { S.riderId = Number(el.value); });
        }
    });

    // Other tabs/devices change the data (e.g. the manager assigns a rider), so poll while this tab is visible.
    let lastSnapshot = '';
    setInterval(async () => {
        if (busy || document.hidden)
            return;
        const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
        if (typing)
            return;
        try {
            await refresh();
        }
        catch (e) {
            if (offline) render();
            return;
        }
        const snap = JSON.stringify([D, offline, S.role]);
        if (snap !== lastSnapshot) {
            lastSnapshot = snap;
            render();
        }
    }, POLL_MS);

    run(() => { /* initial load */ });
})();
