const { Router } = require("express");
const { createItem, getItem, listItems } = require("../controllers/item.controller");
const { requireUser } = require("../middleware/auth");

const router = Router();

router.get("/items", requireUser, listItems);
router.get("/items/:id", requireUser, getItem);
router.post("/items", requireUser, createItem);

module.exports = router;


