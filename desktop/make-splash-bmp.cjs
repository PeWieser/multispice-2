const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function decodePngRgba(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const idatChunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * 4);
  const prevRow = new Uint8Array(stride);
  const curRow = new Uint8Array(stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + 1 + i];
      const a = i >= bpp ? curRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 0xff;
      curRow[i] = val;
    }
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = x * bpp;
      pixels[dst] = curRow[src];
      pixels[dst + 1] = curRow[src + 1];
      pixels[dst + 2] = curRow[src + 2];
      pixels[dst + 3] = bpp === 4 ? curRow[src + 3] : 255;
    }
    prevRow.set(curRow);
  }
  return { width, height, pixels };
}

function generateSplashBmp(faviconPath, outBmpPath) {
  const W = 320;
  const H = 200;
  const rgb = new Uint8Array(W * H * 3);

  const setPx = (x, y, r, g, b) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = (y * W + x) * 3;
    rgb[idx] = r;
    rgb[idx + 1] = g;
    rgb[idx + 2] = b;
  };

  // Hintergrund (#0d1017) + dezenter 1px Rahmen (#232a38)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const isBorder = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      if (isBorder) setPx(x, y, 0x23, 0x2a, 0x38);
      else setPx(x, y, 0x0d, 0x10, 0x17);
    }
  }

  // Favicon mittig oben (64x64 bei y=46..110)
  if (fs.existsSync(faviconPath)) {
    try {
      const icon = decodePngRgba(fs.readFileSync(faviconPath));
      const targetSize = 64;
      const startX = Math.floor((W - targetSize) / 2);
      const startY = 44;
      const scaleX = icon.width / targetSize;
      const scaleY = icon.height / targetSize;

      for (let ty = 0; ty < targetSize; ty++) {
        for (let tx = 0; tx < targetSize; tx++) {
          const sx0 = Math.floor(tx * scaleX);
          const sy0 = Math.floor(ty * scaleY);
          const sx1 = Math.min(icon.width - 1, Math.ceil((tx + 1) * scaleX));
          const sy1 = Math.min(icon.height - 1, Math.ceil((ty + 1) * scaleY));
          let rSum = 0, gSum = 0, bSum = 0, aSum = 0, cnt = 0;
          for (let sy = sy0; sy <= sy1; sy++) {
            for (let sx = sx0; sx <= sx1; sx++) {
              const p = (sy * icon.width + sx) * 4;
              rSum += icon.pixels[p];
              gSum += icon.pixels[p + 1];
              bSum += icon.pixels[p + 2];
              aSum += icon.pixels[p + 3];
              cnt++;
            }
          }
          const r = rSum / cnt;
          const g = gSum / cnt;
          const b = bSum / cnt;
          const a = (aSum / cnt) / 255;
          const bgR = 0x0d, bgG = 0x10, bgB = 0x17;
          setPx(
            startX + tx,
            startY + ty,
            Math.round(r * a + bgR * (1 - a)),
            Math.round(g * a + bgG * (1 - a)),
            Math.round(b * a + bgB * (1 - a)),
          );
        }
      }
    } catch (err) {
      console.warn("Favicon decode fallback:", err.message);
    }
  }

  // Minimalistischer Ladebalken (128x4 px bei y=136)
  const barW = 128;
  const barH = 4;
  const barX = Math.floor((W - barW) / 2);
  const barY = 136;
  for (let y = 0; y < barH; y++) {
    for (let x = 0; x < barW; x++) {
      // Track (#1e2533) + aktiver Bernstein-Abschnitt (#f59e0b)
      if (x >= 18 && x <= 78) {
        setPx(barX + x, barY + y, 0xf5, 0x9e, 0x0b);
      } else {
        setPx(barX + x, barY + y, 0x1e, 0x25, 0x33);
      }
    }
  }

  // 24-Bit uncompressed BMP schreiben (Bottom-Up Scanlines, 4-Byte Row-Padding)
  const rowStride = Math.ceil((W * 3) / 4) * 4;
  const pixelDataSize = rowStride * H;
  const fileSize = 54 + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 Bytes)
  bmp.write("BM", 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(0, 6);
  bmp.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER (40 Bytes)
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18);
  bmp.writeInt32LE(H, 22); // positive height = bottom-up
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(24, 28); // 24-bit BGR
  bmp.writeUInt32LE(0, 30); // BI_RGB (uncompressed)
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38); // 72 DPI
  bmp.writeInt32LE(2835, 42);
  bmp.writeUInt32LE(0, 46);
  bmp.writeUInt32LE(0, 50);

  for (let y = 0; y < H; y++) {
    const srcY = H - 1 - y;
    const rowOffset = 54 + y * rowStride;
    for (let x = 0; x < W; x++) {
      const srcIdx = (srcY * W + x) * 3;
      const dstIdx = rowOffset + x * 3;
      bmp[dstIdx] = rgb[srcIdx + 2];     // B
      bmp[dstIdx + 1] = rgb[srcIdx + 1]; // G
      bmp[dstIdx + 2] = rgb[srcIdx];     // R
    }
  }

  fs.writeFileSync(outBmpPath, bmp);
}

const faviconCandidates = [
  path.join(__dirname, "icon.png"),
  path.join(__dirname, "..", "public", "favicon.png"),
];
const iconFile = faviconCandidates.find((p) => fs.existsSync(p)) || faviconCandidates[0];
const outFile = path.join(__dirname, "splash.bmp");
generateSplashBmp(iconFile, outFile);
console.log("Generated native Win32 splash.bmp:", outFile);
