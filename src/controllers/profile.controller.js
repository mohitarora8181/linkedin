const { getPublicResumeBySlug, getPublicResumeUrl, getResumeProfileForUser, saveResumeProfile, updateAutoEmailSetting } = require('../services/profile.service');
const { getGmailConnectionStatus, queueEligibleAutoEmails } = require('../services/gmail.service');

async function getResumeProfile(req, res, next) {
    try {
        const profile = await getResumeProfileForUser({ userId: req.user.id });
        const gmail = await getGmailConnectionStatus({ email: req.user.email, userId: req.user.id });
        return res.json({
            success: true,
            hasResume: Boolean(profile?.resume_summary),
            autoEmailEnabled: Boolean(profile?.auto_email_enabled),
            gmail,
            publicResumeUrl: profile?.public_resume_slug ? getPublicResumeUrl(profile.public_resume_slug) : null,
            profile
        });
    } catch (err) {
        next(err);
    }
}

async function getPublicResume(req, res, next) {
    try {
        const resume = await getPublicResumeBySlug({ slug: req.params.slug });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, ...resume });
    } catch (err) {
        return next(err);
    }
}

async function uploadResume(req, res, next) {
    try {
        const profile = await saveResumeProfile({ file: req.file, user: req.user });
        return res.status(201).json({
            success: true,
            hasResume: true,
            publicResumeUrl: profile?.public_resume_slug ? getPublicResumeUrl(profile.public_resume_slug) : null,
            profile
        });
    } catch (err) {
        next(err);
    }
}

async function setAutoEmail(req, res, next) {
    try {
        const enabled = await updateAutoEmailSetting({
            enabled: req.body?.enabled,
            userId: req.user.id
        });
        if (enabled) {
            await queueEligibleAutoEmails({ userId: req.user.id });
        }
        return res.json({ success: true, enabled });
    } catch (err) {
        next(err);
    }
}

module.exports = { getPublicResume, getResumeProfile, setAutoEmail, uploadResume };
