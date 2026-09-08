const express = require('express');
const adminRoutes = require('./routes/admin.routes');
const healthRoutes = require('./routes/health.routes');
const itemRoutes = require('./routes/item.routes');
const profileRoutes = require('./routes/profile.routes');
const authRoutes = require('./routes/auth.routes');
const { errorHandler } = require('./middleware/error-handler');
const { corsAllowedOrigins } = require('./config/env');

const app = express();

app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    const normalizedOrigin = typeof requestOrigin === 'string' ? requestOrigin.replace(/\/$/, '') : null;

    if (normalizedOrigin && corsAllowedOrigins.includes(normalizedOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
        if (!normalizedOrigin || !corsAllowedOrigins.includes(normalizedOrigin)) {
            return res.status(403).end();
        }
        return res.status(204).end();
    }

    return next();
});

app.use(express.json());

app.use(healthRoutes);
app.use(authRoutes);
app.use(adminRoutes);
app.use(itemRoutes);
app.use(profileRoutes);

app.use(errorHandler);

module.exports = app;
