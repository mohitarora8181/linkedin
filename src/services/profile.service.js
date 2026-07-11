const { getSupabase } = require('../config/supabase');
const { summarizeResumeWithGemini } = require('./gemini.service');
const { HttpError } = require('../utils/http-error');

function throwSupabaseError(error, action) {
    if (!error) return;
    throw new HttpError(500, `Supabase failed while ${action}.`, { supabaseMessage: error.message, code: error.code });
}

async function getResumeProfileForUser({ userId }) {
    const { data, error } = await getSupabase()
        .from('linkerin_user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    throwSupabaseError(error, 'loading resume profile');

    return data;
}

async function saveResumeProfile({ file, user }) {
    if (!file) {
        throw new HttpError(400, 'Resume file is required.');
    }

    const resumeSummary = await summarizeResumeWithGemini(file);
    const { data, error } = await getSupabase()
        .from('linkerin_user_profiles')
        .upsert({
            resume_summary: resumeSummary,
            resume_file_name: file.originalname || null,
            resume_mime_type: file.mimetype || null,
            updated_at: new Date().toISOString(),
            user_email: user.email,
            user_id: user.id
        }, { onConflict: 'user_id' })
        .select()
        .single();

    throwSupabaseError(error, 'saving resume profile');

    return data;
}

module.exports = { getResumeProfileForUser, saveResumeProfile };
