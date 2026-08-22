const { Router } = require('express');
const { repushAi } = require('../controllers/admin.controller');
const { requireUser } = require('../middleware/auth');

const router = Router();

router.post('/repush-ai', requireUser, repushAi);

module.exports = router;
