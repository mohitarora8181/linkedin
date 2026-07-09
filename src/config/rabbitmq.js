const amqp = require('amqplib');
const { rabbitMqExchange, rabbitMqQueue, rabbitMqUrl } = require('./env');

let connectionPromise = null;

async function getConnection() {
    if (!connectionPromise) {
        connectionPromise = amqp.connect(rabbitMqUrl).catch((error) => {
            connectionPromise = null;
            throw error;
        });
    }

    return connectionPromise;
}

async function createChannel() {
    const connection = await getConnection();
    const channel = await connection.createChannel();

    await channel.assertExchange(rabbitMqExchange, 'direct', { durable: true });
    await channel.assertQueue(rabbitMqQueue, { durable: true });
    await channel.bindQueue(rabbitMqQueue, rabbitMqExchange, rabbitMqQueue);

    return channel;
}

module.exports = {
    createChannel,
    rabbitMqExchange,
    rabbitMqQueue
};
