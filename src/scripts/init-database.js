const { getDatabase, initializeDatabase } = require('../config/database');

async function main() {
    await initializeDatabase();
    const [tables] = await getDatabase().query('SHOW TABLES');
    const [itemColumns] = await getDatabase().query('SHOW COLUMNS FROM linkerin_items');
    console.log(`MySQL database is ready. Tables: ${tables.map((row) => Object.values(row)[0]).join(', ')}`);
    console.log(`linkerin_items columns: ${itemColumns.map((column) => column.Field).join(', ')}`);
    await getDatabase().end();
}

main().catch((error) => {
    console.error('Unable to initialize MySQL database:', error.message);
    process.exit(1);
});
