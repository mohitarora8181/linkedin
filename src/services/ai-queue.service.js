const { getSupabase } = require('../config/supabase');
const { publishAiParsingJob } = require('./queue.service');
const logger = require('../utils/logger');

async function markAiQueued({ itemId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('linkerin_items')
        .update({
            ai_status: 'queued',
            ai_error: null,
            ai_mail: null,
            is_job_related: null,
            recruiter_email: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

    if (error) {
        logger.error(`Failed to mark item ${itemId} AI status as queued`, error);
        throw error;
    }
}

async function queueAiParsing({ id, item_type, user_id }) {
    await markAiQueued({ itemId: id });

    try {
        await publishAiParsingJob({
            itemId: id,
            itemType: item_type,
            userId: user_id
        });
    } catch (error) {
        logger.error('Failed to queue AI mail generation job', error, { itemId: id });
        try {
            const supabase = getSupabase();
            await supabase
                .from('linkerin_items')
                .update({
                    ai_status: 'failed',
                    ai_error: 'Unable to queue AI mail generation. Try again later.',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
        } catch (dbErr) {
            logger.error('Failed to update DB AI status after queue publish failure', dbErr);
        }
        throw error;
    }
}

module.exports = { queueAiParsing };
