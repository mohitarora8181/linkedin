const { initializeDatabase, getDatabase } = require('../config/database');
const { listItemsForUser } = require('../services/item.service');

async function main() {
    await initializeDatabase();
    const result = await listItemsForUser({ userId: '00000000-0000-0000-0000-000000000000', limit: 20 });
    console.log(`Items query is ready. Returned ${result.items.length} item(s).`);
    await getDatabase().end();
}

main().catch((error) => {
    console.error('Items query verification failed:', error.message);
    process.exit(1);
});
