"use client";

import { useEffect, useState } from "react";

// Horizontal bar chart rows: [{ name, count }]
function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => (
    <div className="bar-row" key={r.name}>
      <span title={r.name}>{r.name}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
      </div>
      <b>{r.count}</b>
    </div>
  ));
}

export default function RegionPanel({ region, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  // Every time a new dot is clicked, ask the backend for that region's details
  useEffect(() => {
    setDetail(null);
    setError("");
    fetch(`/api/regions/${region.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setDetail)
      .catch(() => setError("Could not load this region."));
  }, [region.id]);

  const solvedPct = Math.round((region.solved / Math.max(1, region.submissions)) * 100);

  return (
    <aside className="side-panel">
      <div className="panel-head">
        <div>
          <h2>{region.city}</h2>
          <p>{region.country}</p>
        </div>
        <button className="btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <b>{region.submissions}</b>
          <span>submissions</span>
        </div>
        <div className="stat">
          <b>{region.users}</b>
          <span>users</span>
        </div>
        <div className="stat">
          <b>{solvedPct}%</b>
          <span>accepted</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!detail && !error && <p className="subtitle">Loading…</p>}

      {detail && (
        <>
          <h3 className="section-title">Top topics</h3>
          <Bars rows={detail.topTags} />

          <h3 className="section-title">Verdicts</h3>
          <Bars rows={detail.verdicts} />

          <h3 className="section-title">Most solved problems</h3>
          <ul className="problem-list">
            {detail.topProblems.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name} <small>{p.id}</small>
                </span>
                <small>{p.rating ?? "unrated"}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
