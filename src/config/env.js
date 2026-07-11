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
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
};

module.exports = env;
