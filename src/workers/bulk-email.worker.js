const { rabbitMqBulkEmailQueue } = require('../config/env');
const { createChannel, onReconnect } = require('../config/rabbitmq');
const { initializeDatabase, getDatabase } = require('../config/database');
const {
    prepareBatch,
    processBatch,
    recoverBulkEmailBatches
} = require('../services/bulk-email.service');
const logger = require('../utils/logger');

let workerChannel = null;
let recoveryTimer = null;
let reconnectRegistered = false;

async function handleMessage(channel, message) {
    if (!message) return;
    let job;
    try {
        job = JSON.parse(message.content.toString('utf8'));
        if (!job.batchId || !job.userId || !['prepare', 'process'].includes(job.action)) {
            logger.warn('Bulk email job ignored because required fields are missing', { action: job.action });
            channel.ack(message);
            return;
        }

        if (job.action === 'prepare') {
            try {
                await prepareBatch(job);
            } catch (error) {
                logger.error('Bulk email template preparation failed', error, { batchId: job.batchId, userId: job.userId });
                await getDatabase().execute(
                    `UPDATE bulk_email_processor
                     SET status = 'failed', error_message = ?
                     WHERE batch_id = ? AND user_id = ? AND status = 'preparing'`,
                    [String(error.message || 'Unable to prepare bulk email template.').slice(0, 1000), job.batchId, job.userId]
                );
            }
        } else {
            await processBatch(job);
        }
        channel.ack(message);
    } catch (error) {
        logger.error('Bulk email queue job failed and will be retried', error, { batchId: job?.batchId });
        channel.nack(message, false, true);
    }
}

async function startBulkEmailWorker() {
    await initializeDatabase();
    workerChannel = await createChannel(rabbitMqBulkEmailQueue);
    await workerChannel.prefetch(1);
    await workerChannel.consume(
        rabbitMqBulkEmailQueue,
        (message) => handleMessage(workerChannel, message),
        { noAck: false }
    );
    if (!reconnectRegistered) {
        onReconnect(async () => {
            logger.info('RabbitMQ connection restored, restarting bulk email worker...');
            await startBulkEmailWorker();
        });
        reconnectRegistered = true;
    }
    if (!recoveryTimer) {
        recoveryTimer = setInterval(() => {
            recoverBulkEmailBatches().catch((error) => {
                logger.error('Bulk email recovery scan failed', error);
            });
        }, 5_000);
        recoveryTimer.unref?.();
    }
    logger.info(`Bulk email worker consuming queue: ${rabbitMqBulkEmailQueue}`);
    return workerChannel;
}

if (require.main === module) {
    startBulkEmailWorker().catch((error) => {
        logger.error('Bulk email worker startup failed', error);
        process.exit(1);
    });
}

module.exports = { startBulkEmailWorker };
