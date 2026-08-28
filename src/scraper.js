const puppeteer = require("puppeteer");
const logger = require("./utils/logger");

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const VIEWPORT = {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1
};

const NAVIGATION_TIMEOUT_MS = 60000;
const SELECTOR_TIMEOUT_MS = 30000;

const BLOCKED_RESOURCE_TYPES = new Set(["font", "media", "stylesheet", "image"]);

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

function isPermittedLinkedInNavigation(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'lnkd.in' || host === 'www.lnkd.in' || host === 'linkedin.com' || host.endsWith('.linkedin.com');
    } catch {
        return false;
    }
}

let browser = null;
let browserPromise = null;
let shutdownHandlersInstalled = false;
const MAX_PAGES_PER_BROWSER = 50;

function installShutdownHandlers() {
    if (shutdownHandlersInstalled) return;

    const shutdown = async signal => {
        try {
            logger.info(`Received ${signal}; closing browser`);
            await closeBrowser();
        } catch (error) {
            logger.error("Failed to close browser during shutdown", error, { signal });
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

    logger.info("Launching a new Puppeteer instance");
    const launchedBrowser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        defaultViewport: VIEWPORT,
        protocolTimeout: NAVIGATION_TIMEOUT_MS,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--mute-audio",
            "--disable-gpu",
        ]
    });

    launchedBrowser.activePagesCount = 0;
    launchedBrowser.pagesOpenedCount = 0;

    launchedBrowser.once("disconnected", () => {
        logger.warn("Puppeteer browser disconnected");
        if (browser === launchedBrowser) {
            browser = null;
            browserPromise = null;
        }
    });

    return launchedBrowser;
}

async function getBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    if (!browserPromise) {
        browserPromise = launchBrowser()
            .then(launchedBrowser => {
                browser = launchedBrowser;
                return launchedBrowser;
            })
            .catch(error => {
                logger.error("Failed to launch Puppeteer browser", error);
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

    if (activeBrowser && activeBrowser.isConnected()) {
        logger.info("Closing active browser connection");
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
        try {
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
        } catch (err) {
            // Request might already be handled or closed, ignore safely
            logger.warn("Request interception warning", { error: err.message });
        }
    };

    page.on("request", handleRequest);

    return handleRequest;
}

async function getPageDiagnostics(page, response) {
    try {
        const pageData = await page.evaluate(() => ({
            bodyText: document.body?.innerText?.slice(0, 2000) ?? "",
            title: document.title ?? ""
        }));

        return {
            finalUrl: page.url(),
            responseStatus: response?.status?.() ?? null,
            title: pageData.title,
            bodyText: pageData.bodyText.replace(/\s+/g, " ").trim()
        };
    } catch {
        return {
            finalUrl: page.url(),
            responseStatus: response?.status?.() ?? null
        };
    }
}

function getLinkedInAccessError(diagnostics) {
    const finalUrl = diagnostics.finalUrl?.toLowerCase() ?? "";
    const pageText = `${diagnostics.title ?? ""} ${diagnostics.bodyText ?? ""}`.toLowerCase();

    if (
        finalUrl.includes("/login") ||
        finalUrl.includes("/authwall") ||
        finalUrl.includes("/checkpoint") ||
        /captcha|security verification|unusual activity|verify you are human/.test(pageText)
    ) {
        return "LinkedIn returned an access verification or sign-in page. The server IP may be rate-limited or blocked; retry later or use an authorized LinkedIn data source.";
    }

    if (/this post is unavailable|content is not available|page not found|404/.test(pageText) || diagnostics.responseStatus === 404) {
        return "This LinkedIn post is unavailable, private, or has been removed.";
    }

    if (diagnostics.responseStatus === 403 || diagnostics.responseStatus === 429) {
        return "LinkedIn denied this request from the server. The server IP may be rate-limited or blocked; retry later or use an authorized LinkedIn data source.";
    }

    return null;
}

async function scrapeWithPage({
    label,
    url,
    waitForSelector,
    evaluate
}) {
    const activeBrowser = await getBrowser();
    const page = await activeBrowser.newPage();
    let requestHandler = null;
    let navigationResponse = null;

    activeBrowser.activePagesCount++;
    activeBrowser.pagesOpenedCount++;

    // Handle unexpected page crashes gracefully
    page.on("error", err => {
        logger.error(`Page error event emitted on ${url}`, err, { label });
    });

    try {
        requestHandler = await configurePage(page);

        logger.info(`Navigating to URL: ${url}`, { label });
        navigationResponse = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT_MS
        });

        logger.info(`Waiting for selector: ${waitForSelector}`, { label });
        await page.waitForSelector(waitForSelector, {
            timeout: SELECTOR_TIMEOUT_MS
        });


        logger.info("Evaluating scraping functions on page content", { label });
        return await page.evaluate(evaluate);
    } catch (error) {
        const diagnostics = await getPageDiagnostics(page, navigationResponse);
        const accessError = getLinkedInAccessError(diagnostics);

        logger.error(`${label} scrape failed`, error, {
            ...diagnostics,
            accessError,
            url
        });

        if (accessError) {
            throw new Error(accessError, { cause: error });
        }

        throw error;
    } finally {
        if (requestHandler) {
            try {
                page.off("request", requestHandler);
            } catch (e) {
                // Ignore
            }
        }

        try {
            if (!page.isClosed()) {
                await page.close();
            }
        } catch (error) {
            logger.error("Failed to close page", error, { label, url });
        }

        activeBrowser.activePagesCount--;

        // Browser recreation triggers when max limit reached
        if (activeBrowser.pagesOpenedCount >= MAX_PAGES_PER_BROWSER) {
            if (browser === activeBrowser) {
                logger.info(`Browser reached page threshold (${MAX_PAGES_PER_BROWSER}). Retiring current browser.`);
                browser = null;
                browserPromise = null;
            }
            activeBrowser.shouldCloseWhenIdle = true;
        }

        if (activeBrowser.shouldCloseWhenIdle && activeBrowser.activePagesCount === 0) {
            logger.info("Closing retired browser instance as all active pages have completed.");
            activeBrowser.close().catch(err => {
                logger.error("Error closing retired browser instance", err);
            });
        }
    }
}

