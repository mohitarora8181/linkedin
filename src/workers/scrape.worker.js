const { createChannel, onReconnect, rabbitMqQueue } = require('../config/rabbitmq');
const { getDatabase, initializeDatabase } = require('../config/database');
const { scrapeLinkedInUrl } = require('../services/scrape.service');
const { queueAiParsing } = require('../services/ai-queue.service');
const { hashSourceUrl } = require('../utils/database');
const env = require('../config/env');
const logger = require('../utils/logger');

let workerChannel = null;
let isConsuming = false;

function searchableFieldsForItem({ content, itemType }) {
    if (itemType === 'post') {
        return {
            author_name: content?.author?.name ?? null,
            post_content: content?.content ?? null,
            job_title: null,
            company_name: null,
            location: null
        };
    }

    return {
        author_name: null,
        post_content: null,
        job_title: content?.title ?? null,
        company_name: content?.company?.name ?? null,
        location: content?.location ?? null
    };
}

async function markItemFailed({ itemId, errorMessage }) {
    try {
        await getDatabase().execute('UPDATE linkerin_items SET is_pending = FALSE, scrape_error = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [errorMessage, itemId]);
        logger.info(`Marked item ${itemId} as failed in database`, { errorMessage });
    } catch (err) {
        logger.error(`Failed to mark item ${itemId} as failed in MySQL`, err);
        throw err;
    }
}

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;
    try {
        job = JSON.parse(message.content.toString('utf8'));
        logger.info('Processing scrape job', { job });

        const { itemId, sourceUrl, itemType, userId } = job;

        if (!itemId || !sourceUrl) {
            logger.warn('Job ignored: missing itemId or sourceUrl in payload', { job });
            channel.ack(message);
            return;
        }

        // 1. Perform scraping (no read DB query needed, parameters are in job payload!)
        let content = null;
        let resolvedItemType = itemType;
        let resolvedSourceUrl = sourceUrl;
        let scrapeError = null;

        try {
            const result = await scrapeLinkedInUrl(sourceUrl);
            content = result.content;
            resolvedItemType = result.itemType;
            resolvedSourceUrl = result.sourceUrl;
        } catch (err) {
            scrapeError = err.message || 'Scraping failed';
        }

        if (scrapeError) {
            await markItemFailed({ itemId, errorMessage: scrapeError });
            channel.ack(message);
            return;
        }

        // 2. Update database directly
        const fields = searchableFieldsForItem({ content, itemType: resolvedItemType });
        await getDatabase().execute('UPDATE linkerin_items SET source_url = ?, source_url_hash = ?, item_type = ?, content = ?, is_pending = FALSE, scrape_error = NULL, author_name = ?, post_content = ?, job_title = ?, company_name = ?, location = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [resolvedSourceUrl, hashSourceUrl(resolvedSourceUrl), resolvedItemType, JSON.stringify(content), ...Object.values(fields), itemId]);
        const [rows] = await getDatabase().execute('SELECT * FROM linkerin_items WHERE id = ?', [itemId]);
        const updatedItem = rows[0];
        logger.info(`Successfully scraped and updated item ${itemId}`);

        // 3. Queue AI job directly
        await queueAiParsing(updatedItem);

        channel.ack(message);
    } catch (error) {
        logger.error('Failed to process scrape job', error, { job });

        if (job?.itemId) {
            try {
                await markItemFailed({
                    itemId: job.itemId,
                    errorMessage: error.message || 'Scraping failed'
                });
                channel.ack(message);
            } catch (dbUpdateError) {
                logger.error('Could not update DB with scrape error, nacking message with requeue', dbUpdateError);
                channel.nack(message, false, true);
            }
        } else {
            channel.ack(message);
        }
    }
}

async function startWorker() {
    try {
        await initializeDatabase();
        logger.info('Initializing scrape worker channel...');
        isConsuming = false;
        
        workerChannel = await createChannel(rabbitMqQueue);
        await workerChannel.prefetch(env.scrapeConcurrency);
        
        await workerChannel.consume(rabbitMqQueue, (message) => handleMessage(workerChannel, message), { noAck: false });
        isConsuming = true;

        logger.info(`LinkedIn scrape worker consuming queue: ${rabbitMqQueue}`);
        return workerChannel;
    } catch (error) {
        logger.error('Unable to start LinkedIn scrape worker', error);
        workerChannel = null;
        isConsuming = false;
        throw error;
    }
}

// Register reconnect handler to restart worker when connection is restored
onReconnect(async () => {
    logger.info('RabbitMQ connection restored, restarting scrape worker...');
    await startWorker();
});

if (require.main === module) {
    process.on('uncaughtException', (err) => {
        logger.error('CRITICAL: Scrape worker uncaught exception', err);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('CRITICAL: Scrape worker unhandled rejection', reason);
    });

    startWorker().catch((error) => {
        logger.error('Process startup error in scrape worker', error);
        process.exit(1);
    });
}

module.exports = { startWorker };
