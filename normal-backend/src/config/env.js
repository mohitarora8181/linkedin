require('dotenv').config();

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'linkerin.scrape',
    rabbitMqQueue: process.env.RABBITMQ_QUEUE || 'linkerin.scrape.jobs',
    rabbitMqAiQueue: process.env.RABBITMQ_AI_QUEUE || 'groq_ai_parsing',
    rabbitMqUrl: process.env.RABBITMQ_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
};

function validateEnv() {
    const required = [
        'RABBITMQ_URL',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'GEMINI_API_KEY',
        'GROQ_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[env:error] Missing required environment variables: ${missing.join(', ')}`);
    }
}

validateEnv();

module.exports = env;
