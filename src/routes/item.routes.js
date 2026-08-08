const { Router } = require('express');
const { createItem, getItem, getItemCounts, listItems, markItemSent, repushItem } = require('../controllers/item.controller');
const { requireUser } = require('../middleware/auth');

const router = Router();

router.get('/items', requireUser, listItems);
router.post('/items', requireUser, createItem);
router.get('/items/counts', requireUser, getItemCounts);
router.get('/items/:id', requireUser, getItem);
router.patch('/items/:id/sent', requireUser, markItemSent);
router.post('/items/:id/sent', requireUser, markItemSent);
router.post('/items/:id/repush', requireUser, repushItem);

module.exports = router;
