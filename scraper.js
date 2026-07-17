const puppeteer = require("puppeteer");

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const VIEWPORT = {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1
};

const NAVIGATION_TIMEOUT_MS = 60000;
const SELECTOR_TIMEOUT_MS = 30000;

const BLOCKED_RESOURCE_TYPES = new Set(["font", "media", "stylesheet"]);

const BLOCKED_URL_PATTERNS = [
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "analytics.licdn.com",
    "px.ads.linkedin.com",
    "facebook.com/tr",
    "hotjar.com",
    "segment.io"
];

let browser = null;
let browserPromise = null;
let shutdownHandlersInstalled = false;

function logInfo(message, meta = {}) {
    console.log(`[scraper] ${message}`, meta);
}

function logError(message, error, meta = {}) {
    console.error(`[scraper] ${message}`, {
        ...meta,
        message: error?.message,
        stack: error?.stack
    });
}

function installShutdownHandlers() {
    if (shutdownHandlersInstalled) return;

    const shutdown = async signal => {
        try {
            logInfo(`received ${signal}; closing browser`);
            await closeBrowser();
        } catch (error) {
            logError("failed to close browser during shutdown", error, { signal });
        } finally {
            process.exit(0);
        }
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    shutdownHandlersInstalled = true;
}

async function launchBrowser() {
    installShutdownHandlers();

    const launchedBrowser = await puppeteer.launch({
        headless: true,
        defaultViewport: VIEWPORT,
        protocolTimeout: NAVIGATION_TIMEOUT_MS,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--mute-audio"
        ]
    });

    launchedBrowser.once("disconnected", () => {
        browser = null;
        browserPromise = null;
    });

    return launchedBrowser;
}

async function getBrowser() {
    if (browser?.isConnected()) {
        return browser;
    }

    if (!browserPromise) {
        browserPromise = launchBrowser()
            .then(launchedBrowser => {
                browser = launchedBrowser;
                return launchedBrowser;
            })
            .catch(error => {
                browser = null;
                browserPromise = null;
                throw error;
            });
    }

    return browserPromise;
}

async function closeBrowser() {
    const activeBrowser = browser;

    browser = null;
    browserPromise = null;

    if (activeBrowser?.isConnected()) {
        await activeBrowser.close();
    }
}

async function configurePage(page) {
    page.setDefaultTimeout(SELECTOR_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    await page.setUserAgent(USER_AGENT);
    await page.setViewport(VIEWPORT);
    await page.setRequestInterception(true);

    const handleRequest = request => {
        const requestUrl = request.url();

        if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
            request.abort();
            return;
        }

        if (BLOCKED_URL_PATTERNS.some(pattern => requestUrl.includes(pattern))) {
            request.abort();
            return;
        }

        request.continue();
    };

    page.on("request", handleRequest);

    return handleRequest;
}

async function scrapeWithPage({
    label,
    url,
    waitForSelector,
    waitForImageSrcSelectors = [],
    evaluate
}) {
    const activeBrowser = await getBrowser();
    const page = await activeBrowser.newPage();
    let requestHandler = null;

    try {
        requestHandler = await configurePage(page);

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT_MS
        });

        await page.waitForSelector(waitForSelector, {
            timeout: SELECTOR_TIMEOUT_MS
        });

        for (const selector of waitForImageSrcSelectors) {
            try {
                const selectorExists = await page.$(selector);
                if (!selectorExists) {
                    continue;
                }

                await page.waitForFunction(
                    imageSelector => {
                        const image = document.querySelector(imageSelector);
                        return Boolean(
                            image?.currentSrc || image?.src || image?.getAttribute("src")
                        );
                    },
                    { timeout: SELECTOR_TIMEOUT_MS },
                    selector
                );
            } catch (error) {
                logInfo("image src selector did not resolve before timeout", {
                    label,
                    selector
                });
            }
        }

        return await page.evaluate(evaluate);
    } catch (error) {
        logError(`${label} scrape failed`, error, { url });
        throw error;
    } finally {
        if (requestHandler) {
            page.off("request", requestHandler);
        }

        try {
            if (!page.isClosed()) {
                await page.close();
            }
        } catch (error) {
            logError("failed to close page", error, { label, url });
        }
    }
}

async function scrapeLinkedInPost(postUrl) {
    return scrapeWithPage({
        label: "LinkedIn post",
        url: postUrl,
        waitForSelector: "[data-test-id='main-feed-activity-card__commentary']",
        waitForImageSrcSelectors: [
            "[data-test-id='main-feed-activity-card__entity-lockup'] img"
        ],
        evaluate: () => {

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
                )
                    .map(anchor => ({
                        url: anchor.href?.split("?")[0],
                        content: anchor.innerText.trim()
                    }))
                    .filter(mention => !mention.content?.includes("lnkd.in")),

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
        }
    });
}

async function scrapeLinkedInJob(jobUrl) {
    return scrapeWithPage({
        label: "LinkedIn job",
        url: jobUrl,
        waitForSelector: ".topcard__title",
        waitForImageSrcSelectors: [".message-the-recruiter img"],
        evaluate: () => {

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
        }
    });
}

module.exports = { scrapeLinkedInPost, scrapeLinkedInJob };
