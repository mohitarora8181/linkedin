const { getConnection } = require('../config/rabbitmq');
const { getSupabase } = require('../config/supabase');

async function getHealth(req, res, next) {
    try {
        const health = {
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            message: 'LinkerIn backend is up and running',
            services: {
                express: 'up',
                rabbitmq: 'down',
                supabase: 'down'
            }
        };

        try {
            const conn = await getConnection();
            if (conn) {
                health.services.rabbitmq = 'connected';
            }
        } catch (err) {
            health.status = 'degraded';
            health.services.rabbitmq = `error: ${err.message}`;
        }

        try {
            const supabase = getSupabase();
            const { error } = await supabase.from('linkerin_items').select('id').limit(1);
            if (!error) {
                health.services.supabase = 'connected';
            } else {
                health.status = 'degraded';
                health.services.supabase = `error: ${error.message}`;
            }
        } catch (err) {
            health.status = 'degraded';
            health.services.supabase = `error: ${err.message}`;
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        return res.status(statusCode).json(health);
    } catch (err) {
        next(err);
    }
}

module.exports = { getHealth };
