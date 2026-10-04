/**
 * Steve-Audit Web/Desktop-Codepfade (WDA-1–WDA-6): Vertrags-Tests für die
 * Stellen, an denen Web- und Desktop-Pfad auseinanderlaufen. Läuft in node
 * (tsx) mit gestubtem window — kein Electron, kein Browser nötig.
 */
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { createSyncDedupe, withSyncNonce } from "../src/lib/desktopSync";
import { downloadBlob } from "../src/lib/download";
import { emptyDoc } from "../src/lib/schematic/model";
import { getActiveDesktopFilePath, loadProjectLocal } from "../src/lib/storage";
import { REQUEST_OPEN_FILE_EVENT, requestOpenFileDialog } from "../src/lib/schematic/openFile";

let n = 0;
const ok = (name: string) => {
  n += 1;
  console.log(`  ok ${n} ${name}`);
};
const setWindow = (w: unknown) => {
  (globalThis as Record<string, unknown>).window = w;
};
const clearWindow = () => {
  delete (globalThis as Record<string, unknown>).window;
};

async function main() {
  // ---------- WDA-1  : AppData schlüsselbezogen (preload-Vertrag) ----------
  {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const preload = require("../desktop/preload.cjs") as {
      __test: { pickAppDataKey: (store: unknown, key?: string) => unknown };
    };
    const pick = preload.__test.pickAppDataKey;
    assert.equal(pick({ k: [1, 2] }, "k") instanceof Array, true);
    assert.deepEqual(pick({ k: [1, 2] }, "k"), [1, 2]);
    assert.equal(pick({ k: 1 }, "fehlt"), null);
    assert.deepEqual(pick({ k: 1 }), { k: 1 });
    assert.equal(pick(null, "k"), null);
    assert.equal(pick("kaputt", "k"), null);
    ok("WDA-1 AppData-Schlüssel");
  }

  // ---------- WDA-5: Sync-Dedupe (Doppeltransport) ----------
  {
    const a = withSyncNonce({ type: "state-snapshot" });
    const b = withSyncNonce({ type: "state-snapshot" });
    assert.equal(typeof a.__nonce, "string");
    assert.notEqual(a.__nonce, b.__nonce);
    const d = createSyncDedupe(2);
    assert.equal(d.check(a), true);
    assert.equal(d.check(a), false);
    assert.equal(d.check({ type: "altbestand-ohne-nonce" }), true);
    assert.equal(d.check(b), true);
    const c = withSyncNonce({ type: "x" });
    assert.equal(d.check(c), true); // wirft a aus dem Ring (Limit 2)
    assert.equal(d.check(a), true);
    assert.equal(d.check("kaputt"), true);
    assert.equal(d.check(null), true);
    ok("WDA-5 Sync-Dedupe");
  }

  // ---------- WDA-3: downloadBlob nutzt den Desktop-Dialog ----------
  {
    let captured: Record<string, unknown> | null = null;
    setWindow({
      multispiceDesktop: {
        saveFile: async (o: Record<string, unknown>) => {
          captured = o;
          return { ok: true };
        },
      },
    });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    downloadBlob("oszi shot.png", { arrayBuffer: async () => bytes.buffer } as Blob);
    await new Promise((r) => setTimeout(r, 50));
    clearWindow();
    assert.ok(captured, "saveFile erreicht");
    const c = captured as unknown as Record<string, unknown>;
    assert.equal(c["defaultName"], "oszi shot.png");
    assert.equal(c["encoding"], "base64");
    assert.equal(c["content"], "iVBORw==");
    assert.deepEqual((c["filters"] as Array<{ extensions: string[] }>)[0].extensions, ["png"]);
    ok("WDA-3 Blob-Desktop-Dialog");
  }

  // ---------- WDA-4: activeFilePath wird wieder gelesen ----------
  {
    const doc = emptyDoc("audit");
    const blob = JSON.stringify({ name: "audit", doc, savedAt: "2026-10-04T00:00:00.000Z", instruments: [] });
    setWindow({
      localStorage: { getItem: (k: string) => (k === "multispice.project.v1" ? blob : null), setItem: () => {} },
      multispiceDesktop: { loadAppDataSync: (k: string) => (k === "activeFilePath" ? "C:\\proj\\x.msx.json" : null) },
    });
    const loaded = loadProjectLocal();
    const bound = getActiveDesktopFilePath();
    clearWindow();
    assert.ok(loaded, "Projekt hydriert");
    assert.equal(bound, "C:\\proj\\x.msx.json");
    ok("WDA-4 Datei-Bindung");
  }

  // ---------- WDA-2: Strg+O-Eventvertrag ----------
  {
    assert.equal(REQUEST_OPEN_FILE_EVENT, "multispice-open-file");
    let got = "";
    setWindow({ dispatchEvent: (e: Event) => { got = e.type; return true; } });
    requestOpenFileDialog();
    clearWindow();
    assert.equal(got, "multispice-open-file");
    ok("WDA-2 Öffnen-Event");
  }

  console.log(`webdesktoptest: ${n} checks OK`);

}

main().catch((e) => { console.error(e); process.exit(1); });
