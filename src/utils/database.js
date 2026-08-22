const { randomUUID, createHash } = require('crypto');

function jsonValue(value) {
    if (value === null || value === undefined || typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return value; }
}

function serializeJson(value) { return value === undefined ? null : JSON.stringify(value); }
function mapItem(row) { return row ? { ...row, content: jsonValue(row.content), ai_mail: jsonValue(row.ai_mail), is_pending: Boolean(row.is_pending), mail_sent: Boolean(row.mail_sent), is_job_related: row.is_job_related === null ? null : Boolean(row.is_job_related) } : null; }
function mapProfile(row) { return row ? { ...row, resume_summary: jsonValue(row.resume_summary) } : null; }
function newId() { return randomUUID(); }
function hashSourceUrl(sourceUrl) { return createHash('sha256').update(sourceUrl).digest('hex'); }

module.exports = { hashSourceUrl, mapItem, mapProfile, newId, serializeJson };
