const { createChannel, rabbitMqExchange, rabbitMqQueue } = require('../config/rabbitmq');

async function publishScrapeJob(job) {
    const channel = await createChannel();
    const didPublish = channel.publish(
        rabbitMqExchange,
        rabbitMqQueue,
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

module.exports = { publishScrapeJob };
