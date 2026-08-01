const express = require('express');
const adminRoutes = require('./routes/admin.routes');
const healthRoutes = require('./routes/health.routes');
const itemRoutes = require('./routes/item.routes');
const profileRoutes = require('./routes/profile.routes');
const { errorHandler } = require('./middleware/error-handler');

const app = express();

app.use(express.json());

app.use(healthRoutes);
app.use(adminRoutes);
app.use(itemRoutes);
app.use(profileRoutes);

app.use(errorHandler);

module.exports = app;
