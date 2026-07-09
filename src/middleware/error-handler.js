function errorHandler(err, req, res, next) {
    console.error(err);

    return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error"
    });
}

module.exports = { errorHandler };
