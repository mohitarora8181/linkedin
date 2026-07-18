function formatMeta(meta) {
    if (Object.keys(meta).length === 0) return '';
    return ' ' + JSON.stringify(meta);
}

const logger = {
    info: (message, meta = {}) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
    warn: (message, meta = {}) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
    error: (message, error, meta = {}) => {
        const errorDetails = {
            message: error?.message || String(error),
            stack: error?.stack,
            ...meta
        };
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, errorDetails);
    }
};

module.exports = logger;
