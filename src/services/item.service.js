const { getDatabase } = require('../config/database');
const { publishScrapeJob } = require('./queue.service');
const { extractLinkedInUrl, getLinkedInItemType } = require('../utils/linkedin-url');
const { HttpError } = require('../utils/http-error');
const { hashSourceUrl, mapItem, newId } = require('../utils/database');
const logger = require('../utils/logger');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function normalizeLimit(value) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE; }
function encodeCursor(item) { return item ? Buffer.from(JSON.stringify({ created_at: item.created_at, id: item.id })).toString('base64url') : null; }
function decodeCursor(cursor) { try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); return value.created_at && value.id ? value : null; } catch { return null; } }
function searchableFieldsForItem({ content, itemType }) { return itemType === 'post' ? [content?.author?.name ?? null, content?.content ?? null, null, null, null] : [null, null, content?.title ?? null, content?.company?.name ?? null, content?.location ?? null]; }

async function getItemById(itemId) { const [rows] = await getDatabase().execute('SELECT * FROM linkerin_items WHERE id = ?', [itemId]); return mapItem(rows[0]); }

async function listItemsForUser({ cursor, limit: rawLimit, search, type, userId }) {
    const limit = normalizeLimit(rawLimit); const decoded = decodeCursor(cursor); const where = ['user_id = ?']; const params = [userId];
    if (type) { where.push('item_type = ?'); params.push(type); }
    if (decoded) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); params.push(decoded.created_at, decoded.created_at, decoded.id); }
    const term = String(search || '').trim();
    if (term && type === 'post') { try { new RegExp(term); } catch { throw new HttpError(400, 'Post search must be a valid regular expression.'); } where.push('(author_name REGEXP ? OR post_content REGEXP ?)'); params.push(term, term); }
    else if (term && type === 'job') { const escaped = term.replace(/[\\%_]/g, '\\$&'); where.push("(job_title LIKE ? ESCAPE '\\\\' OR company_name LIKE ? ESCAPE '\\\\' OR location LIKE ? ESCAPE '\\\\')"); params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`); }
    params.push(limit + 1);
    const [rows] = await getDatabase().query(`SELECT * FROM linkerin_items WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, params);
    const items = rows.slice(0, limit).map(mapItem); const hasMore = rows.length > limit;
    return { items, hasMore, nextCursor: hasMore ? encodeCursor(items.at(-1)) : null };
}

async function findItemByUrl({ sourceUrl, userId }) { const [rows] = await getDatabase().execute('SELECT * FROM linkerin_items WHERE user_id = ? AND source_url_hash = ?', [userId, hashSourceUrl(sourceUrl)]); return mapItem(rows[0]); }
async function getItemForUser({ itemId, userId }) { const [rows] = await getDatabase().execute('SELECT * FROM linkerin_items WHERE id = ? AND user_id = ?', [itemId, userId]); const item = mapItem(rows[0]); if (!item) throw new HttpError(404, 'LinkerIn item not found'); return item; }
async function updateItem(itemId, values) { const fields = Object.keys(values); await getDatabase().execute(`UPDATE linkerin_items SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [...fields.map((field) => values[field]), itemId]); return getItemById(itemId); }
async function markItemFailed({ errorMessage, itemId }) { return updateItem(itemId, { is_pending: false, scrape_error: errorMessage }); }

async function repushItemForUser({ itemId, userId }) {
    const item = await getItemForUser({ itemId, userId }); const updated = await updateItem(item.id, { is_pending: true, scrape_error: null });
    try { await publishScrapeJob({ itemId: updated.id, itemType: updated.item_type, sourceUrl: updated.source_url, userId: updated.user_id }); }
    catch (error) { logger.error('Failed to publish repushed scrape job to RabbitMQ', error); await markItemFailed({ itemId: updated.id, errorMessage: 'Unable to queue scraping job. Try again later.' }); throw new HttpError(503, 'Unable to queue scraping job. Try again later.'); }
    return updated;
}

async function createPendingItem({ sourceUrl, user }) { const id = newId(); const itemType = getLinkedInItemType(sourceUrl); await getDatabase().execute('INSERT INTO linkerin_items (id, user_id, user_email, source_url, source_url_hash, item_type, content, is_pending) VALUES (?, ?, ?, ?, ?, ?, NULL, TRUE)', [id, user.id, user.email, sourceUrl, hashSourceUrl(sourceUrl), itemType]); return getItemById(id); }
async function saveLinkedInItem({ rawUrl, user }) {
    const sourceUrl = extractLinkedInUrl(rawUrl); if (!sourceUrl) throw new HttpError(400, 'Valid LinkedIn URL is required');
    const existing = await findItemByUrl({ sourceUrl, userId: user.id }); if (existing) return { duplicate: true, item: existing, queued: existing.is_pending };
    const item = await createPendingItem({ sourceUrl, user });
    try { await publishScrapeJob({ itemId: item.id, itemType: item.item_type, sourceUrl: item.source_url, userId: item.user_id }); }
    catch (error) { logger.error('Failed to publish scrape job to RabbitMQ', error); await markItemFailed({ itemId: item.id, errorMessage: 'Unable to queue scraping job. Try again later.' }); throw new HttpError(503, 'Unable to queue scraping job. Try again later.'); }
    return { duplicate: false, item, queued: true };
}
async function countItemsForUser({ userId }) { const [rows] = await getDatabase().execute("SELECT item_type, COUNT(*) AS count FROM linkerin_items WHERE user_id = ? AND item_type IN ('post', 'job') GROUP BY item_type", [userId]); return { posts: Number(rows.find((row) => row.item_type === 'post')?.count || 0), jobs: Number(rows.find((row) => row.item_type === 'job')?.count || 0) }; }
async function markItemMailSentForUser({ itemId, userId }) { const item = await getItemForUser({ itemId, userId }); return updateItem(item.id, { mail_sent: true }); }

module.exports = { countItemsForUser, getItemById, getItemForUser, listItemsForUser, markItemFailed, markItemMailSentForUser, repushItemForUser, saveLinkedInItem, searchableFieldsForItem, updateItem };
