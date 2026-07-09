const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE || 'linkerin.scrape',
    rabbitMqQueue: process.env.RABBITMQ_QUEUE || 'linkerin.scrape.jobs',
    rabbitMqUrl: process.env.RABBITMQ_URL || 'amqp://localhost',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL
};

module.exports = env;
