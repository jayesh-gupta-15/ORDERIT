# ORDERIT

A food ordering and delivery system with three roles: **customers** who browse the menu and order, **delivery managers** who assign riders, and **riders** who pick up and deliver. It is a MySQL database, a Node.js/Express API and a plain HTML/CSS/JS web app, all served by one command.

## Project structure

```
ORDERIT/
├── Backend/    Node.js + Express API (also serves the frontend)
├── DataBase/   MySQL schema (schema.sql) and sample data (data.sql)
└── Frontend/   Web app: index.html, style.css, app.js
```

## Features

- **Customers**: browse and search the menu, manage addresses, build a cart, check out and pay (UPI, Credit Card, Debit Card, Net Banking, Cash on Delivery).
- **Delivery managers**: dashboard of orders, riders and deliveries; assign a rider to paid orders (the nearest available rider is suggested).
- **Riders**: see the current delivery, record pickup and delivery, go online or offline, view history.
- **Server-side safety**: totals and stock are checked on the server inside transactions, so prices can't be tampered with and the last unit can't be sold twice.

## Order flow

`In Progress` → `Payment Processing` → `Payment Successful` → `Rider Assigned` → `Delivered`

## Database

Tables: `users`, `addresses`, `user_addresses`, `categories`, `food_items`, `riders`, `delivery_managers`, `orders`, `order_items`, `payments`, `deliveries`, plus a view and the `fn_get_order_payable_amount` function. See `DataBase/schema.sql`.

## Quick start

Requires Node.js 18+ and MySQL 8 (running).

```bash
cd Backend
npm install
cp .env.example .env     # on Windows: copy .env.example .env
# edit .env: set DB_PASSWORD, JWT_SECRET, MANAGER_PASSCODE, RIDER_PASSCODE
npm run db:setup         # creates the database, tables and sample data
npm start
```

Open **http://localhost:3000**. Use separate browser tabs for the Customer, Delivery Manager and Rider views.

Sample customer login: `aarav.sharma@example.com` / `+919876543210`.

## Tech stack

Node.js, Express 5, MySQL (mysql2), JWT, zod, helmet, express-rate-limit, vanilla JavaScript frontend.

## More documentation

Full setup notes, the API reference, enforced business rules and troubleshooting are in [Backend/README.md](Backend/README.md).

## Security note

Staff logins use shared passcodes from `.env` and customers sign in with email + phone, because the schema has no credential columns. Change the default passcodes and add real authentication before any real-world use. Never commit your `.env` file.
