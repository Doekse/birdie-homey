'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatThreeByteVersion } = require('../lib/Utils/formatVersion');

test('formatThreeByteVersion formats major.minor.patch', () => {
  const buf = Buffer.from([1, 2, 3]);
  assert.equal(formatThreeByteVersion(buf), '1.2.3');
});

test('formatThreeByteVersion returns null for short buffers', () => {
  assert.equal(formatThreeByteVersion(Buffer.from([1, 2])), null);
  assert.equal(formatThreeByteVersion(null), null);
});
