const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

const ACCESS_TOKEN_AUDIENCE = 'linkerin-access';
const REFRESH_TOKEN_AUDIENCE = 'linkerin-refresh';

function getUserClaims(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name || null,
        picture: user.picture_url || user.picture || null
    };
}

function createAccessToken(user) {
    return jwt.sign(getUserClaims(user), jwtSecret, {
        audience: ACCESS_TOKEN_AUDIENCE,
        expiresIn: '15m'
    });
}

function createRefreshToken(user) {
    return jwt.sign(getUserClaims(user), jwtSecret, {
        audience: REFRESH_TOKEN_AUDIENCE,
        expiresIn: '30d'
    });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, jwtSecret, { audience: REFRESH_TOKEN_AUDIENCE });
}

module.exports = {
    ACCESS_TOKEN_AUDIENCE,
    createAccessToken,
    createRefreshToken,
    verifyRefreshToken
};
