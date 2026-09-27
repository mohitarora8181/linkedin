const { rabbitMqGmailQueue } = require('../config/env');
const { createChannel, onReconnect } = require('../config/rabbitmq');
const { initializeDatabase } = require('../config/database');
const { markGmailSendFailed, queueEligibleAutoEmailsForEnabledUsers, sendItemEmail } = require('../services/gmail.service');
const logger = require('../utils/logger');

let workerChannel = null;

async function handleMessage(channel, message) {
    if (!message) return;

    let job = null;
    try {
        job = JSON.parse(message.content.toString('utf8'));
        if (!job.itemId || !job.userId) {
            logger.warn('Gmail job ignored: missing itemId or userId', { job });
            channel.ack(message);
            return;
        }

        const result = await sendItemEmail({ itemId: job.itemId, userId: job.userId, email: job.email, auto: job.auto === true });
        if (result.skipped) {
            logger.info(`Skipped queued automatic Gmail message because Auto Email is off for item ${job.itemId}`);
        } else {
            logger.info(`Successfully sent Gmail message for item ${job.itemId}`);
        }
        channel.ack(message);
    } catch (error) {
        logger.error('Failed to process Gmail send job', error, { itemId: job?.itemId });
        if (job?.itemId && job?.userId) {
            try {
                await markGmailSendFailed({
                    itemId: job.itemId,
                    userId: job.userId,
                    errorMessage: error.message || 'Gmail send failed'
                });
                channel.ack(message);
            } catch (updateError) {
                logger.error('Failed to mark Gmail job as failed; requeueing', updateError, { itemId: job.itemId });
                channel.nack(message, false, true);
            }
        } else {
            channel.ack(message);
        }
    }
}

async function startGmailWorker() {
    await initializeDatabase();
    await queueEligibleAutoEmailsForEnabledUsers();
    logger.info('Initializing Gmail send worker channel...');
    workerChannel = await createChannel(rabbitMqGmailQueue);
    await workerChannel.prefetch(1);
    await workerChannel.consume(rabbitMqGmailQueue, (message) => handleMessage(workerChannel, message), { noAck: false });
    logger.info(`Gmail send worker consuming queue: ${rabbitMqGmailQueue}`);
    return workerChannel;
}

onReconnect(async () => {
    logger.info('RabbitMQ connection restored, restarting Gmail send worker...');
    await startGmailWorker();
});

if (require.main === module) {
    startGmailWorker().catch((error) => {
        logger.error('Process startup error in Gmail worker', error);
        process.exit(1);
    });
}

module.exports = { startGmailWorker };
