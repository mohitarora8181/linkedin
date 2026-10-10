const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { ACCESS_TOKEN_AUDIENCE } = require('../services/session.service');

function getBearerToken(req) {
    const [type, token] = (req.headers.authorization || '').split(' ');
    return type?.toLowerCase() === 'bearer' ? token : null;
}

function requireUser(req, res, next) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authorization bearer token is required' });
    try {
        const user = jwt.verify(token, jwtSecret);
        const audiences = Array.isArray(user.aud) ? user.aud : [user.aud];
        if (user.aud && !audiences.includes(ACCESS_TOKEN_AUDIENCE)) throw new Error('Invalid token audience');
        if (!user.id || !user.email) throw new Error('Invalid token payload');
        req.user = user;
        return next();
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
    }
}

module.exports = { requireUser };
