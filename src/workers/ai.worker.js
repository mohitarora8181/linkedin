const { rabbitMqAiQueue } = require('../config/env');
const { createChannel } = require('../config/rabbitmq');
const { markAiFailed, processAiParsingJob } = require('../services/ai.service');

let workerPromise = null;

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;

    try {
        job = JSON.parse(message.content.toString('utf8'));
        if (!job.itemId) throw new Error('AI queue message is missing itemId');

        await processAiParsingJob({ itemId: job.itemId });
        channel.ack(message);
    } catch (error) {
        console.error('Failed to process Groq AI parsing job', {
            error: error.message,
            job
        });

        if (job?.itemId) {
            try {
                await markAiFailed({ itemId: job.itemId, errorMessage: error.message || 'AI parsing failed' });
            } catch (updateError) {
                console.error('Failed to mark AI parsing failed', {
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

async function startAiWorker() {
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
        const channel = await createChannel(rabbitMqAiQueue);
        await channel.prefetch(1);
        await channel.consume(rabbitMqAiQueue, (message) => handleMessage(channel, message), { noAck: false });

        console.log(`Groq AI parsing worker consuming queue: ${rabbitMqAiQueue}`);
        return channel;
    })().catch((error) => {
        workerPromise = null;
        throw error;
    });

    return workerPromise;
}

if (require.main === module) {
    startAiWorker().catch((error) => {
        console.error('Unable to start Groq AI parsing worker', error);
        process.exit(1);
    });
}

module.exports = { startAiWorker };
