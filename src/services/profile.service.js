const { getDatabase } = require('../config/database');
const { summarizeResumeWithGemini } = require('./gemini.service');
const { HttpError } = require('../utils/http-error');
const { mapProfile, newId, serializeJson } = require('../utils/database');
const { publicWebUrl } = require('../config/env');

async function getResumeProfileForUser({ userId }) { const [rows] = await getDatabase().execute('SELECT * FROM linkerin_user_profiles WHERE user_id = ?', [userId]); return mapProfile(rows[0]); }
async function getPublicResumeBySlug({ slug }) {
    const [rows] = await getDatabase().execute(
        `SELECT profiles.resume_summary, profiles.updated_at, users.name AS profile_name, users.picture_url AS profile_picture_url
         FROM linkerin_user_profiles AS profiles
         JOIN linkerin_users AS users ON users.id = profiles.user_id
         WHERE profiles.public_resume_slug = ? LIMIT 1`,
        [slug]
    );
    if (!rows[0]) throw new HttpError(404, 'This public resume could not be found.');
    return {
        resumeSummary: mapProfile(rows[0]).resume_summary,
        updatedAt: rows[0].updated_at,
        profileName: rows[0].profile_name,
        profilePictureUrl: rows[0].profile_picture_url
    };
}
function getPublicResumeUrl(slug) {
    return `${publicWebUrl}/user/public/${encodeURIComponent(slug)}`;
}
async function saveResumeProfile({ file, user }) {
    if (!file) throw new HttpError(400, 'Resume file is required.');
    const resumeSummary = await summarizeResumeWithGemini(file);
    await getDatabase().execute(`INSERT INTO linkerin_user_profiles (id, user_id, user_email, resume_summary, public_resume_slug, resume_file_name, resume_mime_type) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_email = VALUES(user_email), resume_summary = VALUES(resume_summary), public_resume_slug = COALESCE(public_resume_slug, VALUES(public_resume_slug)), resume_file_name = VALUES(resume_file_name), resume_mime_type = VALUES(resume_mime_type), updated_at = CURRENT_TIMESTAMP(3)`, [newId(), user.id, user.email, serializeJson(resumeSummary), newId(), file.originalname || null, file.mimetype || null]);
    return getResumeProfileForUser({ userId: user.id });
}

async function updateAutoEmailSetting({ enabled, userId }) {
    if (typeof enabled !== 'boolean') {
        throw new HttpError(400, 'Auto Email setting must be true or false.');
    }

    if (enabled) {
        const [profiles] = await getDatabase().execute(
            'SELECT resume_summary FROM linkerin_user_profiles WHERE user_id = ?',
            [userId]
        );
        if (!profiles[0]?.resume_summary) {
            throw new HttpError(409, 'Upload your resume before enabling Auto Email.');
        }

        const [connections] = await getDatabase().execute(
            'SELECT granted_scopes FROM linkerin_gmail_connections WHERE user_id = ?',
            [userId]
        );
        const scopes = String(connections[0]?.granted_scopes || '').split(/\s+/);
        if (!scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
            throw new HttpError(409, 'Connect Gmail with send permission before enabling Auto Email.');
        }
    }

    await getDatabase().execute(
        'UPDATE linkerin_user_profiles SET auto_email_enabled = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?',
        [enabled, userId]
    );
    return enabled;
}

module.exports = { getPublicResumeBySlug, getPublicResumeUrl, getResumeProfileForUser, saveResumeProfile, updateAutoEmailSetting };
