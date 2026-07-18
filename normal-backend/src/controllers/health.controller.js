async function getHealth(req, res, next) {
    try {
        return res.json({
            success: true,
            status: "healthy",
            timestamp: new Date().toISOString(),
            message: "LinkerIn Normal Backend is up and running"
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getHealth };
