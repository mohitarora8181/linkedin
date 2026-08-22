const { getDatabase } = require('../config/database');
const { queueAiParsing } = require('../services/ai-queue.service');
const { mapItem } = require('../utils/database');
const logger = require('../utils/logger');

async function repushAi(req, res, next) {
    const itemId = req.body?.itemId || req.query?.itemId;

    if (!itemId) {
        return res.status(400).json({
            success: false,
            message: 'itemId is required in request body or query parameter'
        });
    }

    try {
        const [rows] = await getDatabase().execute('SELECT id, item_type, user_id FROM linkerin_items WHERE id = ? AND user_id = ?', [itemId, req.user.id]);
        const item = rows[0];

        if (!item) {
            return res.status(404).json({
                success: false,
                message: `Item with ID ${itemId} not found`
            });
        }

        logger.info(`Manually repushing item ${itemId} to AI parsing queue`);
        await queueAiParsing(item);
        const [updatedRows] = await getDatabase().execute('SELECT * FROM linkerin_items WHERE id = ?', [itemId]);

        return res.json({
            success: true,
            item: mapItem(updatedRows[0]),
            message: `Successfully queued AI parsing job for item ${itemId}`
        });
    } catch (err) {
        logger.error(`Failed to manually repush item ${itemId} to AI queue`, err);
        next(err);
    }
}

module.exports = { repushAi };
