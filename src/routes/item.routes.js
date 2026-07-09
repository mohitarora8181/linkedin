const { Router } = require("express");
const { createItem, listItems } = require("../controllers/item.controller");
const { requireUser } = require("../middleware/auth");

const router = Router();

router.get("/items", requireUser, listItems);
router.post("/items", requireUser, createItem);

module.exports = router;
