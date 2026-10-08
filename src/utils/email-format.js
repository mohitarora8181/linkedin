function splitSentences(paragraph) {
    if (typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
        return [...segmenter.segment(paragraph)]
            .map(({ segment }) => segment.trim())
            .filter(Boolean);
    }
    return [paragraph];
}

function formatEmailBody(value) {
    const normalized = String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim();
    if (!normalized) return '';

    const paragraphs = normalized
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);

    if (paragraphs.length > 1) return paragraphs.join('\n\n');

    let paragraph = paragraphs[0];
    const greeting = paragraph.match(/^(?:(?:Hi|Hello)(?:\s+[^,\n]+)?|Dear\s+[^,\n]+)[,!]\s*/i);
    const blocks = [];
    if (greeting && paragraph.length > greeting[0].length) {
        blocks.push(greeting[0].trim());
        paragraph = paragraph.slice(greeting[0].length).trim();
    }

    const signoff = paragraph.match(/\s+(Best regards|Kind regards|Warm regards|Sincerely|Regards|Thank you)[,!]?\s*(?:\n)?([^.!?\n]+)?$/i);
    let closing = '';
    if (signoff && signoff.index > 0) {
        closing = signoff[0].trim();
        paragraph = paragraph.slice(0, signoff.index).trim();
    }

    const sentences = splitSentences(paragraph);
    for (let index = 0; index < sentences.length; index += 2) {
        blocks.push(sentences.slice(index, index + 2).join(' '));
    }
    if (closing) blocks.push(closing);
    return blocks.join('\n\n');
}

module.exports = { formatEmailBody };
