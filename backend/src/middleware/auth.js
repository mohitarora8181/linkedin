const { getSupabase } = require('../config/supabase');

function getBearerToken(req) {
    const header = req.headers.authorization || '';
    const [type, token] = header.split(' ');

    return type?.toLowerCase() === 'bearer' ? token : null;
}

async function requireUser(req, res, next) {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authorization bearer token is required'
            });
        }

        const { data, error } = await getSupabase().auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                success: false,
                message: error?.message || 'Invalid user token'
            });
        }

        req.user = data.user;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireUser };
