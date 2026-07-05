const puppeteer = require("puppeteer");

async function scrapeLinkedInPost(postUrl) {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: [
            "--start-maximized"
        ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    );

    await page.goto(postUrl, {
        waitUntil: "networkidle2",
        timeout: 60000
    });

    await page.waitForSelector(
        "[data-test-id='main-feed-activity-card__commentary']",
        {
            timeout: 30000
        }
    );

    const data = await page.evaluate(() => {

        const $ = (selector, parent = document) => parent.querySelector(selector);

        const $$ = (selector, parent = document) =>
            [...parent.querySelectorAll(selector)];

        const text = (selector, parent = document) =>
            $(selector, parent)?.innerText.trim() ?? null;

        const href = (selector, parent = document) =>
            $(selector, parent)?.href ?? null;

        const src = (selector, parent = document) =>
            $(selector, parent)?.src ?? null;

        return {
            author: {
                icon: src(
                    "[data-test-id='main-feed-activity-card__entity-lockup'] img"
                ),
                name: text(
                    "[data-test-id='main-feed-activity-card__entity-lockup'] div a"
                ),
                href: href(
                    "[data-test-id='main-feed-activity-card__entity-lockup'] div a"
                )?.split("?")[0]
            },

            content: text(
                "[data-test-id='main-feed-activity-card__commentary']"
            ),

            totalLikes: text(
                "[data-test-id='social-actions__reaction-count']"
            ),

            mentions: $$(
                "[data-test-id='main-feed-activity-card__commentary'] > a"
            ).map(anchor => ({
                url: anchor.href?.split("?")[0],
                content: anchor.innerText.trim()
            })),

            comments: $$("section .comment").map(comment => ({
                author: text(
                    "[data-tracking-control-name='public_post_comment_actor-name']",
                    comment
                ),

                content: text("p", comment),

                url:
                    href(".comment__header > a", comment)?.split("?")[0] ?? null
            }))
        };
    });

    await browser.close();

    return data;
}

async function scrapeLinkedInJob(jobUrl) {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ["--start-maximized"]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    );

    await page.goto(jobUrl, {
        waitUntil: "networkidle2",
        timeout: 60000
    });

    await page.waitForSelector(".topcard__title", {
        timeout: 30000
    });

    const job = await page.evaluate(() => {

        const $ = (selector, parent = document) =>
            parent.querySelector(selector);

        const $$ = (selector, parent = document) =>
            [...parent.querySelectorAll(selector)];

        const text = (selector, parent = document) =>
            $(selector, parent)?.innerText.trim() ?? null;

        const href = (selector, parent = document) =>
            $(selector, parent)?.href ?? null;

        const src = (selector, parent = document) =>
            $(selector, parent)?.src ?? null;

        return {

            title: text(".topcard__title"),

            company: {
                name: text(
                    ".topcard__flavor-row > span:nth-child(1) > a"
                ),
                url: href(
                    ".topcard__flavor-row > span:nth-child(1) > a"
                )
            },

            location: text(
                ".topcard__flavor-row > span:nth-child(2)"
            ),

            description: text(
                ".show-more-less-html__markup"
            ),

            recruiter: {
                icon: src(
                    ".message-the-recruiter img"
                ),

                name: text(
                    ".message-the-recruiter h3"
                ),

                url: href(
                    ".message-the-recruiter a"
                ),

                designation: text(
                    ".message-the-recruiter h4"
                )
            },

            additional_details: (() => {
                const list = document.querySelector(".description__job-criteria-list");

                if (!list) return {};

                return [...list.children].reduce((obj, item) => {
                    const key = item.children[0]?.innerText
                        ?.trim()
                        .toLowerCase()
                        .replace(/\s+/g, "_");

                    const value = item.children[1]?.innerText?.trim() ?? null;

                    if (key) {
                        obj[key] = value;
                    }

                    return obj;
                }, {});
            })()

        };
    });

    await browser.close();

    return job;
}

module.exports = { scrapeLinkedInPost, scrapeLinkedInJob };