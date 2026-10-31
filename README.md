# Penta Kedarnath — Hotel & Function Hall Manager

Management system for 1 suite, 4 AC rooms, 2 banquet halls (big & small) and supply stock.

**Stack:** React 19 + Vite + Tailwind CSS 4 (frontend) · Node.js + Express 5 (API) · SQLite via Node's built-in `node:sqlite` (no database server to install) · JWT logins with bcrypt-hashed passwords.

## Run it

Needs Node.js 22.13 or newer.

```bash
npm install
npm run serve
```

Open **http://localhost:4000**. Other computers/phones on the same Wi-Fi can open `http://<this-PC's-IP>:4000`.

For development with live reload: `npm run dev` → http://localhost:5173

## Online demo

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Dev02005/Penta-Kedaranath-hotel-app)

The demo runs with `DEMO_MODE=true`, which shows the `admin` / `admin123` sign-in on the login page.
On Render's free plan the data is temporary: it resets whenever the service restarts or sleeps
(after ~15 minutes without visitors), and the first visit after sleeping takes up to a minute to wake.

## Default logins

| Username | Password   | Role  |
|----------|------------|-------|
| admin    | admin123   | Admin — full access |
| staff1   | staff123   | Staff |
| staff2   | staff123   | Staff |

**Change these passwords right after the first sign-in** (sidebar → *Password*, or admin → *Staff & Logins*).

## Who can do what

| | Admin | Staff |
|---|---|---|
| Create / edit bookings, check-in / out, cancel | ✅ | ✅ |
| Record payments, print receipts | ✅ | ✅ |
| Stock in / stock out | ✅ | ✅ |
| Delete bookings & payments | ✅ | ❌ |
| Add / edit / delete rooms, halls, rates | ✅ | ❌ |
| Add / edit / delete supply items | ✅ | ❌ |
| Manage logins, view activity log | ✅ | ❌ |

## Features

- **Login** — pick your name from a dropdown, then enter your password
- **Dashboard** — booking calendar heat map (darker days are busier; click a day to see or book rooms and halls), live room board, today's arrivals/departures, upcoming events, collections chart, pending dues, low-stock alerts
- **Rooms** — bookings with automatic night × rate totals, double-booking protection, check-in/out, advance & part payments
- **Banquet halls** — morning / evening / full-day slots with clash detection, tentative holds, event types
- **Supplies** — stock levels, minimum-level alerts, stock in/out with full movement history
- **Payments** — date-range report split by rooms/halls and payment method
- **Activity log** — every action recorded with who did it

## Code layout

```
server/
  index.js            app setup, static files, error handler
  db.js               SQLite connection + query helpers
  schema.js           tables + first-run seed data
  lib/http.js         input validation & error helpers
  middleware/auth.js  JWT sign-in check, admin-only guard
  routes/             one file per area (auth, rooms, halls, bookings, payments, supplies, dashboard, users)
src/
  api.js, hooks.js    fetch wrapper; useApi / useSave / useRemove hooks
  auth.jsx            signed-in user context
  components/         UI kit, layout, booking forms & detail, calendar heat map
  pages/              one file per screen
```

## Data & backup

All data lives in `data/hotel.db`. To back up, copy the `data` folder while the server is stopped.
Rates for rooms and halls were seeded with sample values — the admin can edit them from the Rooms and Banquet Halls pages.
