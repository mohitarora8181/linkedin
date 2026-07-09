const express = require("express");
const healthRoutes = require("./routes/health.routes");
const itemRoutes = require("./routes/item.routes");
const scrapeRoutes = require("./routes/scrape.routes");
const { errorHandler } = require("./middleware/error-handler");

const app = express();

app.use(express.json());

app.use(healthRoutes);
app.use(scrapeRoutes);
app.use(itemRoutes);

app.use(errorHandler);

module.exports = app;
