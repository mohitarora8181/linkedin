const { createClient } = require("@supabase/supabase-js");
const { supabaseServiceRoleKey, supabaseUrl } = require("./env");

const supabase = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;

function getSupabase() {
    if (!supabase) {
        throw new Error("Supabase backend env is not configured");
    }

    return supabase;
}

module.exports = { getSupabase, supabase };
