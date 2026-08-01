const amqp = require('amqplib');
const { rabbitMqExchange, rabbitMqQueue, rabbitMqUrl } = require('./env');
const logger = require('../utils/logger');

let connection = null;
let isReconnecting = false;
const reconnectListeners = new Set();

async function connectWithRetry(retries = 5, delay = 2000) {
    if (!rabbitMqUrl) {
        throw new Error('RABBITMQ_URL is not configured.');
    }

    for (let i = 0; i < retries; i++) {
        try {
            logger.info(`Connecting to RabbitMQ (attempt ${i + 1}/${retries})...`);
            const conn = await amqp.connect(rabbitMqUrl);
            
            conn.on('error', (err) => {
                logger.error('RabbitMQ connection error', err);
                handleDisconnect();
            });

            conn.on('close', () => {
                logger.warn('RabbitMQ connection closed');
                handleDisconnect();
            });

            logger.info('Successfully connected to RabbitMQ');
            connection = conn;
            return conn;
        } catch (err) {
            logger.error(`RabbitMQ connection attempt ${i + 1} failed`, err);
            if (i < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }
    throw new Error('Failed to connect to RabbitMQ after retries');
}

function handleDisconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    connection = null;

    logger.warn('RabbitMQ connection lost. Initiating reconnect loop...');
    
    const tryReconnect = async () => {
        try {
            await connectWithRetry(10, 5000);
            isReconnecting = false;
            
            for (const listener of reconnectListeners) {
                listener().catch((err) => logger.error('Error in reconnect listener', err));
            }
        } catch (err) {
            logger.error('RabbitMQ reconnection loop failed, retrying in 10s...', err);
            setTimeout(tryReconnect, 10000);
        }
    };

    setTimeout(tryReconnect, 5000);
}

function onReconnect(callback) {
    reconnectListeners.add(callback);
    return () => {
        reconnectListeners.delete(callback);
    };
}

async function getConnection() {
    if (connection) return connection;
    return connectWithRetry();
}

async function createChannel(queueName = rabbitMqQueue) {
    const conn = await getConnection();
    const channel = await conn.createChannel();

    channel.on('error', (err) => {
        logger.error(`RabbitMQ channel error on queue ${queueName}`, err);
    });

    channel.on('close', () => {
        logger.warn(`RabbitMQ channel closed for queue ${queueName}`);
    });

    await channel.assertExchange(rabbitMqExchange, 'direct', { durable: true });
    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, rabbitMqExchange, queueName);

    return channel;
}

module.exports = {
    getConnection,
    createChannel,
    onReconnect,
    rabbitMqExchange,
    rabbitMqQueue
};
