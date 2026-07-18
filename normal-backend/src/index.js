const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

// Global error handlers
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Uncaught Exception occurred in Normal Backend', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL: Unhandled Rejection occurred in Normal Backend', reason);
});

app.listen(env.port, () => {
    logger.info(`LinkerIn Normal Backend server running on http://localhost:${env.port}`);
});
