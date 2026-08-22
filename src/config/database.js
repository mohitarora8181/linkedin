const mysql = require('mysql2/promise');
const env = require('./env');
const { columnMigrations, schemaStatements } = require('./schema');

let pool;
let initialization;

function connectionOptions(includeDatabase = true) {
    return {
        host: env.mysqlHost,
        port: env.mysqlPort,
        ...(includeDatabase ? { database: env.mysqlDatabase } : {}),
        user: env.mysqlUser,
        password: env.mysqlPassword,
        ssl: env.mysqlSsl ? {} : undefined,
        timezone: 'Z'
    };
}

function validateConfig() {
    if (!env.mysqlHost || !env.mysqlDatabase || !env.mysqlUser || !env.mysqlPassword) {
        throw new Error('MySQL configuration is missing. Set MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD.');
    }

    if (!/^[A-Za-z0-9_]+$/.test(env.mysqlDatabase)) {
        throw new Error('MYSQL_DATABASE may only contain letters, numbers, and underscores.');
    }
}

function getDatabase() {
    if (!pool) {
        validateConfig();
        pool = mysql.createPool({
            ...connectionOptions(),
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            timezone: 'Z'
        });
    }

    return pool;
}

async function initializeDatabase() {
    if (!initialization) {
        initialization = (async () => {
            validateConfig();
            const connection = await mysql.createConnection(connectionOptions(false));

            try {
                await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.mysqlDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            } finally {
                await connection.end();
            }

            const database = getDatabase();
            for (const statement of schemaStatements) {
                await database.query(statement);
            }

            for (const [tableName, columns] of Object.entries(columnMigrations)) {
                const [existingColumns] = await database.query(`SHOW COLUMNS FROM \`${tableName}\``);
                const existingNames = new Set(existingColumns.map((column) => column.Field));

                for (const [columnName, definition] of Object.entries(columns)) {
                    if (!existingNames.has(columnName)) {
                        await database.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
                    }
                }
            }
        })().catch((error) => {
            initialization = null;
            throw error;
        });
    }

    return initialization;
}

module.exports = { getDatabase, initializeDatabase };
