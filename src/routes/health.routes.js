const { Router } = require("express");
const { healthCheck } = require("../controllers/health.controller");

const router = Router();

router.get("/health", healthCheck);

module.exports = router;
