const env = {
    port: process.env.PORT || 3000,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL
};

module.exports = env;
