const { getGmailConnectionStatus, queueItemEmail } = require('../services/gmail.service');

async function getGmailStatus(req, res, next) {
    try {
        return res.json({
            success: true,
            ...(await getGmailConnectionStatus({ email: req.user.email, userId: req.user.id }))
        });
    } catch (error) {
        return next(error);
    }
}

async function sendGmailItem(req, res, next) {
    try {
        const result = await queueItemEmail({
            itemId: req.params.id,
            email: req.user.email,
            userId: req.user.id
        });
        return res.status(202).json({ success: true, ...result });
    } catch (error) {
        return next(error);
    }
}

module.exports = { getGmailStatus, sendGmailItem };
