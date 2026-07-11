const { rabbitMqAiQueue } = require('../config/env');
const { createChannel, rabbitMqExchange, rabbitMqQueue } = require('../config/rabbitmq');

async function publishJob(queueName, job) {
    const channel = await createChannel(queueName);
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

    await channel.close();

    if (!didPublish) {
        throw new Error('RabbitMQ publish buffer is full.');
    }
}

function publishScrapeJob(job) {
    return publishJob(rabbitMqQueue, job);
}

function publishAiParsingJob(job) {
    return publishJob(rabbitMqAiQueue, job);
}

module.exports = { publishAiParsingJob, publishScrapeJob };
