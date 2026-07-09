function extractLinkedInUrl(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s]+/i);

    return match?.[0] || (trimmed.includes("linkedin.com") ? trimmed : "");
}

function getLinkedInItemType(url) {
    const lower = url.toLowerCase();

    if (lower.includes("/jobs/") || lower.includes("currentjobid=") || lower.includes("jobs")) {
        return "job";
    }

    return "post";
}

module.exports = { extractLinkedInUrl, getLinkedInItemType };
