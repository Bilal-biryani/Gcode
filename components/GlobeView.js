"use client";

// The 3D globe. react-globe.gl uses WebGL, which only exists in the browser,
// so app/page.js loads this file with dynamic(..., { ssr: false }).

import Globe from "react-globe.gl";
import { useEffect, useRef, useState } from "react";

export default function GlobeView({ regions, selected, onSelect, flyTo }) {
  const globeRef = useRef();
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Fill the whole window and follow resizes
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Slow auto-rotate until the user picks a dot
  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = !selected;
    controls.autoRotateSpeed = 0.35;
  }, [selected, size]);

  // Move the camera to a region when the search box asks for it
  useEffect(() => {
    if (flyTo) {
      globeRef.current?.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: 1.4 }, 1200);
    }
  }, [flyTo]);

  // Bigger dot = more submissions (square root so big cities don't swallow the map)
  const max = Math.max(1, ...regions.map((r) => r.submissions));
  const radius = (r) => 0.25 + Math.sqrt(r.submissions / max) * 0.6;

  if (!size.width) return null;

  return (
    <Globe
      ref={globeRef}
      width={size.width}
      height={size.height}
      globeImageUrl="/textures/earth-dark.jpg"
      bumpImageUrl="/textures/earth-topology.png"
      backgroundImageUrl="/textures/night-sky.png"
      atmosphereColor="#3ddc84"
      atmosphereAltitude={0.12}
      pointsData={regions}
      pointLat="lat"
      pointLng="lng"
      pointRadius={radius}
      pointAltitude={(r) => (selected?.id === r.id ? 0.04 : 0.01)}
      pointColor={(r) => (selected?.id === r.id ? "#ffffff" : "#3ddc84")}
      pointLabel={(r) =>
        `<div class="globe-tooltip"><b>${r.city}</b>, ${r.country}<br/>${r.submissions} submissions</div>`
      }
      onPointClick={(r) => {
        onSelect(r);
        globeRef.current?.pointOfView({ lat: r.lat, lng: r.lng, altitude: 1.4 }, 1000);
      }}
      ringsData={selected ? [selected] : []}
      ringLat="lat"
      ringLng="lng"
      ringColor={() => (t) => `rgba(61, 220, 132, ${1 - t})`}
      ringMaxRadius={4}
      ringPropagationSpeed={2}
      ringRepeatPeriod={900}
    />
  );
}
