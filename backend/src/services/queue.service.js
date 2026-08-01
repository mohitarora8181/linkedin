const { rabbitMqAiQueue, rabbitMqQueue } = require('../config/env');
const { createChannel, rabbitMqExchange } = require('../config/rabbitmq');
const logger = require('../utils/logger');

async function publishJob(queueName, job) {
    let channel = null;
    try {
        channel = await createChannel(queueName);
        const didPublish = channel.publish(
            rabbitMqExchange,
            queueName,
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
        logger.info(`Job published successfully to queue ${queueName}`, { itemId: job.itemId });
    } catch (err) {
        logger.error(`Failed to publish job to queue ${queueName}`, err, { job });
        throw err;
    } finally {
        if (channel) {
            try {
                await channel.close();
            } catch (closeErr) {
                // Ignore channel close errors
            }
        }
    }
}

function publishScrapeJob(job) {
    return publishJob(rabbitMqQueue, job);
}

function publishAiParsingJob(job) {
    return publishJob(rabbitMqAiQueue, job);
}

module.exports = { publishAiParsingJob, publishScrapeJob };
