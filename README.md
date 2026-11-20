# SMC Function Hall (A/C) — Kalyana Mandapam & Function Hall
**Banner name:** Penta Jayashankararao  
**Address:** Next to BOI (Bank of India), K.T. Road, Palasa – Kasibugga  
**Contact:** 94411 17278 / 94410 89616  
**Facilities:** A/C halls, parking, rooms and lift available  
**Events:** Wedding, Engagement, Half Saree, Birthday, Meetings  

### Hall Rent
| Hall | Full Day (Marriage) | Half Day (Function) |
|---|---|---|
| **Big banquet hall** | ₹75,000 | ₹42,000 |
| **Small banquet hall** | ₹40,000 | ₹25,000 |
| **Both halls combo** | ₹90,000 | ₹47,000 |

### Extra charges (not included in rent)
- **Power bill:** ₹15 per unit (`Units = Ending reading − Starting reading`)
- **Generator (charged per hour of use):**
  - 120 kVA: ₹1,500/hr
  - 30 kVA: ₹450/hr

**Final bill formula:**  
$$\text{Final bill} = \text{Hall rent} + \text{Power bill} + \text{Generator bill}$$

*Example:* Big hall half day (₹42,000) + 200 units (₹3,000) + 120 kVA generator for 3 hrs (₹4,500) = **₹49,500**

---

**Stack:** React 19 + Vite + Tailwind CSS 4 (frontend) · Node.js + Express 5 (API) · MySQL as the permanent database (GoDaddy Node.js Hosting's managed MySQL), with a working copy in Node's built-in `node:sqlite` · JWT logins with bcrypt-hashed passwords.

## Run it

Needs Node.js 22.13 or newer.

```bash
npm install
npm run serve
```

Open **http://localhost:4000**. Other computers/phones on the same Wi-Fi can open `http://<this-PC's-IP>:4000`.

For development with live reload: `npm run dev` → http://localhost:5173

## Hosting (GoDaddy Node.js Hosting)

The app runs on GoDaddy Node.js Hosting with its managed MySQL database, deployed from this GitHub repo.

1. In the GoDaddy hosting dashboard: **Node.js Apps → Add App → Connect GitHub**, pick this repo and branch.
2. In the app's **Settings → secrets** set the MySQL connection (see `.env.example` for the accepted names)
   and `JWT_SECRET` (any long random text; keep it the same so logins survive redeploys).
3. Check the private preview, then **Publish Now** and connect the domain (for example `hall.jsippalasa.com`).

The app creates its MySQL tables by itself on first start. GoDaddy redeploys on every push to the connected branch.
GoDaddy's requirements this repo follows: everything needed to build is in `dependencies`, `npm run build` then
`npm start`, and the server listens on `process.env.PORT`.

A hosted copy with no MySQL configured (for example an old Vercel deployment) disables its API instead of saving
to temporary storage.

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
  app.js              Express app: API, static files, error handler
  index.js            local server (listens on PORT, default 4000)
  db.js               SQLite connection + query helpers
  mysql.js            MySQL connection; creates the tables
  sync.js             keeps the SQLite working copy in step with MySQL
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

All data is saved in MySQL. The server loads every table from MySQL when it starts, keeps a working copy
in memory only (no data file on disk), and writes each change to MySQL in one transaction before the screen shows it as
saved. If MySQL can't be reached, the app shows an error instead of pretending to save.
Back up from the GoDaddy database tools (export). Without MySQL settings, the app runs on a local file
(`data/hotel.db`), which is handy on your own computer.
Rates for rooms and halls were seeded with sample values — the admin can edit them from the Rooms and Banquet Halls pages.
