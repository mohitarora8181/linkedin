const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { googleClientId, googleClientSecret, googleRedirectUri, googleOauthSuccessUrl, jwtSecret } = require('../config/env');
const { getDatabase } = require('../config/database');
const { newId } = require('../utils/database');
const { HttpError } = require('../utils/http-error');

function client() { return new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri); }
function getCookie(req, name) { const match = (req.headers.cookie || '').split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : null; }
function getAppCallbackUrl(value) {
    const fallback = new URL(googleOauthSuccessUrl || 'linkerin://auth/callback');
    if (!value) return fallback.toString();

    try {
        const requested = new URL(value);
        const isExpectedCallback = requested.protocol === 'linkerin:' && requested.hostname === 'auth' && requested.pathname === '/callback';
        return isExpectedCallback ? requested.toString() : fallback.toString();
    } catch {
        return fallback.toString();
    }
}
function startGoogleLogin(req, res) {
    if (!googleClientId || !googleClientSecret || !googleRedirectUri || !jwtSecret) throw new HttpError(500, 'Google OAuth is not configured.');
    const returnTo = getAppCallbackUrl(req.query.returnTo);
    const state = jwt.sign({ nonce: randomUUID(), returnTo }, jwtSecret, { audience: 'google-oauth-state', expiresIn: '10m' });
    res.cookie('linkerin_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/auth/google' });
    res.redirect(client().generateAuthUrl({ access_type: 'offline', scope: ['openid', 'email', 'profile'], prompt: 'select_account', state }));
}

async function googleCallback(req, res, next) {
    try {
        const savedState = getCookie(req, 'linkerin_oauth_state');
        if (!req.query.code || !savedState || savedState !== req.query.state) throw new HttpError(400, 'Invalid Google OAuth callback state.');
        const state = jwt.verify(savedState, jwtSecret, { audience: 'google-oauth-state' });
        res.clearCookie('linkerin_oauth_state', { path: '/auth/google' });
        const oauthClient = client(); const { tokens } = await oauthClient.getToken(req.query.code);
        const ticket = await oauthClient.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId }); const profile = ticket.getPayload();
        if (!profile?.sub || !profile.email || !profile.email_verified) throw new HttpError(401, 'Google account must have a verified email address.');
        const db = getDatabase(); const [existing] = await db.execute('SELECT * FROM linkerin_users WHERE google_subject = ?', [profile.sub]); let user = existing[0];
        if (user) { await db.execute('UPDATE linkerin_users SET email = ?, name = ?, picture_url = ? WHERE id = ?', [profile.email, profile.name || null, profile.picture || null, user.id]); user = { ...user, email: profile.email, name: profile.name || null, picture_url: profile.picture || null }; }
        else { user = { id: newId(), email: profile.email, name: profile.name || null, picture_url: profile.picture || null }; await db.execute('INSERT INTO linkerin_users (id, google_subject, email, name, picture_url) VALUES (?, ?, ?, ?, ?)', [user.id, profile.sub, user.email, user.name, user.picture_url]); }
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, picture: user.picture_url }, jwtSecret, { expiresIn: '7d' });
        if (googleOauthSuccessUrl) { const target = new URL(getAppCallbackUrl(state.returnTo)); target.searchParams.set('token', token); return res.redirect(target.toString()); }
        return res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, picture: user.picture_url } });
    } catch (error) { next(error); }
}

module.exports = { googleCallback, startGoogleLogin };
