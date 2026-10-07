import { PART_MAP } from "@/lib/library/catalog";
import {
  CUSTOM_SPECS,
  CustomPartSpec,
  PORT_PART_IDS,
  cloneCustomSpec,
  deleteCustomPart,
  derivePinsFromPorts,
  extractSelectionAsDoc,
  loadCustomParts,
  migrateSubcircuitToDoc,
  parseCustomSpecFile,
  sameCustomSpec,
  saveCustomPart,
  validatePartSchematic,
} from "@/lib/library/customParts";
import { Instance, SchematicDoc, emptyDoc, pinPosition } from "@/lib/schematic/model";
import type { CustomPartParamLink, CustomPinSpec, ExtractBoundaryNet } from "@/lib/library/customParts";
import type { EditorState, PartEditorMeta, PartEditorTestResult, PendingReplace } from "../types";
import type { StoreApi } from "zustand";
import { clone, cloneJson, engine, newId } from "../shared";
import { nextLabel, sheets } from "../docUtils";

const DEFAULT_META: PartEditorMeta = {
  name: "",
  ref: "U",
  category: "Eigene Bauteile/ICs",
  footprint: "DIP-8",
  mount: "both",
  description: "",
};

function findSpec(partId: string): CustomPartSpec | undefined {
  return CUSTOM_SPECS.get(partId) ?? loadCustomParts().find((p) => p.id === partId);
}

export function createPartEditorSlice(
  set: StoreApi<EditorState>["setState"],
  get: StoreApi<EditorState>["getState"],
): Pick<
  EditorState,
  | "openPartEditor"
  | "closePartEditor"
  | "savePartEditor"
  | "setPartEditorTab"
  | "setPartEditorMeta"
  | "toggleParamLink"
  | "updateParamLink"
  | "deleteParamLink"
  | "setPinOverride"
  | "setPartEditorSymbol"
  | "markPartEditorDirty"
  | "startPartEditorTest"
  | "stopPartEditorTest"
  | "extractSelectionToEditor"
  | "resolveSpecConflict"
  | "dismissSpecConflicts"
  | "importCustomSpecText"
  | "duplicateCustomPart"
  | "renameCustomPart"
  | "deleteCustomPartGuarded"
