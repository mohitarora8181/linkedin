require('dotenv').config();

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3001,
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'linkerin.scrape',
    rabbitMqQueue: process.env.RABBITMQ_QUEUE || 'linkerin.scrape.jobs',
    rabbitMqAiQueue: process.env.RABBITMQ_AI_QUEUE || 'groq_ai_parsing',
    rabbitMqUrl: process.env.RABBITMQ_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

function validateEnv() {
    const required = [
        'RABBITMQ_URL',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[env:error] Missing required environment variables: ${missing.join(', ')}`);
    }
}

validateEnv();

module.exports = env;
