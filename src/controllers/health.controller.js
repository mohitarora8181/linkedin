const { supabaseServiceRoleKey, supabaseUrl } = require('../config/env');

function healthCheck(req, res) {
    return res.json({
        success: true,
        services: {
            supabaseConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey)
        }
    });
}

module.exports = { healthCheck };
