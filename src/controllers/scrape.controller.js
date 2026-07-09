const { scrapeLinkedInUrl } = require("../services/scrape.service");

async function scrape(req, res, next) {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "URL is required"
            });
        }

        const content = await scrapeLinkedInUrl(url);

        return res.json({
            success: true,
            content
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { scrape };
