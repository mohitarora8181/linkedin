const { createClient } = require('@supabase/supabase-js');
const { supabaseServiceRoleKey, supabaseUrl } = require('./env');
const { HttpError } = require('../utils/http-error');

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
        throw new HttpError(500, 'Backend Supabase env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const payload = decodeJwtPayload(supabaseServiceRoleKey);
    if (payload?.role && payload.role !== 'service_role') {
        throw new HttpError(500, 'SUPABASE_SERVICE_ROLE_KEY must be the service_role key, not the anon key.');
    }
}

validateSupabaseConfig();

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

function getSupabase() {
    return supabase;
}

module.exports = { getSupabase, supabase };
