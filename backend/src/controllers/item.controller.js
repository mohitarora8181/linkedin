const { getItemForUser, listItemsForUser, repushItemForUser, saveLinkedInItem } = require('../services/item.service');

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

async function getItem(req, res, next) {
    try {
        const item = await getItemForUser({
            itemId: req.params.id,
            userId: req.user.id
        });

        return res.json({
            success: true,
            item
        });
    } catch (err) {
        next(err);
    }
}

async function repushItem(req, res, next) {
    try {
        const item = await repushItemForUser({
            itemId: req.params.id,
            userId: req.user.id
        });

        return res.status(202).json({
            success: true,
            item,
            queued: true
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

        return res.status(result.duplicate ? 200 : 202).json({
            success: true,
            ...result
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { createItem, getItem, listItems, repushItem };
