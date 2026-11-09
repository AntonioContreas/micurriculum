"use strict";

// Development-only dependencies: @zxing/library@0.21.3 and pngjs@7.0.0.
// The website serves generated images and loads no QR-generation libraries.
const fs = require("node:fs");
const path = require("node:path");
const { BarcodeFormat, EncodeHintType, QRCodeWriter } = require("@zxing/library");
const { PNG } = require("pngjs");

const root = path.resolve(__dirname, "..");
const contact = fs.readFileSync(path.join(root, "assets/antonio-contact.txt"), "utf8");
const payload = contact.replace(/\r\n/g, "\n").trimEnd();

// ECI 26 explicitly identifies UTF-8; scanners must not guess Latin-1.
const hints = new Map([
  [EncodeHintType.CHARACTER_SET, "UTF-8"],
  [EncodeHintType.ERROR_CORRECTION, "M"],
  [EncodeHintType.MARGIN, 4]
]);
const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 0, 0, hints);
const canvasUnits = matrix.getWidth();
const scale = 10;
const png = new PNG({ width: canvasUnits * scale, height: canvasUnits * scale });
png.data.fill(255);
const paths = [];

// Render both formats from the same grid with an opaque four-module quiet zone.
for (let y = 0; y < canvasUnits; y += 1) {
  let x = 0;
  while (x < canvasUnits) {
    if (!matrix.get(x, y)) {
      x += 1;
      continue;
    }
    const start = x;
    while (x < canvasUnits && matrix.get(x, y)) x += 1;
    const length = x - start;
    paths.push(`M${start} ${y}h${length}v1h-${length}z`);
    for (let pixelY = y * scale; pixelY < (y + 1) * scale; pixelY += 1) {
      for (let pixelX = start * scale; pixelX < x * scale; pixelX += 1) {
        const offset = (pixelY * png.width + pixelX) * 4;
        png.data.fill(23, offset, offset + 3);
      }
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasUnits} ${canvasUnits}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${canvasUnits}v${canvasUnits}H0z"/><path fill="#171717" d="${paths.join("")}"/></svg>\n`;
fs.writeFileSync(path.join(root, "img/contact-details.png"), PNG.sync.write(png));
fs.writeFileSync(path.join(root, "img/contact-details.svg"), svg);
console.log("PNG and SVG contact QR assets generated with UTF-8 ECI 26 from assets/antonio-contact.txt.");
console.log(`QR canvas: ${canvasUnits} units; modal widths ${canvasUnits * 3 + 2}px and ${canvasUnits * 2 + 2}px.`);
