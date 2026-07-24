const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createPNG(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    let crcVal = 0xffffffff;
    const crcInput = Buffer.concat([typeBuf, data]);
    for (let i = 0; i < crcInput.length; i++) {
      crcVal ^= crcInput[i] << 24;
      for (let j = 0; j < 8; j++) {
        crcVal = crcVal & 0x80000000 ? (crcVal << 1) ^ 0x04c11db7 : crcVal << 1;
        crcVal = crcVal >>> 0;
      }
    }
    crc.writeUInt32BE((crcVal ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([length, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", iend),
  ]);
}

const assetsDir = path.join(__dirname, "..", "assets");
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const icon = createPNG(1024, 1024, 79, 70, 229);
fs.writeFileSync(path.join(assetsDir, "icon.png"), icon);
console.log("Created assets/icon.png (1024x1024)");

const splash = createPNG(1242, 2436, 79, 70, 229);
fs.writeFileSync(path.join(assetsDir, "splash.png"), splash);
console.log("Created assets/splash.png (1242x2436)");

const adaptiveIcon = createPNG(1024, 1024, 79, 70, 229);
fs.writeFileSync(path.join(assetsDir, "adaptive-icon.png"), adaptiveIcon);
console.log("Created assets/adaptive-icon.png (1024x1024)");

console.log("\nDone! Replace these placeholder images with your actual app icons before submitting to the App Store.");
