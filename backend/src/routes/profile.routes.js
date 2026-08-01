const multer = require('multer');
const { Router } = require('express');
const { getResumeProfile, uploadResume } = require('../controllers/profile.controller');
const { requireUser } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
});
const router = Router();

router.get('/profile/resume', requireUser, getResumeProfile);
router.post('/profile/resume', requireUser, upload.single('resume'), uploadResume);

module.exports = router;
