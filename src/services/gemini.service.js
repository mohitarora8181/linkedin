const { geminiKey, geminiModel } = require('../config/env');
const { HttpError } = require('../utils/http-error');

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
        throw new Error('Gemini returned non-JSON resume summary.');
    }
}

async function summarizeResumeWithGemini(file) {
    if (!geminiKey) {
        throw new HttpError(500, 'Gemini API key is not configured.');
    }

    if (!file?.buffer?.length) {
        throw new HttpError(400, 'Resume file is required.');
    }

    const prompt = `Parse this candidate resume and return only strict JSON with this shape:
    {
    "headline": "short candidate positioning statement",
    "summary": "concise but complete professional summary",
    "skills": ["skill"],
    "roles": [{"title":"", "company":"", "duration":"", "impact":[""]}],
    "projects": [{"name":"", "summary":"", "tech":[""]}],
    "education": [""],
    "contact": {"name":"", "email":"", "phone":"", "links":[""]},
    "strengths": [""],
    "target_roles": [""]
    }

    Rules:
    - Return strict JSON only. No markdown, no code fences, no text outside the JSON object.
    - Do not invent, infer, or embellish any fact not explicitly present in the resume text. If a field's value cannot be found, use an empty string "" for string fields, an empty array [] for list fields, and omit nothing from the shape — every key must always be present.
    - contact.name must be the candidate's actual full name as it appears on the resume. This field is used to sign generated emails, so extract it exactly as written even if it appears only in a header, footer, or file title within the text — never leave it blank if the name appears anywhere in the input.
    - contact.email and contact.phone must only be filled if literally present in the resume text. Never construct, guess, or auto-format an email/phone number.
    - skills should be specific and grounded in the resume (e.g. "React Native", "SQL query optimization") — not generic categories like "programming" or "teamwork" unless the resume itself only states them that way.
    - roles must be listed in the order they appear in the resume (most recent first if the resume is ordered that way). Each impact entry should be a specific, concrete accomplishment or responsibility as stated in the resume — do not paraphrase into vague summaries, and do not merge multiple distinct achievements into one line.
    - projects should only include items explicitly described as projects, personal work, or portfolio items in the resume — do not reclassify a job role as a project.
    - headline and summary must be written using only facts present elsewhere in the extracted JSON (skills, roles, education) — they should read as a natural positioning statement, not copy-pasted resume text, but must not introduce any claim (seniority level, years of experience, specialization) that isn't supported by the roles/skills/education listed.
    - strengths and target_roles should be inferred conservatively from the actual content of the resume (e.g. a clear pattern across roles/skills) — do not invent aspirations or specializations the candidate hasn't demonstrated or stated.
    - education entries should include institution and degree/field as written; do not guess graduation years or GPAs if not stated.
    - If the input does not appear to be a resume at all, still return the full JSON shape with all fields empty/blank rather than an error or explanatory text.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: file.mimetype || 'application/octet-stream',
                                data: file.buffer.toString('base64')
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new HttpError(502, payload?.error?.message || 'Gemini resume parsing failed.');
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n');
    if (!text) {
        throw new HttpError(502, 'Gemini did not return a resume summary.');
    }

    return parseJsonFromText(text);
}

module.exports = { summarizeResumeWithGemini };
