const { listItemsForUser, saveLinkedInItem } = require("../services/item.service");

async function listItems(req, res, next) {
    try {
        const items = await listItemsForUser(req.user.id);

        return res.json({
            success: true,
            items
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
