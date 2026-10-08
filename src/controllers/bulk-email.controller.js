const {
    createBulkEmailBatch,
    getBulkEmailBatches,
    previewBulkEmailFile
} = require('../services/bulk-email.service');

async function previewFile(req, res, next) {
    try {
        const result = await previewBulkEmailFile({ file: req.file });
        return res.json({ success: true, ...result });
    } catch (error) {
        return next(error);
    }
}

async function createBatch(req, res, next) {
    try {
        const result = await createBulkEmailBatch({
            file: req.file,
            sheetName: req.body?.sheetName,
            columnMapping: {
                emailToColumn: req.body?.emailToColumn,
                hrNameColumn: req.body?.hrNameColumn || null,
                jobRoleColumn: req.body?.jobRoleColumn || null,
                companyColumn: req.body?.companyColumn || null
            },
            user: req.user
        });
        return res.status(202).json({ success: true, ...result });
    } catch (error) {
        return next(error);
    }
}

async function listBatches(req, res, next) {
    try {
        const batches = await getBulkEmailBatches({ userId: req.user.id });
        return res.json({ success: true, batches });
    } catch (error) {
        return next(error);
    }
}

module.exports = { createBatch, listBatches, previewFile };
