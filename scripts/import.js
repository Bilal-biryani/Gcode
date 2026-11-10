import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: ".env.local" });

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        await connection.execute(
            `INSERT INTO platform (name)
             VALUES (?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)`,
            ["Codeforces"]
        );

        const [rows] = await connection.execute(
            "SELECT * FROM platform"
        );

        console.log("Platform records:");
        console.table(rows);

    } finally {
        await connection.end();
    }
}

main().catch(console.error);