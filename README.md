# GCode

An interactive 3D globe showing where competitive programmers are active on Codeforces.
Click a dot to see that city's submissions, top topics, verdicts, languages, difficulty and most solved problems.

Stack: **Next.js (React)**, **MySQL** (source of truth), **MongoDB** (raw data and per-city analytics).

## Current stage

- **Data comes from Codeforces.** A first snapshot is stored in `data/codeforces/`, and a background worker keeps pulling new submissions from the Codeforces API (every 5 s). Profiles are fetched only for handles we have not seen before.
- **Only users with a location are drawn on the globe.** A Codeforces profile may have a city and country, or neither. All accounts are stored in MySQL, but a submission is shown on the globe only when its user gave **both city and country** and that city is known:
  - city and country, city known: on the globe (`CITY_RESOLVED`)
  - city and country, city not known yet: looked up with Nominatim (1 request per second, results cached), then re-checked (`UNRESOLVED`)
  - country only or nothing: kept in MySQL, not drawn (`COUNTRY_ONLY`, `UNKNOWN`)
- Submissions still in the judging queue (`TESTING`) are not counted until they get a final verdict.
- Login with two roles (`ADMIN`, `USER`) and an admin dashboard are in place.

## Run it

Needs Node.js 18+, MySQL 8.0.16+ and MongoDB.

```bash
npm install
cp .env.example .env.local        # fill in DB passwords and AUTH_SECRET
```

The import scripts read `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from `.env.local`. Add these if `.env.example` only has the `MYSQL_*` names.

**1. Create the MySQL tables** (use the `mysql` client; the files use `DELIMITER`):

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p gcode < db/migrations/002_live_sync.sql
mysql -u root -p gcode < db/migrations/003_roles.sql   # change the two passwords first, match them in .env.local
```

**2. Load the Codeforces snapshot and build the analytics:**

```bash
node scripts/import_mysql.js               # snapshot -> MySQL
node scripts/sync/backfill-mongo.js        # raw JSON -> MongoDB
node scripts/build-city-analytics.cjs      # MongoDB city_analytics (what the globe reads)
```

To refresh the snapshot first: `node scripts/codeforces/collect.js`, then `node scripts/codeforces/geocode-cities.js`.

**3. Start everything** (two terminals):

```bash
node scripts/sync/worker.js    # live updates from Codeforces
npm run dev                    # http://localhost:3000
```

**4. Create a login** (no users exist at first):

```bash
node -e "import('bcryptjs').then(b => console.log((b.default || b).hashSync('YourPassword', 10)))"
```
```sql
INSERT INTO app_user (email, password_hash, role) VALUES ('admin@gcode.local', '<hash>', 'ADMIN');
```

## What the worker does

| Every | Job |
| --- | --- |
| 5 s | Fetch recent submissions from Codeforces into MySQL, and queue the raw JSON in `ingest_outbox` |
| 15 s | Copy queued JSON from `ingest_outbox` into MongoDB |
| 5 min | Rebuild `city_analytics` in MongoDB |
| 5 min | Look up new city names and attach accounts to their city |
| 1 h | Delete old outbox and log rows |

## Folder map

```
app/            Pages (globe, problems, login, admin) and API routes in app/api
components/     GlobeView, RegionPanel, Navbar
lib/            Database connections (lib/db), login session (session.js)
db/             schema.sql and migrations (live sync tables, roles)
scripts/        codeforces/ (collect data), sync/ (worker and its jobs), import and analytics scripts
data/           Codeforces snapshot (JSON)
docs/           ER diagram, relational schema, project report
```

## Login and roles

- **Login:** `/login` checks the email and password against `app_user` (bcrypt hash) and sets a signed httpOnly cookie. `AUTH_SECRET` in `.env.local` signs it.
- **Two roles:** `ADMIN` (shown as "admin") and `USER` (shown as "viewer"). Only admins can open `/admin`, `/api/admin/stats` and `/api/admin/sync`; others get 401/403 from the server.
- **Role-based access control in MySQL:** `db/migrations/003_roles.sql` creates `gcode_viewer` (SELECT only) and `gcode_admin` roles. Public routes connect as the viewer account, admin routes as the admin account, so the database itself refuses writes from the viewer role.
