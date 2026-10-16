const test = require('node:test');
const assert = require('node:assert/strict');
const { collectEmailCandidates } = require('./ai.service');

test('collects every distinct post email from the body and comments', () => {
    const bodyEmails = Array.from({ length: 25 }, (_, index) => `person${index}@example.com`);
    const item = {
        item_type: 'post',
        content: {
            content: `Contact us: ${bodyEmails.join(', ')}`,
            comments: [
                { author: 'Recruiter', content: 'Also write to PERSON0@example.com or extra@example.com' }
            ]
        }
    };

    const candidates = collectEmailCandidates(item);

    assert.equal(candidates.length, 26);
    assert.deepEqual(candidates.map(({ email }) => email), [
        ...bodyEmails,
        'extra@example.com'
    ]);
});
