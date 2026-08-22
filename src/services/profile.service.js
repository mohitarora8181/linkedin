const { getDatabase } = require('../config/database');
const { summarizeResumeWithGemini } = require('./gemini.service');
const { HttpError } = require('../utils/http-error');
const { mapProfile, newId, serializeJson } = require('../utils/database');

async function getResumeProfileForUser({ userId }) { const [rows] = await getDatabase().execute('SELECT * FROM linkerin_user_profiles WHERE user_id = ?', [userId]); return mapProfile(rows[0]); }
async function saveResumeProfile({ file, user }) {
    if (!file) throw new HttpError(400, 'Resume file is required.');
    const resumeSummary = await summarizeResumeWithGemini(file);
    await getDatabase().execute(`INSERT INTO linkerin_user_profiles (id, user_id, user_email, resume_summary, resume_file_name, resume_mime_type) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_email = VALUES(user_email), resume_summary = VALUES(resume_summary), resume_file_name = VALUES(resume_file_name), resume_mime_type = VALUES(resume_mime_type), updated_at = CURRENT_TIMESTAMP(3)`, [newId(), user.id, user.email, serializeJson(resumeSummary), file.originalname || null, file.mimetype || null]);
    return getResumeProfileForUser({ userId: user.id });
}
module.exports = { getResumeProfileForUser, saveResumeProfile };
