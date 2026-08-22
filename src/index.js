const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { startAiWorker } = require('./workers/ai.worker');
const { startWorker: startScrapeWorker } = require('./workers/scrape.worker');

process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Uncaught exception in LinkerIn backend', err);
});

process.on('unhandledRejection', (reason) => {
    logger.error('CRITICAL: Unhandled rejection in LinkerIn backend', reason);
});

async function startBackgroundWorkers() {
    if (env.enableScrapeWorker) {
        startScrapeWorker().catch((error) => {
            logger.error('Unable to start LinkedIn scrape worker', error);
        });
    } else {
        logger.info('Scrape worker disabled (set ENABLE_SCRAPE_WORKER=true to enable)');
    }

    if (env.enableAiWorker) {
        startAiWorker().catch((error) => {
            logger.error('Unable to start Groq AI parsing worker', error);
        });
    } else {
        logger.info('AI worker disabled (set ENABLE_AI_WORKER=true to enable)');
    }
}

async function start() {
    await initializeDatabase();
    app.listen(env.port, () => {
        logger.info(`LinkerIn backend running on http://localhost:${env.port}`);
        startBackgroundWorkers();
    });
}

start().catch((error) => {
    logger.error('Unable to initialize MySQL database', error);
    process.exit(1);
});
