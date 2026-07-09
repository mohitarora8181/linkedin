const { Router } = require("express");
const { scrape } = require("../controllers/scrape.controller");

const router = Router();

router.get("/scrape", scrape);

module.exports = router;