> {
  return {
    openPartEditor: (partId) => {
      const st = get();
      if (st.partEditor.open) return;
      if (st.teacher.locked) {
        st.log("warn", "Lehrer-Modus: Der Bauteile-Editor ist gesperrt.");
        return;
      }
      // S6.2: Der Editor parkt den Haupt-Plan (Doc + History + Kamera +
      // Auswahl + Panels) und arbeitet auf einem Swap-Doc — kein zweiter
      // Canvas, keine zweite History, keine Simulation nebenher.
      if (st.sim.running) st.stopSim();
      if (st.analysis.running) st.cancelAnalysis();
      engine.running = false;

      let spec: CustomPartSpec | undefined;
      if (partId) {
        spec = findSpec(partId);
        if (!spec) {
          st.log("error", `Bauteil „${partId}“ wurde nicht gefunden.`);
          return;
        }
      }

      let editorDoc = spec?.schematic ? clone(spec.schematic) : emptyDoc();
      editorDoc = { ...editorDoc, name: spec?.name ?? "Neues Bauteil", probes: [] };
      const legacyTable = spec && !spec.schematic && spec.subcircuit?.length ? [...spec.subcircuit] : null;
      if (legacyTable && editorDoc.instances.length === 0 && spec) {
        // S6.2: Alte Tabellen-Bauteile werden beim Öffnen einmalig in einen
        // Schaltplan überführt (editierbar); die Tabelle bleibt als Rückhalt.
        editorDoc = { ...migrateSubcircuitToDoc(spec), probes: [] };
        st.log("info", `Tabellen-Innenschaltung von „${spec.name}“ in einen Schaltplan überführt.`);
      }
      const pinOverrides: Record<string, Partial<CustomPinSpec>> = {};
      for (const p of spec?.pins ?? []) {
        pinOverrides[p.name] = {
          side: p.side,
          role: p.role,
          ...(p.marker && p.marker !== "none" ? { marker: p.marker } : {}),
          ...(p.x !== undefined ? { x: p.x } : {}),
          ...(p.y !== undefined ? { y: p.y } : {}),
        };
      }

      set((s) => ({
        partEditor: {
          ...s.partEditor,
          open: true,
          editingId: spec?.id ?? null,
          dirty: false,
          tab: "circuit",
          meta: spec
            ? {
                name: spec.name,
                ref: spec.ref,
                category: spec.category,
                footprint: spec.footprint,
                mount: spec.mount,
                description: spec.description ?? "",
              }
            : { ...DEFAULT_META },
          links: spec?.paramLinks ? cloneJson(spec.paramLinks) : [],
          pinOverrides,
          customSymbol: spec?.customSymbol ? cloneJson(spec.customSymbol) : [],
          legacyTable,
          testRunning: false,
          testResult: null,
          testVoltColors: null,
          pendingReplace: null,
          parked: {
            doc: s.doc,
            past: s.past,
            future: s.future,
            view: { ...s.view },
            selection: [...s.selection],
            tool: s.tool,
            placingPartId: s.placingPartId,
            libraryOpen: s.libraryOpen,
            rightOpen: s.rightOpen,
            leftOpen: s.leftOpen,
            bottomOpen: s.bottomOpen,
            savePending: s.savePending,
          },
        },
        doc: editorDoc,
        past: [],
        future: [],
        selection: [],
        tool: "select",
        placingPartId: null,
        placingPreset: null,
        placingProbeKind: null,
        placingRot: 0,
        placingMirror: false,
        libraryOpen: false,
        rightOpen: false,
        leftOpen: false,
        bottomOpen: false,
        savePending: false,
        spotlight: null,
        extractIds: null,
        hoverNet: null,
        leadArmed: null,
        view: { x: 60, y: 20, zoom: 1 },
      }));
      get().refreshNets();
      get().log("ok", spec ? `Bauteile-Editor: „${spec.name}“ wird bearbeitet.` : "Bauteile-Editor: neues Bauteil.");
    },

    closePartEditor: () => {
      const st = get();
      const pe = st.partEditor;
      if (!pe.open || !pe.parked) return;
      // S6.2: Aufrufer hat gespeichert oder das Verwerfen bestätigt —
      // geparkten Zustand vollständig wiederherstellen.
      const p = pe.parked;
      engine.running = false;
      engine.reset(p.doc);
      engine.running = false;
      set({
        partEditor: { ...pe, open: false, dirty: false, parked: null, testRunning: false, testResult: null, testVoltColors: null, pendingReplace: null },
        sim: { ...st.sim, running: false },
        showVoltageColors: pe.testVoltColors ?? st.showVoltageColors,
        doc: p.doc,
        past: p.past,
        future: p.future,
        view: p.view,
        selection: p.selection,
        tool: p.tool,
        placingPartId: p.placingPartId,
        placingPreset: null,
        placingProbeKind: null,
        libraryOpen: p.libraryOpen,
        rightOpen: p.rightOpen,
        leftOpen: p.leftOpen,
        bottomOpen: p.bottomOpen,
        savePending: p.savePending,
        spotlight: null,
        extractIds: null,
        hoverNet: null,
      });
      get().refreshNets();
      get().log("info", "Bauteile-Editor geschlossen.");
    },

    savePartEditor: (place = false) => {
      const st = get();
      const pe = st.partEditor;
      if (!pe.open) return false;
      if (pe.testRunning) st.stopPartEditorTest();
      const cleanName = pe.meta.name.trim() || "Eigenes Bauteil";
      const id =
        pe.editingId ?? `custom_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString(36).slice(-4)}`;
      const schematic: SchematicDoc = { ...cloneJson(st.doc), probes: [] };
      const pins = derivePinsFromPorts(schematic, pe.pinOverrides);
      const spec: CustomPartSpec = {
        id,
        name: cleanName,
        ref: pe.meta.ref.trim() || "U",
        category: pe.meta.category.trim() || "Eigene Bauteile/ICs",
        footprint: pe.meta.footprint.trim() || "DIP-8",
        mount: pe.meta.mount,
        description: pe.meta.description.trim() || undefined,
        modelKind: "ic",
        pins,
        customSymbol: pe.customSymbol.length > 0 ? cloneJson(pe.customSymbol) : undefined,
        subcircuit: pe.legacyTable ?? undefined,
        schematic,
        paramLinks: pe.links.length > 0 ? cloneJson(pe.links) : undefined,
      };
      const issues = validatePartSchematic(spec);
      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length > 0) {
        st.log(
          "error",
          `Speichern blockiert: ${errors[0].message}${errors.length > 1 ? ` (+${errors.length - 1} weitere)` : ""}`,
        );
        for (const e of errors.slice(1, 4)) st.log("error", e.message);
        return false;
      }
      saveCustomPart(spec);
      set((s) => ({ partEditor: { ...s.partEditor, editingId: id, dirty: false } }));
      st.log(
        "ok",
        `Bauteil „${cleanName}“ gespeichert (${pins.length} Pins, ${schematic.instances.length} Innenteile${
          pe.links.length > 0 ? `, ${pe.links.length} Parameter` : ""
        }).`,
      );
      for (const w of issues.filter((i) => i.severity === "warning").slice(0, 3)) st.log("warn", w.message);
      if (place) {
        if (pe.pendingReplace) {
          replaceSelectionWithPart(get, set, id, pins, cleanName, pe.pendingReplace);
        } else {
          st.closePartEditor();
          get().setPlacing(id);
        }
      }
      return true;
    },

    setPartEditorTab: (t) => set((s) => ({ partEditor: { ...s.partEditor, tab: t } })),

    setPartEditorMeta: (patch) =>
      set((s) => ({ partEditor: { ...s.partEditor, meta: { ...s.partEditor.meta, ...patch }, dirty: true } })),

    toggleParamLink: (instanceId, key) => {
      const st = get();
      if (!st.partEditor.open) return;
      const pe = st.partEditor;
      const hit = pe.links.findIndex((l) => l.targets.some((t) => t.instanceId === instanceId && t.key === key));
      let links: CustomPartParamLink[];
      if (hit >= 0) {
        // S6.2: Lösen geht immer — auch für verwaiste Ziele gelöschter Bauteile.
        links = pe.links
          .map((l, i) =>
            i === hit ? { ...l, targets: l.targets.filter((t) => !(t.instanceId === instanceId && t.key === key)) } : l,
          )
          .filter((l) => l.targets.length > 0);
        st.log("info", `Parameter-Freigabe „${pe.links[hit].name}“ gelöst.`);
      } else {
        const inst = st.doc.instances.find((i) => i.id === instanceId);
        if (!inst) return;
        if ((PORT_PART_IDS as readonly string[]).includes(inst.partId)) return;
        const part = PART_MAP[inst.partId];
        const pdef = part?.params.find((p) => p.key === key);
        if (!pdef) return;
        let base = key.toUpperCase().replace(/[^A-Z0-9_]+/g, "_") || "P";
        if (/^[0-9]/.test(base)) base = `P_${base}`;
        const used = new Set(pe.links.map((l) => l.name.toUpperCase()));
        let name = base;
        let n = 2;
        while (used.has(name.toUpperCase())) name = `${base}_${n++}`;
        links = [
          ...pe.links,
          {
            name,
            label: pdef.label,
            unit: pdef.unit,
            def: (inst.params[key] ?? pdef.def) as number | string | boolean,
            ...(pdef.min !== undefined ? { min: pdef.min } : {}),
            ...(pdef.max !== undefined ? { max: pdef.max } : {}),
            ...(pdef.step !== undefined ? { step: pdef.step } : {}),
            targets: [{ instanceId, key }],
          },
        ];
        st.log("info", `„${pdef.label}“ von ${inst.label || part?.name} als Parameter „${name}“ freigegeben.`);
      }
      set((s) => ({ partEditor: { ...s.partEditor, links, dirty: true } }));
    },

    updateParamLink: (name, patch) => {
      const st = get();
      if (!st.partEditor.open) return;
      if (patch.name !== undefined && patch.name !== name) {
        const clean = patch.name.trim();
        if (!clean || st.partEditor.links.some((l) => l.name !== name && l.name.toUpperCase() === clean.toUpperCase())) {
          st.log("warn", "Parameter-Name ist leer oder bereits vergeben.");
          return;
        }
      }
      set((s) => ({
        partEditor: {
          ...s.partEditor,
          links: s.partEditor.links.map((l) => (l.name === name ? { ...l, ...patch } : l)),
          dirty: true,
        },
      }));
    },

    deleteParamLink: (name) => {
      if (!get().partEditor.open) return;
      set((s) => ({
        partEditor: { ...s.partEditor, links: s.partEditor.links.filter((l) => l.name !== name), dirty: true },
      }));
    },

    setPinOverride: (portName, patch) =>
      set((s) => {
        const pinOverrides = { ...s.partEditor.pinOverrides };
        if (patch === null) delete pinOverrides[portName];
        else pinOverrides[portName] = { ...(pinOverrides[portName] ?? {}), ...patch };
        return { partEditor: { ...s.partEditor, pinOverrides, dirty: true } };
      }),

    setPartEditorSymbol: (prims) =>
      set((s) => ({ partEditor: { ...s.partEditor, customSymbol: prims, dirty: true } })),

    startPartEditorTest: () => {
      const st = get();
      if (!st.partEditor.open || st.partEditor.testRunning) return;
      // S6.3: Live-Engine auf dem Editor-Doc — Leitungen färben sich nach
      // Spannung, Inspector zeigt Live-Werte (Canvas treibt die Takte).
      const { doc, sim } = st;
      engine.options.sampleRate = sim.sampleRate;
      engine.options.timeScale = sim.timeScale;
      engine.options.method = sim.method;
      engine.options.temperature = sim.temperature;
      engine.rebuild(doc);
      engine.running = true;
      const live = engine.lastState;
      const devices = engine.netlist.devices.length;
      const nodes = engine.netNames().length;
      const result: PartEditorTestResult = live.ok
        ? { ok: true, message: `${devices} Teile · ${nodes} Knoten`, devices, nodes, at: Date.now() }
        : { ok: false, message: live.message ?? "keine Konvergenz", devices, nodes, at: Date.now() };
      set((s) => ({
        sim: { ...s.sim, running: true },
        showVoltageColors: true,
        partEditor: { ...s.partEditor, testRunning: true, testResult: result, testVoltColors: s.showVoltageColors },
      }));
      if (!live.ok) {
        st.log("error", `Testlauf: ${result.message}`);
        const suspect = (live.suspects ?? []).find((x) => !x.startsWith("I("));
        if (suspect) st.spotlightNet(suspect);
        else if (live.suspects?.length) st.log("warn", `Verdächtig: ${live.suspects.join(", ")}`);
      } else {
        st.log("ok", `Testlauf gestartet — ${result.message}`);
      }
      for (const w of engine.warnings) st.log("warn", w);
      for (const e of engine.errors) st.log("error", e);
    },

    stopPartEditorTest: () => {
      const st = get();
      if (!st.partEditor.open || !st.partEditor.testRunning) return;
      engine.running = false;
      engine.reset(st.doc);
      engine.running = false;
      set((s) => ({
        sim: { ...s.sim, running: false },
        showVoltageColors: s.partEditor.testVoltColors ?? s.showVoltageColors,
        partEditor: { ...s.partEditor, testRunning: false, testVoltColors: null },
      }));
      st.log("info", "Testlauf gestoppt.");
    },

    extractSelectionToEditor: () => {
      const st = get();
      if (st.partEditor.open) return;
      const ids = st.extractIds;
      if (!ids || ids.length === 0) return;
      const res = extractSelectionAsDoc(st.doc, ids);
      const schematic = res.schematic;
      if (!res.ok || !schematic) {
        st.log("error", `Extrahieren blockiert: ${res.errors[0] ?? "unbekannter Fehler"}`);
        return;
      }
      st.closeExtractDialog();
      st.openPartEditor(null);
      set((s) => ({
        partEditor: {
          ...s.partEditor,
          meta: {
            ...s.partEditor.meta,
            category: "Eigene Bauteile/Extrahiert",
            description: `Aus ${ids.length} Elementen extrahiert.`,
          },
          pendingReplace: { boundary: res.boundary, consumed: res.consumed, center: res.center },
          dirty: true,
        },
        doc: { ...schematic, name: "Extrahiert" },
        past: [],
        future: [],
        selection: [],
      }));
      get().refreshNets();
      st.log(
        "ok",
        `Auswahl extrahiert (${schematic.instances.length} Teile, ${res.boundary.length} Ports) — im Editor prüfen und speichern.`,
      );
      for (const w of res.warnings.slice(0, 3)) st.log("warn", w);
    },

    markPartEditorDirty: () => {
      if (!get().partEditor.open) return;
      set((s) => (s.partEditor.dirty ? s : { partEditor: { ...s.partEditor, dirty: true } }));
    },

    /* S6.4 (Phase 4): Verwalten + Import eigener Bauteile. */
    resolveSpecConflict: (id, choice) => {
      const st = get();
      const c = st.partEditor.specConflicts.find((x) => x.id === id);
      if (!c) return;
      if (choice === "incoming") {
        saveCustomPart(cloneJson(c.embedded));
        st.log("ok", `„${c.name}“: ${c.source === "project" ? "Projekt" : "Import"}-Fassung übernommen.`);
      } else {
        st.log("ok", `„${c.name}“: Bibliotheks-Fassung behalten.`);
      }
      set((s) => ({
        partEditor: { ...s.partEditor, specConflicts: s.partEditor.specConflicts.filter((x) => x.id !== id) },
      }));
    },

    dismissSpecConflicts: () => {
      set((s) => (s.partEditor.specConflicts.length === 0 ? s : { partEditor: { ...s.partEditor, specConflicts: [] } }));
    },

    importCustomSpecText: (text, fileName) => {
      const st = get();
      const parsed = parseCustomSpecFile(text);
      if (!parsed.ok || !parsed.spec) {
        const msg = parsed.error ?? "Import fehlgeschlagen.";
        st.setToast({ message: msg });
        st.log("error", `Import ${fileName}: ${msg}`);
        return;
      }
      const spec = parsed.spec;
      const local = findSpec(spec.id);
      if (!local) {
        saveCustomPart(spec);
        st.setToast({ message: `„${spec.name}“ importiert.` });
        st.log("ok", `Bauteil „${spec.name}“ aus ${fileName} importiert.`);
        return;
      }
      if (sameCustomSpec(local, spec)) {
        st.setToast({ message: `„${spec.name}“ ist bereits aktuell.` });
        return;
      }
      set((s) => ({
        partEditor: {
          ...s.partEditor,
          specConflicts: s.partEditor.specConflicts.some((c) => c.id === spec.id)
            ? s.partEditor.specConflicts
            : [...s.partEditor.specConflicts, { id: spec.id, name: spec.name, source: "import", embedded: cloneJson(spec) }],
        },
      }));
    },

    duplicateCustomPart: (id) => {
      const spec = findSpec(id);
      if (!spec) return null;
      const clean = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) || "teil";
      const copy = cloneCustomSpec(spec, `custom_${clean}_kopie_${Date.now().toString(36).slice(-4)}`, `${spec.name} (Kopie)`);
      saveCustomPart(copy);
      get().log("ok", `„${spec.name}“ dupliziert → „${copy.name}“.`);
      return copy.id;
    },

    renameCustomPart: (id, name) => {
      const spec = findSpec(id);
      const clean = name.trim();
      if (!spec || !clean) return false;
      saveCustomPart({ ...cloneJson(spec), name: clean.slice(0, 80) });
      get().log("ok", `Bauteil umbenannt → „${clean.slice(0, 80)}“.`);
      return true;
    },

    deleteCustomPartGuarded: (id) => {
      const st = get();
      const spec = findSpec(id);
      if (!spec) return { ok: false, reason: "Unbekanntes Bauteil." };
      const usedIn = new Set<string>();
      const seen = new Set<SchematicDoc>();
      const checkDoc = (d: SchematicDoc, name: string) => {
        if (seen.has(d)) return;
        seen.add(d);
        if (d.instances.some((i) => i.partId === id)) usedIn.add(name);
      };
      checkDoc(st.doc, st.partEditor.open ? "Bauteile-Editor" : st.doc.name || "Schaltplan");
      for (const sh of sheets) checkDoc(sh.doc, `Entwurf „${sh.name}“`);
      for (const other of CUSTOM_SPECS.values()) {
        if (other.id !== id && other.schematic?.instances.some((i) => i.partId === id)) {
          usedIn.add(`Bauteil „${other.name}“`);
        }
      }
      if (usedIn.size > 0) {
        return { ok: false, reason: `„${spec.name}“ ist noch verbaut (${[...usedIn].slice(0, 3).join(", ")}${usedIn.size > 3 ? " …" : ""}).` };
      }
      deleteCustomPart(id);
      st.log("ok", `Bauteil „${spec.name}“ gelöscht.`);
      return { ok: true };
    },
  };
}

