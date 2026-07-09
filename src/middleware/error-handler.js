const { nodeEnv } = require('../config/env');

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

    console.error('[api:error]', {
        method: req.method,
        path: req.path,
        statusCode,
        message: err.message,
        code: err.code,
        details: err.details,
        stack: err.stack
    });

    return res.status(statusCode).json(response);
}

module.exports = { errorHandler };
