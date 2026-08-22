const { getDatabase } = require('../config/database');
const { publishAiParsingJob } = require('./queue.service');
const logger = require('../utils/logger');

async function markAiQueued({ itemId }) {
    await getDatabase().execute("UPDATE linkerin_items SET ai_status = 'queued', ai_error = NULL, ai_mail = NULL, is_job_related = NULL, recruiter_email = NULL, ai_updated_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [itemId]);
}

async function queueAiParsing({ id, item_type, user_id }) {
    await markAiQueued({ itemId: id });
    try { await publishAiParsingJob({ itemId: id, itemType: item_type, userId: user_id }); }
    catch (error) {
        logger.error('Failed to queue AI mail generation job', error, { itemId: id });
        try { await getDatabase().execute("UPDATE linkerin_items SET ai_status = 'failed', ai_error = ?, ai_updated_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", ['Unable to queue AI mail generation. Try again later.', id]); }
        catch (dbError) { logger.error('Failed to update DB AI status after queue publish failure', dbError); }
        throw error;
    }
}

module.exports = { queueAiParsing };
