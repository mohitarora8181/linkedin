const multer = require('multer');
const { Router } = require('express');
const { createBatch, listBatches, previewFile } = require('../controllers/bulk-email.controller');
const { requireUser } = require('../middleware/auth');
const { HttpError } = require('../utils/http-error');
const logger = require('../utils/logger');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 10, parts: 12 }
});
const router = Router();

function uploadSpreadsheet(req, res, next) {
    upload.single('file')(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            logger.warn('Bulk spreadsheet multipart upload rejected', {
                code: error.code,
                field: error.field
            });
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return next(new HttpError(413, 'Spreadsheet files must be 8 MB or smaller.'));
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new HttpError(400, 'Upload only one spreadsheet file using the file field.'));
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FIELD_COUNT') {
            return next(new HttpError(400, 'Too many spreadsheet mapping fields were submitted. Reopen the sheet mapper and try again.'));
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_PART_COUNT') {
            return next(new HttpError(400, 'The spreadsheet upload contained too many form parts. Reopen the sheet mapper and try again.'));
        }
        if (error instanceof multer.MulterError) {
            return next(new HttpError(400, `Spreadsheet upload rejected (${error.code}). Please reselect the file and try again.`));
        }
        return next(error);
    });
}

router.get('/bulk-email/batches', requireUser, listBatches);
router.post('/bulk-email/preview', requireUser, uploadSpreadsheet, previewFile);
router.post('/bulk-email/batches', requireUser, uploadSpreadsheet, createBatch);

module.exports = router;
