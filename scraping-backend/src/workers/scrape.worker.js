const { createChannel, onReconnect, rabbitMqExchange, rabbitMqQueue } = require('../config/rabbitmq');
const { getSupabase } = require('../config/supabase');
const { scrapeLinkedInUrl } = require('../services/scrape.service');
const env = require('../config/env');
const logger = require('../utils/logger');

// Prevent worker process from crashing on unexpected errors
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Standalone Scrape Worker uncaught exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL: Standalone Scrape Worker unhandled rejection', reason);
});

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
        const supabase = getSupabase();
        const { error } = await supabase
            .from('linkerin_items')
            .update({
                is_pending: false,
                scrape_error: errorMessage,
                updated_at: new Date().toISOString()
            })
            .eq('id', itemId);

        if (error) throw error;
        logger.info(`Marked item ${itemId} as failed in database`, { errorMessage });
    } catch (err) {
        logger.error(`Failed to mark item ${itemId} as failed in Supabase`, err);
        throw err;
    }
}

async function markAiQueued({ itemId }) {
    try {
        const supabase = getSupabase();
        const { error } = await supabase
            .from('linkerin_items')
            .update({
                ai_status: 'queued',
                ai_error: null,
                ai_mail: null,
                is_job_related: null,
                recruiter_email: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', itemId);

        if (error) throw error;
    } catch (err) {
        logger.error(`Failed to mark item ${itemId} AI status as queued`, err);
        throw err;
    }
}

async function publishAiParsingJob(job) {
    let channel = null;
    try {
        channel = await createChannel(env.rabbitMqAiQueue);
        const didPublish = channel.publish(
            rabbitMqExchange,
            env.rabbitMqAiQueue,
            Buffer.from(JSON.stringify(job)),
            {
                contentType: 'application/json',
                deliveryMode: 2,
                persistent: true
            }
        );

        if (!didPublish) {
            throw new Error('RabbitMQ publish buffer is full.');
        }
        logger.info(`Successfully published AI job to ${env.rabbitMqAiQueue}`, { itemId: job.itemId });
    } catch (err) {
        logger.error('Failed to publish AI parsing job to RabbitMQ', err);
        throw err;
    } finally {
        if (channel) {
            try {
                await channel.close();
            } catch (e) {
                // Ignore
            }
        }
    }
}

async function queueAiParsing({ id, item_type, user_id }) {
    await markAiQueued({ itemId: id });

    try {
        await publishAiParsingJob({
            itemId: id,
            itemType: item_type,
            userId: user_id
        });
    } catch (error) {
        logger.error('Failed to queue AI mail generation job', error, { itemId: id });
        try {
            const supabase = getSupabase();
            await supabase
                .from('linkerin_items')
                .update({
                    ai_status: 'failed',
                    ai_error: 'Unable to queue AI mail generation. Try again later.',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
        } catch (dbErr) {
            logger.error('Failed to update DB AI status after queue publish failure', dbErr);
        }
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

        const supabase = getSupabase();

        // 1. Perform scraping (no read DB query needed, parameters are in job payload!)
        let content = null;
        let scrapeError = null;

        try {
            content = await scrapeLinkedInUrl(sourceUrl);
        } catch (err) {
            scrapeError = err.message || 'Scraping failed';
        }

        if (scrapeError) {
            await markItemFailed({ itemId, errorMessage: scrapeError });
            channel.ack(message);
            return;
        }

        // 2. Update database directly
        const { data: updatedItem, error: updateError } = await supabase
            .from('linkerin_items')
            .update({
                content,
                is_pending: false,
                scrape_error: null,
                updated_at: new Date().toISOString(),
                ...searchableFieldsForItem({ content, itemType })
            })
            .eq('id', itemId)
            .select()
            .single();

        if (updateError) throw updateError;
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
    startWorker().catch((error) => {
        logger.error('Process startup error in scrape worker', error);
        process.exit(1);
    });
}

module.exports = { startWorker, queueAiParsing };
