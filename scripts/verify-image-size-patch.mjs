import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { imageSize } = require("image-size");
const { findBox } = require("image-size/dist/types/utils");

const invalidIcns = Buffer.alloc(16);
invalidIcns.write("icns", 0, "ascii");
invalidIcns.writeUInt32BE(16, 4);
invalidIcns.write("ic07", 8, "ascii");
invalidIcns.writeUInt32BE(0, 12);

assert.throws(() => imageSize(invalidIcns), /Invalid ICNS entry length/);

const zeroSizedIsoBox = Buffer.alloc(8);
zeroSizedIsoBox.writeUInt32BE(0, 0);
zeroSizedIsoBox.write("jxlp", 4, "ascii");
assert.equal(findBox(zeroSizedIsoBox, "jxlp", 0), undefined);

console.log("image-size denial-of-service regression checks passed");
