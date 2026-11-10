# GCode

An interactive 3D globe showing where competitive programmers are active on Codeforces.
Click a green dot to see that region's submissions, top topics, verdicts and most solved problems.
The globe is styled after [Radio Garden](https://radio.garden).

Stack: **Next.js (React)** frontend and API routes, **MySQL**, **MongoDB**.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current status

The **frontend is done**. The **backend is empty on purpose**: every API route currently returns
fake data from `lib/mockData.js`, so the UI works before any database exists.

## Your job: connect the backend

| File | What to do |
| --- | --- |
| `.env.example` | Copy to `.env.local` and fill in your DB credentials |
| `lib/db/mysql.js` | Create the MySQL connection pool |
| `lib/db/mongodb.js` | Create the MongoDB client |
| `app/api/regions/route.js` | Dots for the globe (one row per city) |
| `app/api/regions/[id]/route.js` | Side-panel details for one city |
| `app/api/problems/route.js` | Problems list with search and filters |
| `app/api/tags/route.js` | Tag names for the filter dropdown |
| `app/api/auth/login/route.js` | Real login with hashed passwords and roles |
| `app/api/admin/stats/route.js` | Admin dashboard numbers |
| `app/api/admin/sync/route.js` | Pull from the Codeforces API and save to both DBs |

Each file has a `TODO` comment and the **response shape** the frontend expects.
If your query returns that same shape, the page keeps working with no frontend changes.

Suggested order: `.env.local` → `mysql.js` → `tags` (easiest query) → `problems` → `regions` → `regions/[id]` → `login` → `sync` → `stats`.
When no route imports `lib/mockData.js` any more, delete it.

## Folder map

```
app/
  page.js            Globe page
  problems/page.js   Problems table with filters
  login/page.js      Login form
  admin/page.js      Admin dashboard (admin role only)
  api/               Backend routes (TODO)
components/
  GlobeView.js       The 3D globe (react-globe.gl)
  RegionPanel.js     Side panel shown when a dot is clicked
  Navbar.js
lib/
  mockData.js        Temporary fake data
  auth.js            Remembers who is logged in, in the browser (UI only, not security)
  db/                Database connections (TODO)
```

## Login and roles

- **Login:** `/login` checks the email and password against `app_user` (bcrypt hash) and sets a signed httpOnly cookie. `AUTH_SECRET` in `.env.local` signs it.
- **Two roles:** `ADMIN` (shown as "admin") and `USER` (shown as "viewer"). Only admins can open `/admin`, `/api/admin/stats` and `/api/admin/sync`; others get 401/403 from the server.
- **Role-based access control in MySQL:** `db/migrations/003_roles.sql` creates `gcode_viewer` (SELECT only) and `gcode_admin` roles. Public routes connect as the viewer account, admin routes as the admin account, so the database itself refuses writes from the viewer role.
