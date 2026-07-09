const { listItemsForUser, saveLinkedInItem } = require('../services/item.service');

function normalizeType(value) {
    return value === 'post' || value === 'job' ? value : null;
}

async function listItems(req, res, next) {
    try {
        const result = await listItemsForUser({
            cursor: req.query.cursor,
            limit: req.query.limit,
            search: req.query.search,
            type: normalizeType(req.query.type),
            userId: req.user.id
        });

        return res.json({
            success: true,
            ...result
        });
    } catch (err) {
        next(err);
    }
}

async function createItem(req, res, next) {
    try {
        const result = await saveLinkedInItem({
            rawUrl: req.body?.url,
            user: req.user
        });

        return res.status(result.duplicate ? 200 : 201).json({
            success: true,
            ...result
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { createItem, listItems };
