const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDateDDMMYYYY, toIsoTimestamp } = require('./bulk-email.service');

test('formats recent bulk email batch dates as DD/MM/YYYY', () => {
    assert.equal(formatDateDDMMYYYY(new Date('2026-10-16T23:09:15.626Z')), '16/10/2026');
});

test('serializes scheduled bulk email dates as UTC ISO timestamps', () => {
    assert.equal(toIsoTimestamp('2026-10-18 00:30:00.000'), '2026-10-18T00:30:00.000Z');
    assert.equal(toIsoTimestamp('2026-10-18T00:30:00.000Z'), '2026-10-18T00:30:00.000Z');
    assert.equal(toIsoTimestamp(null), null);
});
