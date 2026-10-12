const {
    createBulkEmailBatch,
    getBulkEmailBatches,
    previewBulkEmailFile,
    setBulkEmailBatchPaused
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

async function updateBatchPause(req, res, next, paused) {
    try {
        const result = await setBulkEmailBatchPaused({
            batchId: req.params.batchId,
            userId: req.user.id,
            paused
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return next(error);
    }
}

function pauseBatch(req, res, next) {
    return updateBatchPause(req, res, next, true);
}

function resumeBatch(req, res, next) {
    return updateBatchPause(req, res, next, false);
}

module.exports = { createBatch, listBatches, pauseBatch, previewFile, resumeBatch };
