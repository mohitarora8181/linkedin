const { Router } = require('express');
const { repushAi } = require('../controllers/admin.controller');

const router = Router();

router.post('/repush-ai', repushAi);

module.exports = router;
