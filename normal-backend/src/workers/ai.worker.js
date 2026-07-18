const { rabbitMqAiQueue } = require('../config/env');
const { createChannel, onReconnect } = require('../config/rabbitmq');
const { markAiFailed, processAiParsingJob } = require('../services/ai.service');
const logger = require('../utils/logger');

// Prevent worker process from crashing on unexpected errors
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Standalone AI Worker uncaught exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL: Standalone AI Worker unhandled rejection', reason);
});

let workerChannel = null;
let isConsuming = false;

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;
    try {
        job = JSON.parse(message.content.toString('utf8'));
        logger.info('Processing Groq AI parsing job', { job });

        if (!job.itemId) {
            throw new Error('AI queue message is missing itemId');
        }

        await processAiParsingJob({ itemId: job.itemId });
        channel.ack(message);
        logger.info(`Successfully completed AI parsing job for item ${job.itemId}`);
    } catch (error) {
        logger.error('Failed to process Groq AI parsing job', error, { job });

        if (job?.itemId) {
            try {
                await markAiFailed({ 
                    itemId: job.itemId, 
                    errorMessage: error.message || 'AI parsing failed' 
                });
                // Successfully updated database, acknowledge message
                channel.ack(message);
            } catch (updateError) {
                logger.error('Failed to mark AI parsing as failed in database, nacking with requeue', updateError, { itemId: job.itemId });
                // Requeue message to retry later when DB/network is up
                channel.nack(message, false, true);
            }
        } else {
            // Malformed message with no itemId - ack it to prevent infinite queue loops
            channel.ack(message);
        }
    }
}

async function startAiWorker() {
    try {
        logger.info('Initializing AI worker channel...');
        isConsuming = false;

        workerChannel = await createChannel(rabbitMqAiQueue);
        await workerChannel.prefetch(1);
        
        await workerChannel.consume(rabbitMqAiQueue, (message) => handleMessage(workerChannel, message), { noAck: false });
        isConsuming = true;

        logger.info(`Groq AI parsing worker consuming queue: ${rabbitMqAiQueue}`);
        return workerChannel;
    } catch (error) {
        logger.error('Unable to start Groq AI parsing worker', error);
        workerChannel = null;
        isConsuming = false;
        throw error;
    }
}

// Automatically restart worker when connection is restored
onReconnect(async () => {
    logger.info('RabbitMQ connection restored, restarting AI worker...');
    await startAiWorker();
});

if (require.main === module) {
    startAiWorker().catch((error) => {
        logger.error('Process startup error in AI worker', error);
        process.exit(1);
    });
}

module.exports = { startAiWorker };
