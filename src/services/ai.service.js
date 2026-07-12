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
    return `You are generating a ready-to-send email draft for a LinkedIn opportunity. The output will be sent as-is with no manual editing, so it must be complete, accurate, and free of any placeholder or filler text.

    Candidate resume summary JSON:
    ${JSON.stringify(resumeSummary, null, 2)}

    LinkedIn item type: ${item.item_type}
    LinkedIn scraped content JSON:
    ${JSON.stringify(item.content, null, 2)}

    Rules:
    - Return strict JSON only. No markdown, no code fences, no text outside the JSON object.
    - For item_type "job", always treat it as job related.
    - For item_type "post", first decide if it is truly about a job opening, hiring request, referral opportunity, internship, freelance role, or recruiter call. If not job-related, set is_job_related to false and leave subject/message/recruiter_email as null.
    - Extract recruiter or contact email if it appears anywhere in the job/post/comments text. If none appears, use null. Never guess or construct an email address.
    - Subject must be concise, specific, and reference the actual role or company from the content — never generic (e.g. not "Application for Job Opportunity").
    - Message must be a short, personalized cover-email body (120-180 words) that connects specific details from the LinkedIn content to specific details from the candidate resume summary (skills, past roles, projects). It must read as a finished, natural email a human would send — not a template.
    - Format the message with proper structure for email readability: a one-line greeting, followed by a blank line, then 2-3 short body paragraphs (2-4 sentences each) separated by blank lines, then a blank line, then a closing line and sign-off. Use "\\n\\n" between each paragraph/section so it renders as distinct blocks in an email client rather than one dense block of text. Do not use bullet points, markdown, headers, or bold/italic syntax inside the message — plain, well-spaced prose only.
    - Keep each paragraph focused on one idea: paragraph 1 = the hook referencing the specific opportunity, paragraph 2 = relevant background/fit from the resume, final short paragraph = a clear, low-friction next step or ask.
    - Sign the message using the candidate's actual name from resumeSummary if it is present in the JSON. If the candidate's name is not present in resumeSummary, end the message with "Best regards," and no name line, rather than any bracketed placeholder.
    - Never use placeholder text of any kind (e.g. "[Your Name]", "[Company]", "[mention experience here]", "Dear Hiring Manager" as a guess when a real name is available). If a detail is missing, either omit that sentence/line entirely or phrase around it naturally — do not leave a gap or bracket for the user to fill in.
    - Do not invent or assume: experience, skills, certifications, links, email addresses, company names, role titles, salary, location, or any fact not explicitly present in resumeSummary or the LinkedIn content. If uncertain about a fact, exclude it rather than include it.
    - Do not use generic filler openers like "I hope this email finds you well" or "I am writing to express my interest."
    - The reason field must briefly justify the is_job_related decision in one sentence, regardless of outcome.

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
