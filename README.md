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

## Online demo (Vercel)

Import this repo at [vercel.com/new](https://vercel.com/new). No settings needed — `vercel.json` configures everything.

On Vercel the app runs in demo mode: the login page shows `admin` / `admin123` with a **Fill in** button.
The data lives in Vercel's temporary storage and resets whenever Vercel starts a fresh instance,
so don't keep real hotel data there. For permanent online use, move the database to a hosted one (e.g. Turso).

To turn the demo off, set `DEMO_MODE=false` **and** `JWT_SECRET` (any long random text) in
**Project → Settings → Environment Variables**. Without `JWT_SECRET` the app refuses to start outside demo mode.

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
api/index.js          Vercel serverless entry (wraps server/app.js)
server/
  app.js              Express app: API, static files, error handler
  index.js            local server (listens on PORT, default 4000)
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
