import fs from "node:fs/promises";

const BASE = "data/codeforces/normalized";

async function load(filename) {
    const content = await fs.readFile(
        `${BASE}/${filename}`,
        "utf8"
    );

    return JSON.parse(content);
}

async function inspect() {

    const users = await load("users.json");
    const problems = await load("problems.json");
    const contests = await load("contests.json");
    const submissions = await load("submissions.json");

    console.log("\n========== DATASET INSPECTION ==========\n");

    console.log("USERS");
    console.log("Total:", users.length);
    console.log("Sample:", users[0]);

    console.log("\nPROBLEMS");
    console.log("Total:", problems.length);
    console.log("Sample:", problems[0]);

    console.log("\nCONTESTS");
    console.log("Total:", contests.length);
    console.log("Sample:", contests[0]);

    console.log("\nSUBMISSIONS");
    console.log("Total:", submissions.length);
    console.log("Sample:", submissions[0]);

    const verdicts = [
        ...new Set(submissions.map(s => s.verdict))
    ];

    console.log("\nVERDICT TYPES");
    console.log(verdicts);

    console.log("\n========== INSPECTION COMPLETE ==========");
}

inspect().catch(console.error);