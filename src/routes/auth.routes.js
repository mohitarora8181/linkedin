const { Router } = require('express');
const { googleCallback, startGoogleLogin } = require('../controllers/auth.controller');
const router = Router();
router.get('/auth/google', startGoogleLogin);
router.get('/auth/google/callback', googleCallback);
module.exports = router;
