const { resolveLinkedInShortUrl, scrapeLinkedInJob, scrapeLinkedInPost } = require("../scraper");
const { isLinkedInShortUrl } = require('../utils/linkedin-url');

async function scrapeLinkedInUrl(url) {
    const resolvedUrl = isLinkedInShortUrl(url) ? await resolveLinkedInShortUrl(url) : url;

    if (resolvedUrl.includes("linkedin.com/posts")) {
        return { content: await scrapeLinkedInPost(resolvedUrl.split("?")[0]), itemType: 'post', sourceUrl: resolvedUrl };
    }

    if (resolvedUrl.includes("linkedin.com/jobs")) {
        return { content: await scrapeLinkedInJob(resolvedUrl), itemType: 'job', sourceUrl: resolvedUrl };
    }

    throw new Error("Invalid LinkedIn URL");
}

module.exports = { scrapeLinkedInUrl };
