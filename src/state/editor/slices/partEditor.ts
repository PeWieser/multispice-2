import { PART_MAP } from "@/lib/library/catalog";
import {
  CUSTOM_SPECS,
  CustomPartSpec,
  PORT_PART_IDS,
  derivePinsFromPorts,
  loadCustomParts,
  migrateSubcircuitToDoc,
  saveCustomPart,
  validatePartSchematic,
} from "@/lib/library/customParts";
import { SchematicDoc, emptyDoc } from "@/lib/schematic/model";
import type { CustomPartParamLink, CustomPinSpec } from "@/lib/library/customParts";
import type { EditorState, PartEditorMeta } from "../types";
import type { StoreApi } from "zustand";
import { clone, cloneJson, engine } from "../shared";

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
        partEditor: { ...pe, open: false, dirty: false, parked: null },
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
        st.closePartEditor();
        get().setPlacing(id);
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

    markPartEditorDirty: () => {
      if (!get().partEditor.open) return;
      set((s) => (s.partEditor.dirty ? s : { partEditor: { ...s.partEditor, dirty: true } }));
    },
  };
}
