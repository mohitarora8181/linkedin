const { getSupabase } = require('../config/supabase');
const { scrapeLinkedInUrl } = require('./scrape.service');
const { extractLinkedInUrl, getLinkedInItemType } = require('../utils/linkedin-url');
const { HttpError } = require('../utils/http-error');

function throwSupabaseError(error, action) {
    if (!error) return;

    if (error.status === 403 || error.code === '42501') {
        throw new HttpError(
            500,
            `Supabase denied ${action}. Check that SUPABASE_SERVICE_ROLE_KEY is set to the service_role key and linkerin_items exists.`,
            { code: error.code, status: error.status, supabaseMessage: error.message }
        );
    }

    throw error;
}

async function listItemsForUser(userId) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    throwSupabaseError(error, 'reading LinkerIn items');

    return data || [];
}

async function findItemByUrl({ sourceUrl, userId }) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .select('*')
        .eq('user_id', userId)
        .eq('source_url', sourceUrl)
        .maybeSingle();

    throwSupabaseError(error, 'checking duplicate LinkerIn item');

    return data;
}

async function saveLinkedInItem({ rawUrl, user }) {
    const sourceUrl = extractLinkedInUrl(rawUrl);

    if (!sourceUrl) {
        throw new HttpError(400, 'Valid LinkedIn URL is required');
    }

    const existingItem = await findItemByUrl({ sourceUrl, userId: user.id });

    if (existingItem) {
        return { duplicate: true, item: existingItem };
    }

    const content = await scrapeLinkedInUrl(sourceUrl);
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .insert({
            content,
            item_type: getLinkedInItemType(sourceUrl),
            source_url: sourceUrl,
            user_email: user.email,
            user_id: user.id
        })
        .select()
        .single();

    throwSupabaseError(error, 'saving LinkerIn item');

    return { duplicate: false, item: data };
}

module.exports = { listItemsForUser, saveLinkedInItem };
