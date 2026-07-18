const { nodeEnv } = require('../config/env');
const logger = require('../utils/logger');

function getStatusCode(err) {
    if (Number.isInteger(err.statusCode)) return err.statusCode;
    if (Number.isInteger(err.status)) return err.status;

    return 500;
}

function errorHandler(err, req, res, next) {
    const statusCode = getStatusCode(err);
    const response = {
        success: false,
        message: err.message || 'Internal server error'
    };

    if (nodeEnv !== 'production' && err.details) {
        response.details = err.details;
    }

    logger.error('API request error occurred', err, {
        method: req.method,
        path: req.path,
        statusCode,
        code: err.code,
        details: err.details
    });

    return res.status(statusCode).json(response);
}

module.exports = { errorHandler };
