function extractLinkedInUrl(value) {
    const trimmed = String(value || '').trim();
    const match = trimmed.match(/https?:\/\/(?:(?:[a-z]{2,3}\.)?linkedin\.com|(?:www\.)?lnkd\.in)\/[^\s]+/i);

    return match?.[0] || '';
}

function isLinkedInShortUrl(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'lnkd.in' || host === 'www.lnkd.in';
    } catch {
        return false;
    }
}

function getLinkedInItemType(url) {
    const lower = url.toLowerCase();

    if (lower.includes("linkedin.com/jobs")) {
        return "job";
    }

    return "post";
}

module.exports = { extractLinkedInUrl, getLinkedInItemType, isLinkedInShortUrl };
