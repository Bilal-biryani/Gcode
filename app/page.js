"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import RegionPanel from "../components/RegionPanel";

// The globe needs the browser (WebGL), so skip it during server rendering
const GlobeView = dynamic(() => import("../components/GlobeView"), { ssr: false });

export default function GlobePage() {
  const [regions, setRegions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  // Load the dots, then refresh every minute so new cities appear while the page is open
  useEffect(() => {
    const load = () =>
      fetch("/api/regions")
        .then(async (res) => (res.ok ? res.json() : Promise.reject((await res.json()).error)))
        .then((data) => {
          setRegions(data);
          setError("");
          // keep the open panel's headline numbers in step with the new data
          setSelected((current) => (current ? data.find((r) => r.id === current.id) ?? current : null));
        })
        .catch((message) => setError(message || "Could not load regions from /api/regions"));

    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
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
          {regions.length} cities with activity
        </div>
        <div>Bigger dot = more submissions</div>
      </div>

      {selected && <RegionPanel region={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
