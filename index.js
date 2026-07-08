const express = require("express");
const { scrapeLinkedInPost, scrapeLinkedInJob } = require("./scraper");

const app = express();

app.use(express.json());

app.get("/health",(req,res)=>{
    return res.json({
        success: true,
    });
})

app.get("/scrape", async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "URL is required"
            });
        }

        let content;

        if (url.includes("linkedin.com/posts")) {
            content = await scrapeLinkedInPost(url.split("?")[0]);
        }
        else if (url.includes("linkedin.com/jobs")) {
            content = await scrapeLinkedInJob(url);
        }
        else {
            return res.status(400).json({
                success: false,
                message: "Invalid LinkedIn URL"
            });
        }

        return res.json({
            success: true,
            content
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});