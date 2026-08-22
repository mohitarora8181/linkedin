require('dotenv').config();

const isServerless = Boolean(process.env.VERCEL);

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'linkerin.scrape',
    rabbitMqQueue: process.env.RABBITMQ_QUEUE || 'linkerin.scrape.jobs',
    rabbitMqAiQueue: process.env.RABBITMQ_AI_QUEUE || 'groq_ai_parsing',
    rabbitMqUrl: process.env.RABBITMQ_URL,
    mysqlHost: process.env.MYSQL_HOST,
    mysqlPort: parseInt(process.env.MYSQL_PORT || '3306', 10),
    mysqlDatabase: process.env.MYSQL_DATABASE,
    mysqlUser: process.env.MYSQL_USER,
    mysqlPassword: process.env.MYSQL_PASSWORD,
    mysqlSsl: process.env.MYSQL_SSL === 'true',
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    googleOauthSuccessUrl: process.env.GOOGLE_OAUTH_SUCCESS_URL,
    jwtSecret: process.env.JWT_SECRET,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    scrapeConcurrency: parseInt(process.env.SCRAPE_CONCURRENCY || '3', 10),
    enableScrapeWorker: !isServerless && process.env.ENABLE_SCRAPE_WORKER !== 'false',
    enableAiWorker: !isServerless && process.env.ENABLE_AI_WORKER !== 'false'
};

function validateEnv() {
    const required = [
        'RABBITMQ_URL',
        'MYSQL_HOST',
        'MYSQL_DATABASE',
        'MYSQL_USER',
        'MYSQL_PASSWORD',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI',
        'JWT_SECRET',
        'GEMINI_API_KEY',
        'GROQ_API_KEY'
    ];

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[env:error] Missing required environment variables: ${missing.join(', ')}`);
    }
}

validateEnv();

module.exports = env;
