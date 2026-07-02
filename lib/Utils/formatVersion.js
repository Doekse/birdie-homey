'use strict';

/**
 * Formats Birdie Pro 3-byte major/minor/patch version characteristics.
 *
 * @param {Buffer} buf
 * @returns {string | null}
 */
function formatThreeByteVersion(buf) {
  if (!buf || buf.length < 3) {
    return null;
  }

  return `${buf.readUInt8(0)}.${buf.readUInt8(1)}.${buf.readUInt8(2)}`;
}

module.exports = {
  formatThreeByteVersion,
};
