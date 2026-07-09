const { getSupabase } = require("../config/supabase");
const { scrapeLinkedInUrl } = require("./scrape.service");
const { extractLinkedInUrl, getLinkedInItemType } = require("../utils/linkedin-url");

async function listItemsForUser(userId) {
    const { data, error } = await getSupabase()
        .from("linkerin_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        throw error;
    }

    return data || [];
}

async function findItemByUrl({ sourceUrl, userId }) {
    const { data, error } = await getSupabase()
        .from("linkerin_items")
        .select("*")
        .eq("user_id", userId)
        .eq("source_url", sourceUrl)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

async function saveLinkedInItem({ rawUrl, user }) {
    const sourceUrl = extractLinkedInUrl(rawUrl);

    if (!sourceUrl) {
        const error = new Error("Valid LinkedIn URL is required");
        error.statusCode = 400;
        throw error;
    }

    const existingItem = await findItemByUrl({ sourceUrl, userId: user.id });

    if (existingItem) {
        return { duplicate: true, item: existingItem };
    }

    const content = await scrapeLinkedInUrl(sourceUrl);
    const { data, error } = await getSupabase()
        .from("linkerin_items")
        .insert({
            content,
            item_type: getLinkedInItemType(sourceUrl),
            source_url: sourceUrl,
            user_email: user.email,
            user_id: user.id
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return { duplicate: false, item: data };
}

module.exports = { listItemsForUser, saveLinkedInItem };
