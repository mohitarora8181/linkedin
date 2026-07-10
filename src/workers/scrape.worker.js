const { createChannel, rabbitMqQueue } = require('../config/rabbitmq');
const { completeQueuedItem, markItemFailed } = require('../services/item.service');

let workerPromise = null;

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;

    try {
        job = JSON.parse(message.content.toString('utf8'));

        if (!job.itemId) {
            throw new Error('Queue message is missing itemId');
        }

        await completeQueuedItem({ itemId: job.itemId });
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
        const channel = await createChannel();
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

