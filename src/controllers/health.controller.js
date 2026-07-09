function healthCheck(req, res) {
    return res.json({ success: true });
}

module.exports = { healthCheck };
