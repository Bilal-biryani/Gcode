"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import RegionPanel from "@/components/RegionPanel";

// The globe needs the browser (WebGL), so skip it during server rendering
const GlobeView = dynamic(() => import("@/components/GlobeView"), { ssr: false });

export default function GlobePage() {
  const [regions, setRegions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  // Load all the dots once, from the backend
  useEffect(() => {
    fetch("/api/regions")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setRegions)
      .catch(() => setError("Could not load regions from /api/regions"));
  }, []);

  const matches = query
    ? regions
        .filter((r) => `${r.city} ${r.country}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];

  const choose = (region) => {
    setSelected(region);
    setFlyTo(region);
    setQuery("");
  };

  return (
    <main className="globe-page">
      <GlobeView regions={regions} selected={selected} onSelect={setSelected} flyTo={flyTo} />

      <div className="globe-search">
        <input
          className="input"
          placeholder="Search a city or country…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <div className="search-results">
            {matches.map((r) => (
              <button key={r.id} onClick={() => choose(r)}>
                {r.city} <small>{r.country}</small>
              </button>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="globe-legend">
        <div>
          <span className="dot" />
          {regions.length} regions with activity
        </div>
        <div>Bigger dot = more submissions</div>
      </div>

      {selected && <RegionPanel region={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
