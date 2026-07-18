const express = require('express');
const env = require('./config/env');
const logger = require('./utils/logger');
const { getSupabase } = require('./config/supabase');
const { getConnection } = require('./config/rabbitmq');
const { startWorker } = require('./workers/scrape.worker');

// Prevent worker process from crashing on unexpected errors
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Standalone Scrape Worker uncaught exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL: Standalone Scrape Worker unhandled rejection', reason);
});

const app = express();
app.use(express.json());

// Health check endpoint for pods and orchestrators (Render, K8s, AWS, ECS, etc.)
app.get('/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            express: 'up',
            rabbitmq: 'down',
            supabase: 'down'
        }
    };

    try {
        const conn = await getConnection();
        if (conn && conn.connection) {
            health.services.rabbitmq = 'connected';
        }
    } catch (err) {
        health.status = 'degraded';
        health.services.rabbitmq = `error: ${err.message}`;
    }

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('linkerin_items').select('id').limit(1);
        if (!error) {
            health.services.supabase = 'connected';
        } else {
            health.status = 'degraded';
            health.services.supabase = `error: ${error.message}`;
        }
    } catch (err) {
        health.status = 'degraded';
        health.services.supabase = `error: ${err.message}`;
    }

    const statusCode = health.status === 'healthy' ? 200 : 500;
    return res.status(statusCode).json(health);
});

app.use((err, req, res, next) => {
    logger.error('Unhandled request error in scraping backend', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(env.port, () => {
    logger.info(`Scraping backend health check server running on http://localhost:${env.port}`);

    // Automatically trigger background RabbitMQ consumer worker
    startWorker().catch((error) => {
        logger.error('Failed to start scrape worker on startup', error);
    });
});
