const { createClient } = require('@supabase/supabase-js');
const { supabaseServiceRoleKey, supabaseUrl } = require('./env');

function decodeJwtPayload(token) {
    try {
        const [, payload] = token.split('.');
        if (!payload) return null;

        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    } catch {
        return null;
    }
}

function validateSupabaseConfig() {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error('Supabase env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const payload = decodeJwtPayload(supabaseServiceRoleKey);
    if (payload?.role && payload.role !== 'service_role') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY must be the service_role key, not the anon key.');
    }
}

let supabase = null;

try {
    validateSupabaseConfig();
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
} catch (err) {
    console.error('[supabase:error] Failed to initialize Supabase client:', err.message);
}

function getSupabase() {
    if (!supabase) {
        throw new Error('Supabase client is not initialized.');
    }
    return supabase;
}

module.exports = { getSupabase, supabase };
