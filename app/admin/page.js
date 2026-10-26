"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";

export default function AdminPage() {
  const [user, setUser] = useState(undefined); // undefined = not checked yet
  const [stats, setStats] = useState(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setUser(getUser());
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const sync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      setSyncMsg(res.ok ? `Fetched ${data.fetched}, inserted ${data.inserted}` : data.error);
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
      <p className="subtitle">Database overview and Codeforces sync</p>

      {stats && (
        <>
          <div className="admin-cards">
            <div className="card">
              <span>Submissions</span>
              <b>{stats.totalSubmissions}</b>
            </div>
            <div className="card">
              <span>Users</span>
              <b>{stats.totalUsers}</b>
            </div>
            <div className="card">
              <span>Problems</span>
              <b>{stats.totalProblems}</b>
            </div>
            <div className="card">
              <span>Users without location</span>
              <b>{stats.usersWithoutLocation}%</b>
            </div>
          </div>

          <div className="card sync-row">
            <div>
              <b>Sync from Codeforces</b>
              <p className="subtitle" style={{ margin: 0 }}>
                Last sync: {stats.lastSync}
              </p>
            </div>
            <button className="btn" onClick={sync} disabled={syncing}>
              {syncing ? "Syncing…" : "Run sync now"}
            </button>
            {syncMsg && <p className="notice" style={{ width: "100%" }}>{syncMsg}</p>}
          </div>

          <div className="card table-wrap">
            <h3 className="section-title" style={{ marginTop: 0 }}>
              Sync history
            </h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Started</th>
                  <th>Fetched</th>
                  <th>Inserted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.syncLog.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.startedAt}</td>
                    <td>{s.fetched}</td>
                    <td>{s.inserted}</td>
                    <td className={s.status === "OK" ? "status-ok" : "status-failed"}>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
