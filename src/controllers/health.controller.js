const { getConnection } = require('../config/rabbitmq');
const { getDatabase } = require('../config/database');

async function getHealth(req, res, next) {
    try {
        const health = {
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            message: 'LinkerIn backend is up and running',
            services: {
                express: 'up',
                rabbitmq: 'down',
                mysql: 'down'
            }
        };

        try {
            const conn = await getConnection();
            if (conn) {
                health.services.rabbitmq = 'connected';
            }
        } catch (err) {
            health.status = 'degraded';
            health.services.rabbitmq = `error: ${err.message}`;
        }

        try {
            await getDatabase().query('SELECT 1');
            health.services.mysql = 'connected';
        } catch (err) {
            health.status = 'degraded';
            health.services.mysql = `error: ${err.message}`;
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        return res.status(statusCode).json(health);
    } catch (err) {
        next(err);
    }
}

module.exports = { getHealth };
