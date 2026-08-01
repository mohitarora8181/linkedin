const { groqApiKey, groqModel } = require('../config/env');
const { getSupabase } = require('../config/supabase');
const { HttpError } = require('../utils/http-error');
const logger = require('../utils/logger');

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

    Follow these steps in order. Do not skip steps, and do not reveal your step-by-step reasoning in the output — only the final JSON.

    STEP 1 — Verify the content itself is job-related:
    - For item_type "job", always treat it as job related.
    - For item_type "post", decide if it is truly about a job opening, hiring request, referral opportunity, internship, freelance role, or recruiter call — regardless of who is posting it. If it is not job-related at all (e.g. a general update, opinion post, celebration, article share unrelated to hiring), set is_job_related to false and leave recruiter_email/subject/message as null, fill "reason" with a one-line explanation, and stop — do not proceed to later steps.
    - If it is job-related in any way, set is_job_related to true and proceed to Step 2, even if the author may not be the direct hiring contact.

    STEP 2 — Determine whether the author is the direct recruiter/hiring contact:
    - Check whether the post/job author is personally offering or hiring for this role (their own team's opening, or they are the hiring manager/recruiter/founder referenced in the content) versus simply sharing, reposting, or reacting to someone else's opportunity.
    - This determination does NOT change is_job_related — it only changes how the email is addressed and greeted in Step 5. Note your finding briefly in "reason" regardless of outcome (e.g. "author is the hiring manager for this role" or "author is resharing another company's opening, not the direct hiring contact").

    STEP 3 — Find the contact email:
    - Look for a recruiter or contact email anywhere in the job/post text AND in any comments included in the content JSON — recruiters often post their email in a reply to their own post rather than in the main text.
    - If multiple emails appear, prefer one explicitly attributed to the post author or a named hiring contact over an email from an unrelated commenter.
    - If no valid contact email is found anywhere, use null. Never guess, construct, or auto-format an email address.

    STEP 4 — Select relevant resume content (do not use everything):
    - From resumeSummary, choose only the 1-2 roles, 0-1 project, and 3-6 skills that are most relevant to the specific role/requirements mentioned in the LinkedIn content. Do not include every role, every project, or every skill from the resume in the email — pick only what directly strengthens the fit for this specific opportunity.
    - When referencing a role, project, or achievement, keep the attribution exactly as it appears in resumeSummary — never attach an achievement, skill, or impact line to the wrong role, company, or project, and never merge details from two different roles/projects into one claim.
    - If nothing in resumeSummary is clearly relevant to the opportunity, use only the candidate's headline/summary and the most generally applicable 2-3 skills rather than forcing an irrelevant role or project into the email.

    STEP 5 — Write the email:
    - Greeting: if Step 2 found the author is the direct hiring contact and their name is available, greet them by name. If the author is not the direct hiring contact, or no name is available, use a neutral professional greeting (e.g. "Hi," or "Hello,") rather than guessing a name or company HR title.
    - Subject must be concise, specific, and reference the actual role or company from the content — never generic (e.g. not "Application for Job Opportunity").
    - Message must be a short, personalized cover-email body (120-180 words) that connects the specific opportunity to the specific resume details selected in Step 4. It must read as a finished, formal, natural email a human would send — not a template, and concise enough for a busy recruiter to read in under 30 seconds.
    - Format the message for email readability: a one-line greeting, then a blank line, then 2-3 short body paragraphs (2-4 sentences each) separated by blank lines, then a blank line, then a closing line and sign-off. Use "\\n\\n" between each paragraph/section so it renders as distinct blocks in an email client. Do not use bullet points, markdown, headers, or bold/italic syntax inside the message — plain, well-spaced prose only.
    - Keep each paragraph focused on one idea: paragraph 1 = the hook referencing the specific opportunity, paragraph 2 = the selected relevant background/fit from Step 4, final short paragraph = a clear, low-friction next step or ask.
    - Sign the message using the candidate's actual name from resumeSummary if present. If the candidate's name is not present, end with "Best regards," and no name line, rather than any bracketed placeholder.
    - Never use placeholder text of any kind (e.g. "[Your Name]", "[Company]", "[mention experience here]", "Dear Hiring Manager" as a guess when a real name is available). If a detail is missing, omit that sentence/line entirely or phrase around it naturally — do not leave a gap or bracket for the user to fill in.
    - Do not invent or assume: experience, skills, certifications, links, email addresses, company names, role titles, salary, location, or any fact not explicitly present in resumeSummary or the LinkedIn content. If uncertain about a fact, exclude it rather than include it.
    - Do not use generic filler openers like "I hope this email finds you well" or "I am writing to express my interest."

    The "reason" field must briefly state, in one sentence, why is_job_related was set to true or false, and if true, whether the author was found to be the direct hiring contact or not.

    Return strict JSON only, in exactly this shape, with no markdown, no code fences, and no text outside the JSON object:
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

    logger.info(`Sending request to Groq API for item ${item.id}`, { model: groqModel });
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
                {
                    role: 'system',
                    content: 'You are a strict JSON-generation engine for recruiting email drafts. You always follow the instructions in the user message exactly. You never output markdown, code fences, explanations, or reasoning text — only the raw JSON object requested. If you would normally show your thinking, suppress it entirely and go straight to the final JSON.'
                },
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
