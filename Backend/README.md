# ORDERIT Backend

Node.js + Express + MySQL API for the ORDERIT food-ordering and delivery system. It also serves the web app in `../Frontend`, so one command runs everything.

## Setup (once)

1. Install Node.js 18+ and MySQL 8, and make sure MySQL is running (on Windows: `net start MYSQL80` in an admin terminal, or Services -> MySQL80 -> Start).
2. In this folder:
   ```
   npm install
   copy .env.example .env
   ```
3. Edit `.env`:
   - `DB_PASSWORD` = your MySQL root password
   - `JWT_SECRET` = a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - change `MANAGER_PASSCODE` and `RIDER_PASSCODE`
4. Create the database, tables, view, function and sample data:
   ```
   npm run db:setup
   ```

## Run

```
npm start          # or: npm run dev  (auto-restart on changes)
```
Open **http://localhost:3000**. Use separate browser tabs for Customer, Delivery Manager and Rider; they update each other every ~5 seconds.

## Logging in

| Role | How |
|---|---|
| Customer | Email + phone (+ name for a new account). Sample user: `aarav.sharma@example.com` / `+919876543210` |
| Delivery Manager | Passcode `MANAGER_PASSCODE` from `.env` (default `manager123`) |
| Rider | Pick your name, passcode `RIDER_PASSCODE` (default `rider123`) |

The schema has no password columns, so customers prove identity with email + phone, and staff use shared passcodes. For real use, add proper credentials.

## Order flow

`In Progress` -> (checkout) `Payment Processing` -> (pay) `Payment Successful` -> (manager assigns rider) `Rider Assigned` -> (rider picks up, then delivers) `Delivered`

## Commands

| Command | What it does |
|---|---|
| `npm run db:setup` | Create DB + sample data (does nothing if it already exists) |
| `npm run db:reset` | **Deletes** the database and recreates it with fresh sample data |
| `npm test` | End-to-end test of the whole lifecycle against the DB (adds a few rows, uses a little stock) |

## What the backend enforces

- **Totals computed on the server** from price/GST snapshots in the cart; the payment amount comes from your `fn_get_order_payable_amount` function. The browser can't set prices.
- **Stock**: checked when adding to cart, at checkout, and again under row locks at payment, which decrements it. Two buyers racing for the last unit: one wins, one gets a clear error.
- **No double payment / double booking**: all state changes run in transactions with row locks. A rider can't be assigned twice, and a delivery can't be completed by someone else's rider.
- **Ownership**: customers only see their own orders; roles are checked on every route.
- **One open order per customer**; paid orders can't be cancelled. Cancelling an unpaid cart deletes it (the schema has no "Cancelled" status).
- Rider must record **pickup** before **delivery**; riders go Busy -> Available automatically; riders can toggle Offline.
- The manager's queue **suggests the nearest available rider** (by pincode, then fewest deliveries). Assignment is still manual.
- Helmet security headers, rate limiting (stricter on login), input validation (zod), JWT auth, friendly errors for DB constraint failures.

## API summary (all under `/api`, JSON, `Authorization: Bearer <token>`)

- Auth: `POST /auth/login`, `POST /auth/staff`, `GET /auth/me`, `GET /auth/riders`, `GET /auth/managers`
- Menu (public): `GET /menu?categoryId=&q=&inStock=`, `GET /menu/categories`
- Customer: `GET|POST /me/addresses`, `DELETE /me/addresses/:id`
- Orders (customer): `GET /orders`, `GET /orders/active`, `POST /orders`, `GET /orders/:id`, `POST /orders/:id/items`, `PATCH|DELETE /orders/:id/items/:foodItemId`, `PATCH /orders/:id/address`, `POST /orders/:id/checkout`, `POST /orders/:id/checkout/cancel`, `POST /orders/:id/pay {paymentMethod}`, `DELETE /orders/:id`
- Manager: `GET /manager/dashboard|orders|riders|deliveries`, `POST /manager/orders/:id/assign {riderId, etaMinutes}`
- Rider: `GET /rider/me`, `PATCH /rider/status`, `GET /rider/deliveries/current|history`, `POST /rider/deliveries/:orderId/pickup|deliver`
- `GET /health`

Payment methods: UPI, Credit Card, Debit Card, Net Banking, Cash on Delivery.

## Hosting the frontend elsewhere

Set `CORS_ORIGINS=https://your-site` in `.env` and define `window.ORDERIT_API = 'https://your-api/api'` before `app.js` loads.

## Troubleshooting

- `ECONNREFUSED` / "Could not connect to MySQL": MySQL isn't running or `DB_HOST/DB_PORT` is wrong.
- `ER_ACCESS_DENIED_ERROR`: wrong `DB_USER` / `DB_PASSWORD`.
- "Cannot reach the ORDERIT server" in the browser: start the backend and open http://localhost:3000 (not the HTML file directly).
- Production: set `NODE_ENV=production`; the server then refuses to start with a missing `JWT_SECRET` or default passcodes. Serve it behind HTTPS.
