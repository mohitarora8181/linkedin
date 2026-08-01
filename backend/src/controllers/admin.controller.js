const { getSupabase } = require('../config/supabase');
const { queueAiParsing } = require('../services/ai-queue.service');
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
        const supabase = getSupabase();
        const { data: item, error } = await supabase
            .from('linkerin_items')
            .select('id, item_type, user_id')
            .eq('id', itemId)
            .maybeSingle();

        if (error) throw error;

        if (!item) {
            return res.status(404).json({
                success: false,
                message: `Item with ID ${itemId} not found`
            });
        }

        logger.info(`Manually repushing item ${itemId} to AI parsing queue`);
        await queueAiParsing(item);

        return res.json({
            success: true,
            message: `Successfully queued AI parsing job for item ${itemId}`
        });
    } catch (err) {
        logger.error(`Failed to manually repush item ${itemId} to AI queue`, err);
        next(err);
    }
}

module.exports = { repushAi };
