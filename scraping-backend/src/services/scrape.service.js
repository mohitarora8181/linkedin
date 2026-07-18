const { scrapeLinkedInJob, scrapeLinkedInPost } = require("../scraper");

async function scrapeLinkedInUrl(url) {
    if (url.includes("linkedin.com/posts")) {
        return scrapeLinkedInPost(url.split("?")[0]);
    }

    if (url.includes("linkedin.com/jobs")) {
        return scrapeLinkedInJob(url);
    }

    throw new Error("Invalid LinkedIn URL");
}

module.exports = { scrapeLinkedInUrl };
