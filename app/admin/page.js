"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getUser } from "@/lib/auth";

const REFRESH_MS = 5000;

// How long each stage may go quiet before we call it stale (a bit over its interval)
const STAGES = [
  { job: "poll", label: "Codeforces → MySQL", every: "5 s", staleAfter: 120 },
  { job: "mongo", label: "MySQL outbox → MongoDB", every: "15 s", staleAfter: 120 },
  { job: "analytics", label: "MongoDB → city analytics", every: "5 min", staleAfter: 600 },
  { job: "geocode", label: "New cities → map", every: "5 min", staleAfter: 900 },
];

function secondsSince(date) {
  return date ? Math.round((Date.now() - new Date(date)) / 1000) : null;
}

function ago(seconds) {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export default function AdminPage() {
  const [user, setUser] = useState(undefined); // undefined = not checked yet
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/stats")
      .then(async (res) => (res.ok ? res.json() : Promise.reject((await res.json()).error)))
      .then((data) => {
        setStats(data);
        setError("");
      })
      .catch((message) => setError(message || "Could not load the dashboard."));
  }, []);

  useEffect(() => {
    setUser(getUser());
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const rebuild = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      setSyncMsg(res.ok ? data.message : data.error);
      load();
    } catch {
      setSyncMsg("Could not reach the server.");
    } finally {
      setSyncing(false);
    }
  };

  if (user === undefined) return null;

  if (user?.role !== "admin") {
    return (
      <main className="page">
        <h1>Admins only</h1>
        <p className="subtitle">
          <Link href="/login" style={{ color: "var(--green)" }}>
            Log in
          </Link>{" "}
          as an admin to see this page.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Admin dashboard</h1>
      <p className="subtitle">Live view of the database and the sync worker · refreshes every 5 s</p>

      {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

      {stats && (
        <>
          <div className="admin-cards">
            <div className="card">
              <span>Submissions</span>
              <b>{stats.totalSubmissions.toLocaleString()}</b>
              <small className="muted">+{stats.lastFiveMinutes} in last 5 min</small>
            </div>
            <div className="card">
              <span>Codeforces accounts</span>
              <b>{stats.totalUsers.toLocaleString()}</b>
              <small className="muted">{stats.usersWithoutLocation}% without a city</small>
            </div>
            <div className="card">
              <span>Problems</span>
              <b>{stats.totalProblems.toLocaleString()}</b>
              <small className="muted">{stats.testing} submissions still TESTING</small>
            </div>
            <div className="card">
              <span>Cities on the globe</span>
              <b>{stats.cities ?? "–"}</b>
              <small className="muted">{stats.cities == null ? "MongoDB unreachable" : "from city_analytics"}</small>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3 className="section-title" style={{ marginTop: 0 }}>
              Pipeline
            </h3>
            <div className="pipeline">
              {STAGES.map((s) => {
                const last = stats.lastRun[s.job];
                const age = secondsSince(last?.finishedAt);
                const ok = age != null && age <= s.staleAfter;
                return (
                  <div className="stage" key={s.job}>
                    <span className={`health ${ok ? "ok" : "stale"}`} />
                    <div>
                      <b>{s.label}</b>
                      <small className="muted">
                        every {s.every} · last {ago(age)}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Outbox waiting for MongoDB: <b>{stats.outboxPending}</b> rows. If every light is red, start the worker
              with <code>npm run worker</code>.
            </p>
          </div>

          <div className="card sync-row">
            <div>
              <b>Rebuild city analytics now</b>
              <p className="subtitle" style={{ margin: 0 }}>
                Copies the outbox to MongoDB and rebuilds the globe data without waiting for the 5-minute cycle.
              </p>
            </div>
            <button className="btn" onClick={rebuild} disabled={syncing}>
              {syncing ? "Rebuilding…" : "Rebuild now"}
            </button>
            {syncMsg && <p className="notice" style={{ width: "100%" }}>{syncMsg}</p>}
          </div>

          <div className="card table-wrap">
            <h3 className="section-title" style={{ marginTop: 0 }}>
              Recent job runs
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>When</th>
                  <th>Took</th>
                  <th>Fetched</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {stats.syncLog.map((s) => (
                  <tr key={s.id}>
                    <td>{s.job}</td>
                    <td>{ago(secondsSince(s.startedAt))}</td>
                    <td>{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</td>
                    <td>{s.fetched}</td>
                    <td>{s.inserted}</td>
                    <td>{s.updated}</td>
                    <td className={s.status === "OK" ? "status-ok" : "status-failed"}>{s.status}</td>
                    <td className="muted">{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.syncLog.length === 0 && <p className="subtitle">No runs yet. Start the worker.</p>}
          </div>
        </>
      )}
    </main>
  );
}
