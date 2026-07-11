const { createChannel, rabbitMqQueue } = require('../config/rabbitmq');
const { markAiFailed, markAiQueued } = require('../services/ai.service');
const { publishAiParsingJob } = require('../services/queue.service');
const { completeQueuedItem, markItemFailed } = require('../services/item.service');

let workerPromise = null;

async function queueAiParsing(item) {
    await markAiQueued({ itemId: item.id });

    try {
        await publishAiParsingJob({
            itemId: item.id,
            itemType: item.item_type,
            userId: item.user_id
        });
    } catch (error) {
        await markAiFailed({
            errorMessage: 'Unable to queue AI mail generation. Try again later.',
            itemId: item.id
        });
        console.error('Failed to queue AI mail generation', {
            error: error.message,
            itemId: item.id
        });
    }
}

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;

    try {
        job = JSON.parse(message.content.toString('utf8'));

        if (!job.itemId) {
            throw new Error('Queue message is missing itemId');
        }

        const item = await completeQueuedItem({ itemId: job.itemId });
        await queueAiParsing(item);
        channel.ack(message);
    } catch (error) {
        console.error('Failed to process LinkerIn scrape job', {
            error: error.message,
            job
        });

        if (job?.itemId) {
            try {
                await markItemFailed({
                    errorMessage: error.message || 'Scraping failed',
                    itemId: job.itemId
                });
            } catch (updateError) {
                console.error('Failed to mark LinkerIn item as failed', {
                    error: updateError.message,
                    itemId: job.itemId
                });
                channel.nack(message, false, true);
                return;
            }
        }

        channel.ack(message);
    }
}

async function startWorker() {
    if (workerPromise) {
        return workerPromise;
    }

    workerPromise = (async () => {
        const channel = await createChannel(rabbitMqQueue);
        await channel.prefetch(1);
        await channel.consume(rabbitMqQueue, (message) => handleMessage(channel, message), { noAck: false });

        console.log(`LinkerIn scrape worker consuming queue: ${rabbitMqQueue}`);
        return channel;
    })().catch((error) => {
        workerPromise = null;
        throw error;
    });

    return workerPromise;
}

if (require.main === module) {
    startWorker().catch((error) => {
        console.error('Unable to start LinkerIn scrape worker', error);
        process.exit(1);
    });
}

module.exports = { startWorker };

