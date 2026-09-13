const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');
const { gmailTokenEncryptionKey } = require('../config/env');

function getKey() {
    if (!gmailTokenEncryptionKey) {
        throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is not configured.');
    }

    const key = Buffer.from(gmailTokenEncryptionKey, 'base64');
    if (key.length !== 32) {
        throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }

    return key;
}

function encryptSecret(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
}

function decryptSecret(value) {
    const [ivValue, tagValue, encryptedValue] = String(value).split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
        throw new Error('Encrypted secret is malformed.');
    }

    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

module.exports = { decryptSecret, encryptSecret };
