const { OAuth2Client } = require('google-auth-library');
const { googleClientId, googleClientSecret, googleRedirectUri } = require('../config/env');
const { getDatabase } = require('../config/database');
const { getItemForUser, updateItem } = require('./item.service');
const { decryptSecret } = require('../utils/secret');
const { HttpError } = require('../utils/http-error');
const { publishGmailSendJob } = require('./queue.service');
const logger = require('../utils/logger');

function encodeBase64Url(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function normalizeRecipients(item) {
    const raw = item.recruiter_emails ?? item.recruiter_email;
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
        } catch {
            return [raw];
        }
    }
    return raw ? [String(raw)] : [];
}

function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function encodeMimeHeader(value) {
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMimeMessage({ body, recipients, subject }) {
    const lines = [
        `To: ${recipients.join(', ')}`,
        `Subject: ${encodeMimeHeader(subject.replace(/[\r\n]+/g, ' ').trim())}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        'MIME-Version: 1.0',
        '',
        body
    ];

    return lines.join('\r\n');
}

async function getConnection({ userId, email }) {
    const [rows] = await getDatabase().execute(
        `SELECT c.*
         FROM linkerin_gmail_connections c
         JOIN linkerin_users u ON u.id = c.user_id
         WHERE c.user_id = ? OR (u.email = ? AND ? IS NOT NULL)
         ORDER BY c.updated_at DESC
         LIMIT 1`,
        [userId, email || null, email || null]
    );
    if (!rows[0]) {
        throw new HttpError(409, 'Connect your Gmail account before sending email.');
    }
    return rows[0];
}

async function sendItemEmail({ itemId, userId, email }) {
    const item = await getItemForUser({ itemId, userId });
    if (item.mail_sent) {
        throw new HttpError(409, 'This email has already been marked as sent.');
    }

    const subject = item.ai_mail?.subject ?? item.ai_draft_subject;
    const body = item.ai_mail?.message ?? item.ai_draft_message;
    const recipients = normalizeRecipients(item);

    if (!subject || !body || !recipients.length || recipients.some((email) => !validateEmail(email))) {
        throw new HttpError(400, 'This item does not contain a valid email recipient and draft.');
    }

    const connection = await getConnection({ userId, email });
    const oauthClient = new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri);
    oauthClient.setCredentials({ refresh_token: decryptSecret(connection.encrypted_refresh_token) });

    let accessToken;
    try {
        accessToken = (await oauthClient.getAccessToken()).token;
    } catch {
        throw new HttpError(401, 'Gmail authorization expired. Reconnect your Gmail account.');
    }

    if (!accessToken) {
        throw new HttpError(401, 'Gmail authorization expired. Reconnect your Gmail account.');
    }

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodeBase64Url(buildMimeMessage({ body, recipients, subject })) })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new HttpError(401, 'Gmail authorization expired or does not include send permission.');
        }
        throw new HttpError(502, payload?.error?.message || 'Gmail could not send this message.');
    }

    const updatedItem = await updateItem(itemId, {
        mail_sent: true,
        mail_send_status: 'sent',
        mail_send_error: null
    });
    return { item: updatedItem, messageId: payload.id, gmailEmail: connection.gmail_email };
}

async function queueItemEmail({ itemId, userId, email }) {
    const item = await getItemForUser({ itemId, userId });
    if (item.mail_sent || item.mail_send_status === 'sent') {
        throw new HttpError(409, 'This email has already been sent.');
    }
    if (item.mail_send_status === 'queued') {
        return { item, queued: true };
    }
    const subject = item.ai_mail?.subject ?? item.ai_draft_subject;
    const body = item.ai_mail?.message ?? item.ai_draft_message;
    const recipients = normalizeRecipients(item);
    if (!subject || !body || !recipients.length || recipients.some((value) => !validateEmail(value))) {
        throw new HttpError(400, 'This item does not contain a valid email recipient and draft.');
    }
    await getConnection({ userId, email });
    await getDatabase().execute(
        "UPDATE linkerin_items SET mail_send_status = 'queued', mail_send_error = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ? AND mail_send_status IN ('idle', 'failed')",
        [itemId, userId]
    );
    try {
        await publishGmailSendJob({ itemId, userId, email });
    } catch (error) {
        logger.error('Failed to queue Gmail send job', error, { itemId });
        await getDatabase().execute(
            "UPDATE linkerin_items SET mail_send_status = 'failed', mail_send_error = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?",
            ['Unable to queue email. Try again later.', itemId, userId]
        );
        throw new HttpError(503, 'Unable to queue email. Try again later.');
    }
    return { item: await getItemForUser({ itemId, userId }), queued: true };
}

async function markGmailSendFailed({ itemId, userId, errorMessage }) {
    await getDatabase().execute(
        "UPDATE linkerin_items SET mail_send_status = 'failed', mail_send_error = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?",
        [errorMessage, itemId, userId]
    );
}

async function getGmailConnectionStatus({ userId, email }) {
    const [rows] = await getDatabase().execute(
        `SELECT c.gmail_email, c.granted_scopes, c.connected_at, c.updated_at
         FROM linkerin_gmail_connections c
         JOIN linkerin_users u ON u.id = c.user_id
         WHERE c.user_id = ? OR (u.email = ? AND ? IS NOT NULL)
         ORDER BY c.updated_at DESC
         LIMIT 1`,
        [userId, email || null, email || null]
    );
    const connection = rows[0];
    return {
        connected: Boolean(connection),
        email: connection?.gmail_email ?? null,
        scopes: connection?.granted_scopes ?? null,
        connectedAt: connection?.connected_at ?? null
    };
}

module.exports = { buildMimeMessage, getGmailConnectionStatus, markGmailSendFailed, queueItemEmail, sendItemEmail };
