/**
 * W137: Baut die sofort startende Portable-EXE („MultiSpice-1.0.0-Portable.exe“):
 * 1. Nimmt den kompilierten nativen Win32/.NET-Launcher (`PortableStub.exe`),
 *    der beim Doppelklick in < 40 ms ein animiertes, in der Taskleiste sichtbares
 *    Splash-Fenster mit humorvollen Labor-Statusmeldungen öffnet.
 * 2. Hängt das `payload.zip` aus `dist/win-unpacked` + einen 24-Byte-Trailer
 *    (`[int64 zipOffset][int64 buildStamp]["MSPORT01"]`) direkt an die EXE an.
 * Windows lädt beim Start nur den 35-KB-PE-Header, sodass das Ladefenster sofort
 * erscheint, und `main.cjs` schließt es nahtlos beim Einblenden des Hauptfensters.
 */
const fs = require("fs");
const path = require("path");

const stubPath = path.join(__dirname, "PortableStub.exe");
const zipPath = path.join(__dirname, "payload.zip");
const outDir = path.join(__dirname, "dist");
const outPath = path.join(outDir, "MultiSpice-1.0.0-Portable.exe");

if (!fs.existsSync(stubPath)) {
  throw new Error(`PortableStub.exe fehlt: ${stubPath}`);
}
if (!fs.existsSync(zipPath)) {
  throw new Error(`payload.zip fehlt: ${zipPath}`);
}
fs.mkdirSync(outDir, { recursive: true });

const stubStat = fs.statSync(stubPath);
const zipOffset = BigInt(stubStat.size);
const buildStamp = BigInt(Date.now());

const trailer = Buffer.alloc(24);
trailer.writeBigInt64LE(zipOffset, 0);
trailer.writeBigInt64LE(buildStamp, 8);
trailer.write("MSPORT01", 16, 8, "ascii");

fs.copyFileSync(stubPath, outPath);
const outFd = fs.openSync(outPath, "a");
const zipFd = fs.openSync(zipPath, "r");
const chunk = Buffer.alloc(4 * 1024 * 1024);
let bytesRead = 0;
while ((bytesRead = fs.readSync(zipFd, chunk, 0, chunk.length, null)) > 0) {
  fs.writeSync(outFd, chunk, 0, bytesRead);
}
fs.writeSync(outFd, trailer, 0, trailer.length);
fs.closeSync(zipFd);
fs.closeSync(outFd);

const finalSizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`MultiSpice-1.0.0-Portable.exe erzeugt (${finalSizeMb} MB, zipOffset=${zipOffset})`);
