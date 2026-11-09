"use strict";

// Development-only dependencies: jsqr, pngjs and @zxing/library.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");
const { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } = require("@zxing/library");

const root = path.resolve(__dirname, "..");
const payload = fs.readFileSync(path.join(root, "assets/antonio-contact.txt"), "utf8").replace(/\r\n/g, "\n").trimEnd();
const png = PNG.sync.read(fs.readFileSync(path.join(root, "img/contact-details.png")));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

test("the QR declares UTF-8 before its contact bytes so scanners do not guess Latin-1", () => {
  assert.ok(decoded, "The contact QR must be readable");
  assert.deepEqual(decoded.chunks[0], { type: "eci", assignmentNumber: 26 });
  assert.equal(decoded.data, payload);
  assert.ok(Buffer.from(decoded.binaryData).equals(Buffer.from(payload, "utf8")));
  const scannerEncoding = decoded.chunks[0].assignmentNumber === 26 ? "utf-8" : "iso-8859-1";
  assert.equal(new TextDecoder(scannerEncoding, { fatal: true }).decode(Uint8Array.from(decoded.binaryData)), payload);
});

test("a second decoder reads the original accented contact text without a charset override", () => {
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    luminance[index] = (png.data[offset] + png.data[offset + 1] * 2 + png.data[offset + 2]) / 4;
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height)));
  assert.equal(new QRCodeReader().decode(bitmap).getText(), payload);
});

test("PNG and SVG retain the same integer module grid and four-module quiet zone", () => {
  assert.ok(decoded);
  const canvasUnits = 17 + decoded.version * 4 + 8;
  const svg = fs.readFileSync(path.join(root, "img/contact-details.svg"), "utf8");
  assert.match(svg, new RegExp(`viewBox="0 0 ${canvasUnits} ${canvasUnits}"`));
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.equal(png.width, png.height);
  assert.equal(png.width % canvasUnits, 0);
  const scale = png.width / canvasUnits;
  assert.ok(scale >= 3);
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (x >= scale * 4 && x < png.width - scale * 4 && y >= scale * 4 && y < png.height - scale * 4) continue;
      const offset = (y * png.width + x) * 4;
      assert.ok(png.data.subarray(offset, offset + 4).every((channel) => channel === 255), "The quiet zone must stay opaque white");
    }
  }
});
