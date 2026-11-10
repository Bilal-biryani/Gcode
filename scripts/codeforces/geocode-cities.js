import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const INPUT = "data/codeforces/normalized/users.json";
const OUTPUT = "data/codeforces/normalized/city_coordinates.json";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const normalize = value =>
    value.trim().toLowerCase().replace(/\s+/g, " ");

export async function geocodeCity(city, country) {
    const query = `${city}, ${country}`;

    const url = new URL("https://nominatim.openstreetmap.org/search");

    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
        headers: {
            "User-Agent": "GCode-Student-Project/1.0"
        }
    });

    if (!response.ok) {
        throw new Error(`Geocoding failed: HTTP ${response.status}`);
    }

    const results = await response.json();

    if (results.length === 0) {
        return null;
    }

    const result = results[0];

    return {
        city,
        country,
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        displayName: result.display_name
    };
}

async function main() {
    const users = JSON.parse(await fs.readFile(INPUT, "utf8"));

    // Extract unique city-country combinations.
    const cities = new Map();

    for (const user of users) {
        if (!user.city || !user.country) continue;

        const city = user.city.trim();
        const country = user.country.trim();

        if (!city || !country) continue;

        const key = `${normalize(city)}|${normalize(country)}`;

        if (!cities.has(key)) {
            cities.set(key, { city, country });
        }
    }

    console.log(`Unique city-country pairs: ${cities.size}`);

    const coordinates = [];

    for (const [index, place] of [...cities.values()].entries()) {
        console.log(
            `[${index + 1}/${cities.size}] ${place.city}, ${place.country}`
        );

        try {
            const result = await geocodeCity(place.city, place.country);

            if (result) {
                coordinates.push(result);
                console.log("  Found:", result.latitude, result.longitude);
            } else {
                console.log("  No result found");
            }
        } catch (error) {
            console.log("  Failed:", error.message);
        }

        // One request per second maximum.
        if (index < cities.size - 1) {
            await sleep(1100);
        }
    }

    await fs.writeFile(
        OUTPUT,
        JSON.stringify(coordinates, null, 2)
    );

    console.log(`\nSaved ${coordinates.length} locations to ${OUTPUT}`);
}

// only when run as  node scripts/codeforces/geocode-cities.js  (the live sync imports geocodeCity)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(console.error);
}