const { getResumeProfileForUser, saveResumeProfile } = require('../services/profile.service');
const { getGmailConnectionStatus } = require('../services/gmail.service');

async function getResumeProfile(req, res, next) {
    try {
        const profile = await getResumeProfileForUser({ userId: req.user.id });
        const gmail = await getGmailConnectionStatus({ email: req.user.email, userId: req.user.id });
        return res.json({
            success: true,
            hasResume: Boolean(profile?.resume_summary),
            gmail,
            profile
        });
    } catch (err) {
        next(err);
    }
}

async function uploadResume(req, res, next) {
    try {
        const profile = await saveResumeProfile({ file: req.file, user: req.user });
        return res.status(201).json({
            success: true,
            hasResume: true,
            profile
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getResumeProfile, uploadResume };
