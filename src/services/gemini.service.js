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
Keep every crucial candidate detail that helps generate personalized recruiter emails. Do not invent facts.`;

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
