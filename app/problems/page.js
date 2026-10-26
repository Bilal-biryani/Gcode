"use client";

import { useEffect, useState } from "react";

export default function ProblemsPage() {
  const [problems, setProblems] = useState([]);
  const [tags, setTags] = useState([]);
  const [filters, setFilters] = useState({ search: "", tag: "", minRating: "", maxRating: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Tag list for the dropdown
  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then(setTags)
      .catch(() => {});
  }, []);

  // Re-fetch whenever a filter changes. The filtering itself happens in the backend.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      fetch(`/api/problems?${params}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
        .then(setProblems)
        .catch(() => setError("Could not load problems."))
        .finally(() => setLoading(false));
    }, 250); // small wait so we don't call the API on every keystroke
    return () => clearTimeout(timer);
  }, [filters]);

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <main className="page">
      <h1>Problems</h1>
      <p className="subtitle">Codeforces problems collected so far</p>

      <div className="filters">
        <input className="input" placeholder="Search by name…" value={filters.search} onChange={set("search")} />
        <select className="input" value={filters.tag} onChange={set("tag")}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input className="input" type="number" placeholder="Min rating" step="100" value={filters.minRating} onChange={set("minRating")} />
        <input className="input" type="number" placeholder="Max rating" step="100" value={filters.maxRating} onChange={set("maxRating")} />
      </div>

      <div className="card table-wrap">
        {error && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Rating</th>
              <th>Tags</th>
              <th>Solved</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>
                  <a
                    href={`https://codeforces.com/problemset/problem/${p.id.match(/^\d+/)}/${p.id.replace(/^\d+/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.name}
                  </a>
                </td>
                <td>{p.rating ?? "–"}</td>
                <td>
                  {p.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </td>
                <td>{p.solvedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && problems.length === 0 && !error && <p className="subtitle">No problems match these filters.</p>}
      </div>
    </main>
  );
}