/** S6.3: Ersetzt die extrahierte Auswahl durch eine Instanz des neuen
 * Bauteils (ein Undo-Schritt): Originale löschen, Instanz in die Mitte
 * setzen, Boundary-Netze per L-Drähte (oder Namens-Labels) anbinden. */
function replaceSelectionWithPart(
  get: StoreApi<EditorState>["getState"],
  set: StoreApi<EditorState>["setState"],
  partId: string,
  specPins: import("@/lib/library/customParts").CustomPinSpec[],
  name: string,
  pending: PendingReplace,
): void {
  void set;
  const st = get();
  st.closePartEditor();
  const after = get();
  const def = PART_MAP[partId];
  if (!def) {
    after.log("error", `Ersetzen gescheitert: „${name}“ ist nicht in der Bibliothek.`);
    return;
  }
  const label = nextLabel(after.doc, def);
  const inst: Instance = { id: newId("i"), partId, x: pending.center.x, y: pending.center.y, rot: 0, label, params: {} };
  // Pin → Boundary: erst exakte Port-Namen, Reste per Reihenfolge (mit Warnung).
  const used = new Set<ExtractBoundaryNet>();
  const matchOf = new Map<number, ExtractBoundaryNet>();
  specPins.forEach((pin, idx) => {
    const hit = pending.boundary.find((b) => !used.has(b) && b.port === pin.name);
    if (hit) {
      used.add(hit);
      matchOf.set(idx, hit);
    }
  });
  const freePins = specPins.map((_, idx) => idx).filter((idx) => !matchOf.has(idx));
  const freeBounds = pending.boundary.filter((b) => !used.has(b));
  const orderPaired = freePins.length > 0 && freeBounds.length > 0;
  freePins.forEach((idx, k) => {
    if (freeBounds[k]) matchOf.set(idx, freeBounds[k]);
  });
  const unwired: string[] = [];
  after.commit((d) => {
    const c = pending.consumed;
    const ci = new Set(c.instances);
    const cw = new Set(c.wires);
    const cl = new Set(c.labels);
    const cj = new Set(c.junctions);
    const cn = new Set(c.notes);
    d.instances = d.instances.filter((i) => !ci.has(i.id));
    d.wires = d.wires.filter((w) => !cw.has(w.id));
    d.labels = d.labels.filter((l) => !cl.has(l.id));
    if (d.junctions) d.junctions = d.junctions.filter((j) => !cj.has(j.id));
    d.notes = d.notes.filter((n) => !cn.has(n.id));
    d.instances.push(inst);
    specPins.forEach((pin, idx) => {
      let pp: { x: number; y: number };
      try {
        pp = pinPosition(inst, idx);
      } catch {
        unwired.push(pin.name);
        return;
      }
      const b = matchOf.get(idx);
      if (!b) {
        unwired.push(pin.name);
        return;
      }
      if (b.outsidePins.length > 0) {
        for (const q of b.outsidePins) {
          const pts =
            pp.x === q.x || pp.y === q.y
              ? [{ x: pp.x, y: pp.y }, { x: q.x, y: q.y }]
              : [
                  { x: pp.x, y: pp.y },
                  { x: q.x, y: pp.y },
                  { x: q.x, y: q.y },
                ];
          d.wires.push({ id: newId("w"), points: pts });
        }
      } else {
        // Nur per Name verbunden: stabilen Netznamen ans Pin heften
        // (Auto-Netze bekämen sonst bei jedem Build eine neue Nummer).
        const nm = /^N\d+$/.test(b.net) ? b.port : b.net;
        d.labels.push({ id: newId("l"), x: pp.x, y: pp.y, name: nm });
      }
    });
  });
  get().setSelection([inst.id]);
  get().log("ok", `Auswahl durch „${name}“ (${label}) ersetzt — ${specPins.length - unwired.length} von ${specPins.length} Pins verdrahtet.`);
  if (orderPaired)
    get().log("warn", "Ports umbenannt oder umsortiert — Zuordnung per Pin-Reihenfolge, bitte prüfen.");
  for (const u of unwired.slice(0, 4)) get().log("warn", `Pin „${u}“ bleibt unverdrahtet (Port gelöscht?).`);
}
