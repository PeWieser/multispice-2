"use strict";

/**
 * S5.11 (Crash-Recovery): Atomare Datei-Schreibvorgänge für den Desktop-Pfad.
 * Direkte writeFileSync-Aufrufe hinterlassen bei Absturz/Stormausfall halb
 * geschriebene Dateien (JSON unparsebar → Totalverlust). Tmp + Rename ist auf
 * NTFS/POSIX atomar: Nach einem Crash liegt entweder der alte oder der neue
 * Stand vor — nie ein halber. Reines fs/path-Modul (ohne Electron), damit es
 * per require in den Vertrags-Tests läuft.
 */
const fs = require("fs");

/** Schreibt Daten atomar: erst Tmp-Datei, dann Rename aufs Ziel. */
function atomicWriteFileSync(targetPath, data, encoding) {
  const tmpPath = `${targetPath}.tmp`;
  if (encoding === undefined) fs.writeFileSync(tmpPath, data);
  else fs.writeFileSync(tmpPath, data, encoding);
  fs.renameSync(tmpPath, targetPath);
}

/** Sichert den aktuellen Stand als .bak (eine Generation, Best-Effort). */
function rotateBackupSync(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return;
    const bakPath = `${targetPath}.bak`;
    try {
      fs.unlinkSync(bakPath);
    } catch {}
    fs.copyFileSync(targetPath, bakPath);
  } catch {}
}

/**
 * Liest JSON — bei korrupter Hauptdatei (Altbestand vor S5.11) das .bak.
 * Wirft, wenn beide fehlen/korrupt sind (Aufrufer fällt auf Defaults zurück).
 */
function readJsonWithBackupSync(targetPath) {
  const raw = fs.readFileSync(targetPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const bakRaw = fs.readFileSync(`${targetPath}.bak`, "utf8");
    return JSON.parse(bakRaw);
  }
}

module.exports = { atomicWriteFileSync, rotateBackupSync, readJsonWithBackupSync };
