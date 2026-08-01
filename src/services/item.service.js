const { getSupabase } = require('../config/supabase');
const { publishScrapeJob, publishAiParsingJob } = require('./queue.service');
const { extractLinkedInUrl, getLinkedInItemType } = require('../utils/linkedin-url');
const { HttpError } = require('../utils/http-error');
const { markAiQueued, markAiFailed } = require('./ai.service');
const logger = require('../utils/logger');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function throwSupabaseError(error, action) {
    if (!error) return;

    if (error.status === 403 || error.code === '42501') {
        throw new HttpError(
            500,
            `Supabase denied ${action}. Check that SUPABASE_SERVICE_ROLE_KEY is set to the service_role key.`,
            { code: error.code, status: error.status, supabaseMessage: error.message }
        );
    }

    throw error;
}

function normalizeLimit(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PAGE_SIZE;
    }

    return Math.min(parsed, MAX_PAGE_SIZE);
}

function encodeCursor(item) {
    if (!item) return null;

    return Buffer.from(JSON.stringify({
        created_at: item.created_at,
        id: item.id
    })).toString('base64url');
}

function decodeCursor(cursor) {
    if (!cursor) return null;

    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

        if (!decoded.created_at || !decoded.id) {
            return null;
        }

        return decoded;
    } catch {
        return null;
    }
}

function escapeLogicValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\)/g, '\\)');
}

function escapeIlikeValue(value) {
    return String(value).replace(/[%_]/g, (match) => `\\${match}`);
}

function addSearchFilter(query, { search, type }) {
    const trimmedSearch = String(search || '').trim();
    if (!trimmedSearch) {
        return query;
    }

    if (type === 'post') {
        try {
            new RegExp(trimmedSearch);
        } catch {
            throw new HttpError(400, 'Post search must be a valid regular expression.');
        }

        const pattern = escapeLogicValue(trimmedSearch);
        return query.or(`author_name.imatch.${pattern},post_content.imatch.${pattern}`);
    }

    if (type === 'job') {
        const pattern = `%${escapeLogicValue(escapeIlikeValue(trimmedSearch))}%`;
        return query.or(`job_title.ilike.${pattern},company_name.ilike.${pattern},location.ilike.${pattern}`);
    }

    return query;
}

function searchableFieldsForItem({ content, itemType }) {
    if (itemType === 'post') {
        return {
            author_name: content?.author?.name ?? null,
            post_content: content?.content ?? null,
            job_title: null,
            company_name: null,
            location: null
        };
    }

    return {
        author_name: null,
        post_content: null,
        job_title: content?.title ?? null,
        company_name: content?.company?.name ?? null,
        location: content?.location ?? null
    };
}

async function listItemsForUser({ cursor, limit: rawLimit, search, type, userId }) {
    const limit = normalizeLimit(rawLimit);
    const decodedCursor = decodeCursor(cursor);
    let query = getSupabase()
        .from('linkerin_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);

    if (type) {
        query = query.eq('item_type', type);
    }

    if (decodedCursor) {
        query = query.or(`created_at.lt.${decodedCursor.created_at},and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`);
    }

    query = addSearchFilter(query, { search, type });

    const { data, error } = await query;

    throwSupabaseError(error, 'reading LinkerIn items');

    const rows = data || [];
    const pageItems = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    return {
        hasMore,
        items: pageItems,
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
    };
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

async function getItemForUser({ itemId, userId }) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .select('*')
        .eq('id', itemId)
        .eq('user_id', userId)
        .maybeSingle();

    throwSupabaseError(error, 'loading LinkerIn item');

    if (!data) {
        throw new HttpError(404, 'LinkerIn item not found');
    }

    return data;
}

async function markItemFailed({ errorMessage, itemId }) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .update({
            is_pending: false,
            scrape_error: errorMessage,
            updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();

    throwSupabaseError(error, 'marking LinkerIn item failed');

    return data;
}

async function repushItemForUser({ itemId, userId }) {
    const item = await getItemForUser({ itemId, userId });

    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .update({
            is_pending: true,
            scrape_error: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', item.id)
        .eq('user_id', userId)
        .select()
        .single();

    throwSupabaseError(error, 'repushing LinkerIn item');

    try {
        await publishScrapeJob({
            itemId: data.id,
            itemType: data.item_type,
            sourceUrl: data.source_url,
            userId: data.user_id
        });
    } catch (publishError) {
        logger.error('Failed to publish repushed scrape job to RabbitMQ', publishError);
        await markItemFailed({
            errorMessage: 'Unable to queue scraping job. Try again later.',
            itemId: data.id
        });
        throw new HttpError(503, 'Unable to queue scraping job. Try again later.');
    }

    return data;
}

async function createPendingItem({ sourceUrl, user }) {
    const itemType = getLinkedInItemType(sourceUrl);
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .insert({
            content: null,
            is_pending: true,
            item_type: itemType,
            scrape_error: null,
            source_url: sourceUrl,
            user_email: user.email,
            user_id: user.id
        })
        .select()
        .single();

    throwSupabaseError(error, 'creating pending LinkerIn item');

    return data;
}

async function saveLinkedInItem({ rawUrl, user }) {
    const sourceUrl = extractLinkedInUrl(rawUrl);

    if (!sourceUrl) {
        throw new HttpError(400, 'Valid LinkedIn URL is required');
    }

    const existingItem = await findItemByUrl({ sourceUrl, userId: user.id });

    if (existingItem) {
        return { duplicate: true, item: existingItem, queued: existingItem.is_pending };
    }

    const pendingItem = await createPendingItem({ sourceUrl, user });

    try {
        await publishScrapeJob({
            itemId: pendingItem.id,
            itemType: pendingItem.item_type,
            sourceUrl: pendingItem.source_url,
            userId: pendingItem.user_id
        });
    } catch (error) {
        logger.error('Failed to publish scrape job to RabbitMQ', error);
        await markItemFailed({
            errorMessage: 'Unable to queue scraping job. Try again later.',
            itemId: pendingItem.id
        });
        throw new HttpError(503, 'Unable to queue scraping job. Try again later.');
    }

    return { duplicate: false, item: pendingItem, queued: true };
}

module.exports = {
    getItemForUser,
    listItemsForUser,
    markItemFailed,
    repushItemForUser,
    saveLinkedInItem
};
