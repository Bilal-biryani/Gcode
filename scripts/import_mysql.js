
import fs from "node:fs/promises";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: ".env.local" });

const DATA = "data/codeforces/normalized";

async function readJSON(filename) {
    return JSON.parse(
        await fs.readFile(`${DATA}/${filename}`, "utf8")
    );
}

function toMySQLDate(isoDate) {
    if (!isoDate) return null;
    return new Date(isoDate).toISOString().slice(0, 19)
        .replace("T", " ");
}

function key(value) {
    return value?.trim().toLowerCase() ?? "";
}

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5
    });

    const db = await pool.getConnection();

    try {
        // Load collected datasets
        const users = await readJSON("users.json");
        const problems = await readJSON("problems.json");
        const contests = await readJSON("contests.json");
        const submissions = await readJSON("submissions.json");
        const locations = await readJSON("city_coordinates.json");

        console.log("Datasets loaded.");

        await db.query("SET time_zone = '+00:00'");
        await db.beginTransaction();

        // ------------------------------------------------
        // 1. PLATFORM
        // ------------------------------------------------

        await db.execute(
            `INSERT INTO platform (name)
             VALUES (?)
             ON DUPLICATE KEY UPDATE
             platform_id = LAST_INSERT_ID(platform_id)`,
            ["Codeforces"]
        );

        const [platformRows] = await db.execute(
            "SELECT platform_id FROM platform WHERE name = ?",
            ["Codeforces"]
        );

        const platformId = platformRows[0].platform_id;

        console.log("Platform ready:", platformId);

        // ------------------------------------------------
        // 2. COUNTRIES
        // ------------------------------------------------

        const countryIds = new Map();

        const countryNames = new Set([
            ...users.map(u => u.country).filter(Boolean),
            ...locations.map(l => l.country).filter(Boolean)
        ]);

        for (const country of countryNames) {
            const [result] = await db.execute(
                `INSERT INTO country (name)
                 VALUES (?)
                 ON DUPLICATE KEY UPDATE
                 country_id = LAST_INSERT_ID(country_id)`,
                [country]
            );

            countryIds.set(country, result.insertId);
        }

        console.log("Countries imported:", countryIds.size);

        // ------------------------------------------------
        // 3. CITIES AND ALIASES
        // ------------------------------------------------

        const cityIds = new Map();

        for (const location of locations) {
            const countryId = countryIds.get(location.country);

            if (!countryId) continue;

            const [result] = await db.execute(
                `INSERT INTO city
                 (country_id, name, latitude, longitude)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 city_id = LAST_INSERT_ID(city_id)`,
                [
                    countryId,
                    location.city,
                    location.latitude,
                    location.longitude
                ]
            );

            const cityId = result.insertId;

            cityIds.set(
                `${key(location.city)}|${key(location.country)}`,
                cityId
            );

            await db.execute(
                `INSERT IGNORE INTO city_alias
                 (raw_text, country_id, city_id)
                 VALUES (?, ?, ?)`,
                [location.city, countryId, cityId]
            );
        }

        console.log("Cities imported:", cityIds.size);

        // ------------------------------------------------
        // 4. PLATFORM ACCOUNTS
        // ------------------------------------------------

        const accountIds = new Map();

        for (const user of users) {
            const countryId = user.country
                ? countryIds.get(user.country) ?? null
                : null;

            const cityId = user.city && user.country
                ? cityIds.get(
                    `${key(user.city)}|${key(user.country)}`
                ) ?? null
                : null;

            let locationStatus = "UNKNOWN";

            if (cityId) {
                locationStatus = "CITY_RESOLVED";
            } else if (user.city) {
                locationStatus = "UNRESOLVED";
            } else if (countryId) {
                locationStatus = "COUNTRY_ONLY";
            }

            const [result] = await db.execute(
                `INSERT INTO platform_account
                 (platform_id, handle, raw_city, raw_country,
                  city_id, country_id, location_status,
                  rating, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 account_id = LAST_INSERT_ID(account_id),
                 raw_city = VALUES(raw_city),
                 raw_country = VALUES(raw_country),
                 city_id = VALUES(city_id),
                 country_id = VALUES(country_id),
                 location_status = VALUES(location_status),
                 rating = VALUES(rating),
                 last_synced_at = VALUES(last_synced_at)`,
                [
                    platformId,
                    user.handle,
                    user.city,
                    user.country,
                    cityId,
                    countryId,
                    locationStatus,
                    user.rating,
                    toMySQLDate(user.lastOnlineTime)
                ]
            );

            accountIds.set(user.handle, result.insertId);
        }

        console.log("Accounts imported:", accountIds.size);

        // ------------------------------------------------
        // 5. CONTESTS
        // ------------------------------------------------

        const contestIds = new Map();

        for (const contest of contests) {
            const [result] = await db.execute(
                `INSERT INTO contest
                 (platform_id, external_id, name, start_time)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 contest_id = LAST_INSERT_ID(contest_id),
                 name = VALUES(name),
                 start_time = VALUES(start_time)`,
                [
                    platformId,
                    contest.externalId,
                    contest.name,
                    toMySQLDate(contest.startTime)
                ]
            );

            contestIds.set(contest.externalId, result.insertId);
        }

        console.log("Contests imported:", contestIds.size);

        // ------------------------------------------------
        // 6. PROBLEMS
        // ------------------------------------------------

        const problemIds = new Map();

        async function importProblem(problem) {
            if (problemIds.has(problem.externalKey)) {
                return problemIds.get(problem.externalKey);
            }

            const contestId = problem.contestExternalId
                ? contestIds.get(problem.contestExternalId) ?? null
                : null;

            const [result] = await db.execute(
                `INSERT INTO problem
                 (platform_id, contest_id, external_key, name, rating)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 problem_id = LAST_INSERT_ID(problem_id),
                 contest_id = VALUES(contest_id),
                 name = VALUES(name),
                 rating = VALUES(rating)`,
                [
                    platformId,
                    contestId,
                    problem.externalKey,
                    problem.name,
                    problem.rating
                ]
            );

            const problemId = result.insertId;
            problemIds.set(problem.externalKey, problemId);

            // Import tags and their relationships
            for (const tag of problem.tags ?? []) {
                const [tagResult] = await db.execute(
                    `INSERT INTO tag (name)
                     VALUES (?)
                     ON DUPLICATE KEY UPDATE
                     tag_id = LAST_INSERT_ID(tag_id)`,
                    [tag]
                );

                await db.execute(
                    `INSERT IGNORE INTO problem_tag
                     (problem_id, tag_id)
                     VALUES (?, ?)`,
                    [problemId, tagResult.insertId]
                );
            }

            return problemId;
        }

        for (const problem of problems) {
            await importProblem(problem);
        }

        console.log("Problems imported:", problemIds.size);

        // ------------------------------------------------
        // 7. VERDICTS
        // ------------------------------------------------

        const verdictIds = new Map();

        const verdictCodes = [
            ["OK", true],
            ["WRONG_ANSWER", false],
            ["TIME_LIMIT_EXCEEDED", false],
            ["MEMORY_LIMIT_EXCEEDED", false],
            ["RUNTIME_ERROR", false],
            ["COMPILATION_ERROR", false],
            ["IDLENESS_LIMIT_EXCEEDED", false],
            ["PRESENTATION_ERROR", false],
            ["CHALLENGED", false],
            ["SKIPPED", false],
            ["PARTIAL", false],
            ["REJECTED", false],
            ["FAILED", false],
            ["CRASHED", false],
            ["SECURITY_VIOLATED", false],
            ["INPUT_PREPARATION_CRASHED", false]
        ];

        for (const [code, accepted] of verdictCodes) {
            const [result] = await db.execute(
                `INSERT INTO verdict (code, is_accepted)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE
                 verdict_id = LAST_INSERT_ID(verdict_id)`,
                [code, accepted]
            );

            verdictIds.set(code, result.insertId);
        }

        // ------------------------------------------------
        // 8. SUBMISSIONS
        // ------------------------------------------------

        let importedSubmissions = 0;
        let skippedSubmissions = 0;

        for (const submission of submissions) {
            // Ignore non-final verdicts
            if (!submission.verdict ||
                submission.verdict === "TESTING") {
                skippedSubmissions++;
                continue;
            }

            // Our current schema supports one account per submission.
            const handle = submission.participants?.[0];
            const accountId = accountIds.get(handle);

            if (!accountId) {
                skippedSubmissions++;
                continue;
            }

            let problemId = problemIds.get(
                submission.problemExternalKey
            );

            // A submission may reference a problem missing
            // from the main problemset response.
            if (!problemId && submission.problem) {
                problemId = await importProblem(submission.problem);
            }

            if (!problemId) {
                skippedSubmissions++;
                continue;
            }

            // Support newly encountered verdict codes.
            let verdictId = verdictIds.get(submission.verdict);

            if (!verdictId) {
                const [result] = await db.execute(
                    `INSERT INTO verdict (code, is_accepted)
                     VALUES (?, FALSE)
                     ON DUPLICATE KEY UPDATE
                     verdict_id = LAST_INSERT_ID(verdict_id)`,
                    [submission.verdict]
                );

                verdictId = result.insertId;
                verdictIds.set(submission.verdict, verdictId);
            }

            await db.execute(
                `INSERT INTO submission
                 (platform_id, external_id, account_id,
                  problem_id, verdict_id, language, submitted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 submission_id = LAST_INSERT_ID(submission_id)`,
                [
                    platformId,
                    submission.externalId,
                    accountId,
                    problemId,
                    verdictId,
                    submission.language,
                    toMySQLDate(submission.submittedAt)
                ]
            );

            importedSubmissions++;
        }

        // Commit all imported records
        await db.commit();

        // Rebuild city statistics after all accounts and submissions
        // have been imported. The procedure manages its own transaction.
        await db.query("CALL sp_rebuild_city_stats()");

        console.log("\n========== IMPORT COMPLETED ==========");
        console.log("Countries:", countryIds.size);
        console.log("Cities:", cityIds.size);
        console.log("Accounts:", accountIds.size);
        console.log("Contests:", contestIds.size);
        console.log("Problems:", problemIds.size);
        console.log("Submissions processed:", importedSubmissions);
        console.log("Submissions skipped:", skippedSubmissions);

    } catch (error) {
        await db.rollback();
        console.error("IMPORT FAILED:", error);
    } finally {
        db.release();
        await pool.end();
    }
}

main().catch(console.error);