async function scrapeLinkedInPost(postUrl) {
    return scrapeWithPage({
        label: "LinkedIn post",
        url: postUrl,
        // Public post pages now use an article card. The old selector expected
        // a container-lined element directly below a section, which LinkedIn no
        // longer renders.
        waitForSelector: "article.main-feed-activity-card, [data-test-id='main-feed-activity-card__commentary']",
        evaluate: () => {
            const $ = (selector, parent = document) => parent.querySelector(selector);
            const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
            const text = (selector, parent = document) => $(selector, parent)?.innerText.trim() ?? null;
            const href = (selector, parent = document) => $(selector, parent)?.href ?? null;
            const src = (selector, parent = document) => $(selector, parent)?.src ?? null;
            const card = $("article.main-feed-activity-card")
                ?? $("[data-test-id='main-feed-activity-card__commentary']")?.closest("article")
                ?? document;
            const commentarySelector = "[data-test-id='main-feed-activity-card__commentary'], .attributed-text-segment-list__content";

            return {
                author: {
                    icon: src("[data-test-id='main-feed-activity-card__entity-lockup'] img", card),
                    name: text("[data-tracking-control-name='public_post_feed-actor-name']", card),
                    href: href("[data-tracking-control-name='public_post_feed-actor-name']", card)?.split("?")[0]
                },
                content: text(commentarySelector, card),
                totalLikes: text("[data-test-id='social-actions__reaction-count']", card),
                mentions: $$(`${commentarySelector} a`, card)
                    .map(anchor => ({
                        url: anchor.href?.split("?")[0],
                        content: anchor.innerText.trim()
                    }))
                    .filter(mention => !mention.content?.includes("lnkd.in")),
                comments: $$("section.comment, .comment").map(comment => ({
                    author: text("[data-tracking-control-name='public_post_comment_actor-name']", comment),
                    content: text("p", comment),
                    url: href(".comment__header > a", comment)?.split("?")[0] ?? null
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
        evaluate: () => {
            const $ = (selector, parent = document) => parent.querySelector(selector);
            const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
            const text = (selector, parent = document) => $(selector, parent)?.innerText.trim() ?? null;
            const href = (selector, parent = document) => $(selector, parent)?.href ?? null;
            const src = (selector, parent = document) => $(selector, parent)?.src ?? null;

            return {
                title: text(".topcard__title"),
                company: {
                    name: text(".topcard__flavor-row > span:nth-child(1) > a"),
                    url: href(".topcard__flavor-row > span:nth-child(1) > a")
                },
                location: text(".topcard__flavor-row > span:nth-child(2)"),
                description: text(".show-more-less-html__markup"),
                recruiter: {
                    icon: src(".message-the-recruiter img"),
                    name: text(".message-the-recruiter h3"),
                    url: href(".message-the-recruiter a"),
                    designation: text(".message-the-recruiter h4")
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

async function resolveLinkedInShortUrl(shortUrl) {
    const activeBrowser = await getBrowser();
    const page = await activeBrowser.newPage();
    let requestHandler = null;

    activeBrowser.activePagesCount++;
    activeBrowser.pagesOpenedCount++;

    try {
        requestHandler = await configurePage(page);
        const protectRedirect = request => {
            if (request.isNavigationRequest() && !isPermittedLinkedInNavigation(request.url())) {
                request.abort();
            }
        };
        page.on('request', protectRedirect);
        await page.goto(shortUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
        const resolvedUrl = page.url();
        if (!isPermittedLinkedInNavigation(resolvedUrl) || /(^|\.)lnkd\.in$/i.test(new URL(resolvedUrl).hostname)) {
            throw new Error('LinkedIn short URL did not resolve to a LinkedIn page.');
        }
        return resolvedUrl;
    } finally {
        if (requestHandler) page.off('request', requestHandler);
        if (!page.isClosed()) await page.close();
        activeBrowser.activePagesCount--;
    }
}

module.exports = { resolveLinkedInShortUrl, scrapeLinkedInPost, scrapeLinkedInJob };
