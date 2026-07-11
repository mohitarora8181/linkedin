const { groqApiKey, groqModel } = require('../config/env');
const { getSupabase } = require('../config/supabase');
const { HttpError } = require('../utils/http-error');

function throwSupabaseError(error, action) {
    if (!error) return;
    throw new HttpError(500, `Supabase failed while ${action}.`, { supabaseMessage: error.message, code: error.code });
}

function parseJsonFromText(text) {
    const cleaned = String(text || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Groq returned non-JSON mail content.');
    }
}

async function getItem(itemId) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

    throwSupabaseError(error, 'loading item for AI parsing');
    if (!data) throw new Error(`AI item not found: ${itemId}`);
    return data;
}

async function getResumeSummary(userId) {
    const { data, error } = await getSupabase()
        .from('linkerin_user_profiles')
        .select('resume_summary')
        .eq('user_id', userId)
        .maybeSingle();

    throwSupabaseError(error, 'loading resume profile for AI parsing');
    return data?.resume_summary ?? null;
}

async function updateAiFields(itemId, values) {
    const { data, error } = await getSupabase()
        .from('linkerin_items')
        .update({
            ...values,
            ai_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();

    throwSupabaseError(error, 'updating AI mail content');
    return data;
}

async function markAiQueued({ itemId }) {
    return updateAiFields(itemId, {
        ai_error: null,
        ai_mail: null,
        ai_status: 'queued',
        is_job_related: null,
        recruiter_email: null
    });
}

async function markAiFailed({ errorMessage, itemId }) {
    return updateAiFields(itemId, {
        ai_error: errorMessage,
        ai_status: 'failed'
    });
}

function buildPrompt({ item, resumeSummary }) {
    return `You are generating an email draft for a LinkedIn opportunity.

Candidate resume summary JSON:
${JSON.stringify(resumeSummary, null, 2)}

LinkedIn item type: ${item.item_type}
LinkedIn scraped content JSON:
${JSON.stringify(item.content, null, 2)}

Rules:
- Return strict JSON only.
- For item_type "job", always treat it as job related.
- For item_type "post", first decide if it is truly about a job opening, hiring request, referral opportunity, internship, freelance role, or recruiter call. If not job-related, do not generate subject/message.
- Extract recruiter or contact email if it appears anywhere in the job/post/comments. If none, use null.
- Subject must be concise and specific.
- Message must be a short descriptive cover letter email, personalized using the candidate resume summary and the item content.
- Do not invent experience, links, email ids, company names, or role details.

JSON shape:
{
  "is_job_related": true,
  "recruiter_email": "email@example.com or null",
  "subject": "email subject or null",
  "message": "email body or null",
  "reason": "short reason for decision"
}`;
}

async function callGroqForMail({ item, resumeSummary }) {
    if (!groqApiKey) {
        throw new HttpError(500, 'Groq API key is not configured.');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: groqModel,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You produce strict JSON for recruiting email drafting.' },
                { role: 'user', content: buildPrompt({ item, resumeSummary }) }
            ]
        })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new HttpError(502, payload?.error?.message || 'Groq mail generation failed.');
    }

    return parseJsonFromText(payload?.choices?.[0]?.message?.content);
}

async function processAiParsingJob({ itemId }) {
    const item = await getItem(itemId);

    if (!item.content) {
        throw new Error(`AI parsing skipped because item has no scraped content: ${itemId}`);
    }

    const resumeSummary = await getResumeSummary(item.user_id);
    if (!resumeSummary) {
        throw new Error('Resume profile is required before AI mail generation.');
    }

    const result = await callGroqForMail({ item, resumeSummary });
    const isJobRelated = item.item_type === 'job' ? true : Boolean(result.is_job_related);

    return updateAiFields(item.id, {
        ai_error: null,
        ai_mail: isJobRelated ? {
            subject: result.subject || null,
            message: result.message || null,
            reason: result.reason || null
        } : null,
        ai_status: 'completed',
        is_job_related: isJobRelated,
        recruiter_email: isJobRelated ? (result.recruiter_email || null) : null
    });
}

module.exports = { markAiFailed, markAiQueued, processAiParsingJob };
