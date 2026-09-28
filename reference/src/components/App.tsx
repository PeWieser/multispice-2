"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/state/store";
import { viewApi } from "@/components/Canvas";
import Canvas from "@/components/Canvas";
import { DesignBrowser, Inspector, BottomPanel, buildNetlistText } from "@/components/Panels";
import Grapher from "@/components/Grapher";
import InstrumentWindows from "@/components/Instruments";
import {
  AboutDialog,
  AnalysisDialog,
  ComponentBrowser,
  DocumentationDialog,
  FindDialog,
  OpenProjectDialog,
  PropertiesDialog,
  ReportDialog,
  ShortcutsDialog,
  SweepDialog,
} from "@/components/Dialogs";
import { Icon } from "@/components/ui";
import { getDef } from "@/lib/domain/library";
import { createProject } from "@/lib/state/store";
import { clearAutosave, readAutosave, writeAutosave } from "@/lib/persistence/storage";
import { pinPos, resolveNetlist } from "@/lib/domain/connectivity";
import type { Component, Label, Vec } from "@/lib/domain/types";

/* ------------------------------ menus ------------------------------ */
interface MenuItem {
  label: string;
  shortcut?: string;
  hint?: string;
  sep?: boolean;
  disabled?: boolean;
  run?: () => void;
}

export default function App() {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const selection = useApp((s) => s.selection);
  const tool = useApp((s) => s.tool);
  const simState = useApp((s) => s.simState);
  const dirty = useApp((s) => s.dirty);
  const saving = useApp((s) => s.saving);
  const modal = useApp((s) => s.modal);
  const modalPayload = useApp((s) => s.modalPayload);
  const toast = useApp((s) => s.toast);
  const showComponentBrowser = useApp((s) => s.showComponentBrowser);
  const ui = project.ui;

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const netlistRef = useRef<HTMLInputElement | null>(null);

  const act = useApp.getState;

  /* ------------------------- file operations ----------------------- */
  const exportFile = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportNetlist = () => {
    const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
    exportFile(`${project.name.replace(/\s+/g, "_")}.cir`, buildNetlistText(sheet, graph), "text/plain");
    act().addLog("ok", "SPICE netlist exported");
  };

  const exportSvg = () => {
    const svg = document.querySelector("main svg")?.outerHTML ?? "";
    exportFile(`${project.name.replace(/\s+/g, "_")}.svg`, svg, "image/svg+xml");
    act().addLog("ok", "Sheet exported as SVG");
  };

  const exportPng = () => {
    const el = document.querySelector("main svg") as SVGSVGElement | null;
    if (!el) return;
    const blob = new Blob([el.outerHTML], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1100;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f2f1ee";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${project.name.replace(/\s+/g, "_")}.png`;
      a.click();
    };
    img.src = url;
    act().addLog("ok", "Sheet exported as PNG");
  };

  const exportProjectJson = () => {
    exportFile(
      `${project.name.replace(/\s+/g, "_")}.circuitbench.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
    act().addLog("ok", "Project document exported");
  };

  /** Minimal SPICE netlist importer: R/C/L/V/I/D elements become placed parts + net labels. */
  const importNetlist = (text: string) => {
    const rows = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("*") && !l.startsWith("."));
    const created: Component[] = [];
    const labels: Label[] = [];
    let col = 0;
    let row = 0;
    rows.forEach((line) => {
      const parts = line.split(/\s+/);
      const name = parts[0] ?? "";
      const type = name[0]?.toUpperCase();
      const map: Record<string, string> = {
        R: "resistor",
        C: "capacitor",
        L: "inductor",
        V: "vsource",
        I: "isource",
        D: "diode",
      };
      const defId = map[type];
      if (!defId) return;
      const def = getDef(defId);
      if (!def) return;
      const x = 200 + col * 220;
      const y = 160 + row * 160;
      col++;
      if (col > 5) {
        col = 0;
        row++;
      }
      const props: Record<string, string> = {};
      for (const p of def.props) props[p.key] = p.def;
      const valueKey = def.valueProp;
      const valueToken = type === "D" ? (parts[3] ?? "D1N4148") : (parts[3] ?? parts[2] ?? "1k");
      if (valueKey && type !== "D") props[valueKey] = valueToken;
      if (defId === "vsource") props.voltage = parts[3] ?? "5";
      const comp: Component = {
        id: `imp_${name}_${created.length}`,
        defId,
        ref: name,
        x,
        y,
        rot: 0,
        mirror: false,
        props,
        showRef: true,
        showValue: true,
        showPins: false,
      };
      created.push(comp);
      def.pins.forEach((p, i) => {
        const node = parts[1 + i];
        if (!node) return;
        const w = pinPos(comp, p);
        labels.push({
          id: `implb_${name}_${p.id}`,
          kind: node === "0" ? "net" : "global",
          text: node === "0" ? "GND" : node,
          x: w.x,
          y: w.y,
          rot: 0,
        });
      });
    });
    act().commit((p) => {
      const s = p.sheets.find((x) => x.id === p.activeSheetId) ?? p.sheets[0];
      s.components.push(...created);
      s.labels.push(...labels.filter((l) => l.text !== "GND"));
    }, `Imported ${created.length} parts from SPICE netlist`);
    act().addLog("ok", `SPICE import: ${created.length} components, ${labels.length} node labels`);
  };

  /* --------------------------- keyboard ---------------------------- */
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      const st = act();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing && e.key !== "Escape") return;

      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "s") {
          e.preventDefault();
          st.saveProject();
        } else if (k === "z" && e.shiftKey) {
          e.preventDefault();
          st.redo();
        } else if (k === "z") {
          e.preventDefault();
          st.undo();
        } else if (k === "y") {
          e.preventDefault();
          st.redo();
        } else if (k === "c") {
          st.copySelection();
        } else if (k === "x") {
          st.copySelection();
          st.deleteSelection();
        } else if (k === "v") {
          st.pasteClipboard();
        } else if (k === "d") {
          e.preventDefault();
          st.duplicateSelection();
        } else if (k === "a") {
          e.preventDefault();
          const sheet = st.project.sheets.find((x) => x.id === st.project.activeSheetId) ?? st.project.sheets[0];
          st.select([
            ...sheet.components.map((c) => c.id),
            ...sheet.wires.map((w) => w.id),
            ...sheet.labels.map((l) => l.id),
            ...sheet.probes.map((p) => p.id),
          ]);
        } else if (k === "f") {
          e.preventDefault();
          st.openModal("find");
        } else if (k === "0") {
          e.preventDefault();
          viewApi.fit();
        } else if (k === "=" || k === "+") {
          e.preventDefault();
          viewApi.zoomIn();
        } else if (k === "-") {
          e.preventDefault();
          viewApi.zoomOut();
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          st.setTool("select");
          if (st.modal) st.openModal(null);
          setPaletteOpen(false);
          break;
        case "Delete":
        case "Backspace":
          st.deleteSelection();
          break;
        case "w":
        case "W":
          st.setTool("wire");
          break;
        case "b":
        case "B":
          st.setTool("bus");
          break;
        case "p":
        case "P":
          st.setTool("place");
          useApp.setState({ showComponentBrowser: true });
          st.openModal("componentBrowser");
          break;
        case "n":
        case "N":
          st.setTool("label");
          useApp.setState({ placeLabelKind: "net" });
          break;
        case "g":
        case "G":
          st.setTool("power");
          useApp.setState({ placeDefId: "gnd", tool: "place" });
          break;
        case "r":
        case "R":
          st.rotateSelection();
          break;
        case "m":
        case "M":
          st.mirrorSelection();
          break;
        case "e":
        case "E":
          if (selection.length === 1) st.openModal("properties", selection[0]);
          break;
        case "v":
        case "V":
          st.setTool("select");
          break;
        case "1":
          useApp.setState({ probeType: "voltage", tool: "probe" });
          break;
        case "2":
          useApp.setState({ probeType: "current", tool: "probe" });
          break;
        case "3":
          useApp.setState({ probeType: "differential", tool: "probe" });
          break;
        case "4":
          useApp.setState({ probeType: "power", tool: "probe" });
          break;
        case "F5":
          e.preventDefault();
          st.run();
          break;
      }
    },
    [selection],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  /* --------------------------- autosave ---------------------------- */
  // 60 s autosave into localStorage for crash recovery, plus a persisted
  // copy of the panel/tool layout. No backend involved.
  useEffect(() => {
    const id = window.setInterval(() => {
      const st = act();
      if (!st.dirty) return;
      const ok = writeAutosave(st.project);
      if (ok) st.addLog("info", "Autosaved locally (crash-recovery copy updated)");
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // crash recovery: offer the last autosave copy once on startup
  useEffect(() => {
    const snap = readAutosave();
    if (!snap) return;
    const doc = snap.doc as { sheets?: unknown; name?: string } | null;
    if (!doc || !Array.isArray(doc.sheets)) {
      clearAutosave();
      return;
    }
    useApp.setState({ modal: "recovery", modalPayload: snap });
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useApp.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  /* ---------------------------- menus ------------------------------ */
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const hasSelection = selection.length > 0;

  const menus: Record<string, MenuItem[]> = {
    File: [
      {
        label: "New Project",
        shortcut: "Ctrl+N",
        run: () => {
          const fresh = createBlank();
          fresh.activeSheetId = fresh.sheets[0].id;
          act().setProject(fresh);
          act().addLog("ok", "New project created");
        },
      },
      { label: "Open…", shortcut: "Ctrl+O", run: () => act().openModal("open") },
      { label: "Save", shortcut: "Ctrl+S", run: () => act().saveProject() },
      { label: "Save As…", run: () => act().openModal("saveAs") },
      { label: "Save Copy", run: () => act().saveProject(true) },
      { label: "sep", sep: true },
      {
        label: "Import SPICE Netlist…",
        run: () => netlistRef.current?.click(),
      },
      { label: "Export SPICE Netlist", run: exportNetlist },
      { label: "Export Project JSON", run: exportProjectJson },
      { label: "sep", sep: true },
      { label: "Export SVG", run: exportSvg },
      { label: "Export PNG", run: exportPng },
      { label: "Export PDF", shortcut: "Ctrl+P", run: () => window.print() },
      { label: "sep", sep: true },
      { label: "Recent Projects…", run: () => act().openModal("open") },
      { label: "sep", sep: true },
      { label: "Example: RC Low-Pass", run: () => act().loadExample("rc") },
      { label: "Example: Diode Rectifier", run: () => act().loadExample("diode") },
      { label: "Example: Digital Counter", run: () => act().loadExample("digital") },
      { label: "sep", sep: true },
      { label: "Exit", hint: "browser preview", disabled: true },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", run: () => act().undo(), disabled: useApp.getState().historyIndex <= 0 },
      {
        label: "Redo",
        shortcut: "Ctrl+Y",
        run: () => act().redo(),
        disabled: useApp.getState().historyIndex >= useApp.getState().history.length - 1,
      },
      { label: "sep", sep: true },
      { label: "Cut", shortcut: "Ctrl+X", run: () => (act().copySelection(), act().deleteSelection()), disabled: !hasSelection },
      { label: "Copy", shortcut: "Ctrl+C", run: () => act().copySelection(), disabled: !hasSelection },
      { label: "Paste", shortcut: "Ctrl+V", run: () => act().pasteClipboard(), disabled: !useApp.getState().clip },
      { label: "Duplicate", shortcut: "Ctrl+D", run: () => act().duplicateSelection(), disabled: !hasSelection },
      { label: "Delete", shortcut: "Del", run: () => act().deleteSelection(), disabled: !hasSelection },
      { label: "sep", sep: true },
      {
        label: "Select All",
        shortcut: "Ctrl+A",
        run: () =>
          act().select([
            ...sheet.components.map((c) => c.id),
            ...sheet.wires.map((w) => w.id),
            ...sheet.labels.map((l) => l.id),
            ...sheet.probes.map((p) => p.id),
          ]),
      },
      { label: "Find…", shortcut: "Ctrl+F", run: () => act().openModal("find") },
    ],
    View: [
      { label: "Zoom In", shortcut: "Ctrl+ +", run: () => viewApi.zoomIn() },
      { label: "Zoom Out", shortcut: "Ctrl+ −", run: () => viewApi.zoomOut() },
      { label: "Fit to Content", shortcut: "Ctrl+0", run: () => viewApi.fit() },
      {
        label: "Zoom to Selection",
        run: () => {
          const c = sheet.components.find((x) => selection.includes(x.id));
          if (c) viewApi.zoomTo(c.x - 160, c.y - 120, 320, 240);
        },
        disabled: !hasSelection,
      },
      { label: "sep", sep: true },
      { label: ui.grid ? "Hide Grid" : "Show Grid", run: () => act().setUi({ grid: !ui.grid }) },
      { label: ui.snap ? "Disable Snap" : "Enable Snap", run: () => act().setUi({ snap: !ui.snap }) },
      { label: ui.rulers ? "Hide Rulers" : "Show Rulers", run: () => act().setUi({ rulers: !ui.rulers, visibility: { ...ui.visibility, Rulers: !ui.rulers } }) },
      {
        label: ui.markers ? "Hide Simulation Markers" : "Show Simulation Markers",
        run: () => act().setUi({ markers: !ui.markers, visibility: { ...ui.visibility, "Simulation Markers": !ui.markers } }),
      },
      { label: "sep", sep: true },
      { label: ui.showLeft ? "Hide Design Browser" : "Show Design Browser", run: () => act().setUi({ showLeft: !ui.showLeft }) },
      { label: ui.showRight ? "Hide Inspector" : "Show Inspector", run: () => act().setUi({ showRight: !ui.showRight }) },
      { label: ui.showBottom ? "Hide Bottom Panel" : "Show Bottom Panel", run: () => act().setUi({ showBottom: !ui.showBottom }) },
      { label: "sep", sep: true },
      { label: ui.theme === "dark" ? "Light Mode" : "Dark Mode", run: () => act().setUi({ theme: ui.theme === "dark" ? "light" : "dark" }) },
    ],
    Place: [
      { label: "Component…", shortcut: "P", run: () => act().openModal("componentBrowser") },
      { label: "Wire", shortcut: "W", run: () => act().setTool("wire") },
      {
        label: "Net Label",
        shortcut: "N",
        run: () => {
          act().setTool("place");
          useApp.setState({ placeLabelKind: "net" });
        },
      },
      {
        label: "Power Symbol…",
        run: () => {
          act().setTool("place");
          useApp.setState({ placeDefId: "vcc" });
        },
      },
      {
        label: "Ground",
        shortcut: "G",
        run: () => {
          act().setTool("place");
          useApp.setState({ placeDefId: "gnd" });
        },
      },
      { label: "Bus", shortcut: "B", run: () => act().setTool("bus") },
      {
        label: "Bus Entry",
        run: () => {
          act().setTool("wire");
          act().addLog("info", "Bus entry: draw a diagonal stub with the wire tool");
        },
      },
      {
        label: "Hierarchical Port",
        run: () => {
          act().setTool("place");
          useApp.setState({ placeDefId: "port" });
        },
      },
      { label: "sep", sep: true },
      ...(["voltage", "current", "differential", "power"] as const).map((t) => ({
        label: `${t[0].toUpperCase()}${t.slice(1)} Probe`,
        shortcut: t === "voltage" ? "1" : t === "current" ? "2" : t === "differential" ? "3" : "4",
        run: () => {
          useApp.setState({ probeType: t });
          act().setTool("probe");
        },
      })),
      { label: "sep", sep: true },
      {
        label: "Instrument…",
        run: () => act().openModal("instrument"),
      },
      {
        label: "Text",
        run: () => {
          act().setTool("place");
          useApp.setState({ placeLabelKind: "text" });
        },
      },
      { label: "Graphic Shape", hint: "documentation layer", disabled: true },
    ],
    Simulate: [
      { label: "Run", shortcut: "F5", run: () => act().run() },
      { label: "Pause", hint: "solver runs synchronously", disabled: true },
      { label: "Stop", run: () => act().stopSim(), disabled: simState !== "Running" && simState !== "Preparing" },
      {
        label: "Restart",
        run: () => {
          act().clearResults();
          act().run();
        },
      },
      { label: "sep", sep: true },
      { label: "Simulation Settings…", run: () => act().openModal("analysis") },
      { label: "Interactive Simulation", hint: "toggle logic inputs on the sheet", run: () => act().addLog("info", "Interactive mode: double-click a Logic Input to toggle its level") },
      { label: "Open Analysis", run: () => act().openModal("analysis") },
      {
        label: "Open Grapher",
        run: () => {
          act().setUi({ showBottom: true, bottomTab: "Grapher", bottomHeight: Math.max(320, ui.bottomHeight) });
        },
      },
      { label: "Clear Results", run: () => act().clearResults() },
    ],
    Analyze: [
      { label: "Operating Point", run: () => act().run("op") },
      { label: "Transient Analysis", run: () => act().run("tran") },
      { label: "AC Analysis", run: () => act().run("ac") },
      { label: "DC Sweep", run: () => act().run("dc") },
      { label: "Parameter Sweep…", run: () => act().openModal("sweep") },
      {
        label: "Fourier Analysis",
        run: () => {
          act().run("tran");
          act().addLog("info", "Fourier: after the transient run select a trace and press FFT in the Grapher");
        },
      },
      { label: "Temperature Sweep", hint: "planned", disabled: true },
      { label: "Noise Analysis", hint: "planned", disabled: true },
      { label: "Monte Carlo", hint: "planned", disabled: true },
      { label: "Sensitivity", hint: "planned", disabled: true },
    ],
    Tools: [
      { label: "Component Browser", run: () => act().openModal("componentBrowser") },
      { label: "Model Manager", hint: "library is fixed in this build", disabled: true },
      {
        label: "Netlist Viewer",
        run: () => act().setUi({ showBottom: true, bottomTab: "Netlist" }),
      },
      { label: "ERC", run: () => act().setUi({ showBottom: true, bottomTab: "Problems" }) },
      {
        label: "Annotation",
        run: () => act().annotate(),
      },
      {
        label: "Design Variables",
        run: () => act().setUi({ showLeft: true, leftTab: "Project" }),
      },
      {
        label: "Preferences",
        run: () => act().setUi({ showRight: true }),
      },
      { label: "Keyboard Shortcuts", run: () => act().openModal("shortcuts") },
    ],
    Reports: [
      { label: "Bill of Materials", run: () => act().openModal("report", "Bill of Materials") },
      { label: "Component List", run: () => act().openModal("report", "Component List") },
      { label: "Net List", run: () => act().openModal("report", "Net List") },
      { label: "Simulation Report", run: () => act().openModal("report", "Simulation Report") },
      { label: "Measurement Report", run: () => act().openModal("report", "Measurement Report") },
    ],
    Window: [
      {
        label: ui.showLeft ? "Hide Design Browser" : "Show Design Browser",
        run: () => act().setUi({ showLeft: !ui.showLeft }),
      },
      { label: ui.showRight ? "Hide Inspector" : "Show Inspector", run: () => act().setUi({ showRight: !ui.showRight }) },
      { label: ui.showBottom ? "Hide Bottom Panel" : "Show Bottom Panel", run: () => act().setUi({ showBottom: !ui.showBottom }) },
      { label: "sep", sep: true },
      ...sheet.instruments.map((i) => ({
        label: `${i.ref} — ${i.name}`,
        run: () =>
          act().updateObject(i.id, { window: { ...i.window, open: !i.window.open } }, `${i.ref} window toggled`),
      })),
      ...(sheet.instruments.length ? [{ label: "sep", sep: true } as MenuItem] : []),
      {
        label: "Grapher",
        run: () => act().setUi({ showBottom: true, bottomTab: "Grapher" }),
      },
      {
        label: "Arrange Windows",
        run: () =>
          act().commit((p) => {
            const s = p.sheets.find((x) => x.id === p.activeSheetId) ?? p.sheets[0];
            s.instruments.forEach((ins, i) => {
              ins.window = { ...ins.window, x: 40 + i * 40, y: 40 + i * 32 };
            });
          }, "Instrument windows arranged"),
      },
    ],
    Help: [
      { label: "Documentation", run: () => act().openModal("docs") },
      { label: "Keyboard Shortcuts", run: () => act().openModal("shortcuts") },
      { label: "sep", sep: true },
      { label: "About CircuitBench", run: () => act().openModal("about") },
    ],
  };

  const commandList = Object.entries(menus).flatMap(([menu, items]) =>
    items
      .filter((i) => !i.sep && i.run)
      .map((i) => ({ label: `${menu} ▸ ${i.label}`, run: i.run!, disabled: i.disabled })),
  );
  const filteredCommands = commandList.filter((c) =>
    c.label.toLowerCase().includes(paletteQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" data-theme={ui.theme}>
      {/* title bar */}
      <div
        className="flex items-center gap-3 px-3 rule-b"
        style={{
          height: 32,
          background: "var(--chrome)",
          backgroundImage: "url(images/panel.jpg)",
          backgroundSize: "cover",
          backgroundBlendMode: "luminosity",
          flex: "none",
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--blue)" />
            <path d="M4 10 L6 10 L7 5 L9 12 L10 8 L12 8" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: "-0.01em" }}>CircuitBench</span>
        </div>
        <div className="tsep" />
        <div className="mono" style={{ fontSize: 11 }}>
          {project.name}
          {dirty ? " •" : ""}
        </div>
        <div className="hint">
          {sheet.name} · {graph.stats.nets} nets · {graph.stats.components} parts
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saving && <span className="hint">saving…</span>}
          <span
            className="badge"
            style={{
              background:
                simState === "Running"
                  ? "var(--ok-soft)"
                  : simState === "Error"
                    ? "var(--error-soft)"
                    : "var(--panel-2)",
              color:
                simState === "Running"
                  ? "var(--ok)"
                  : simState === "Error"
                    ? "var(--error)"
                    : "var(--ink-2)",
            }}
          >
            {simState}
          </span>
          <button className="tbtn" title="Command palette (Ctrl+K)" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={13} />
          </button>
        </div>
      </div>

      {/* menu bar */}
      <div className="flex items-center rule-b" style={{ height: 26, background: "var(--panel)", flex: "none" }}>
        {Object.keys(menus).map((m) => (
          <div key={m} className="relative">
            <button
              className="tbtn"
              style={{
                height: 25,
                borderRadius: 0,
                padding: "0 10px",
                background: openMenu === m ? "var(--blue-soft)" : "transparent",
                color: openMenu === m ? "var(--blue)" : "var(--ink)",
                fontSize: 11.5,
              }}
              onClick={() => setOpenMenu(openMenu === m ? null : m)}
              onMouseEnter={() => openMenu && setOpenMenu(m)}
            >
              {m}
            </button>
            {openMenu === m && (
              <div className="menu" style={{ top: 25, left: 0 }}>
                {menus[m].map((item, i) =>
                  item.sep ? (
                    <div key={i} className="menu-sep" />
                  ) : (
                    <div
                      key={i}
                      className={`menu-item ${item.disabled ? "disabled" : ""}`}
                      onClick={() => {
                        if (item.disabled) return;
                        setOpenMenu(null);
                        item.run?.();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="menu-key">{item.shortcut}</span>}
                      {!item.shortcut && item.hint && <span className="menu-hint">{item.hint}</span>}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
        <div className="ml-auto pr-2 flex items-center gap-2">
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
            grid {ui.gridSize} · {ui.snap ? "snap" : "free"} · {ui.theme}
          </span>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center rule-b" style={{ height: 32, background: "var(--panel-2)", flex: "none" }}>
        <div className="flex items-center px-1">
          <ToolButton icon="cursor" label="Select" active={tool === "select"} onClick={() => act().setTool("select")} />
          <ToolButton icon="wire" label="Wire" active={tool === "wire"} onClick={() => act().setTool("wire")} />
          <ToolButton icon="bus" label="Bus" active={tool === "bus"} onClick={() => act().setTool("bus")} />
          <ToolButton icon="plus" label="Place" active={tool === "place"} onClick={() => act().openModal("componentBrowser")} />
          <ToolButton
            icon="probe"
            label="Probe"
            active={tool === "probe"}
            onClick={() => act().setTool("probe")}
          />
          <div className="tsep" />
          <ToolButton icon="power" label="Ground" onClick={() => (act().setTool("place"), useApp.setState({ placeDefId: "gnd" }))} />
          <ToolButton
            icon="net"
            label="Net label"
            onClick={() => (act().setTool("place"), useApp.setState({ placeLabelKind: "net" }))}
          />
          <div className="tsep" />
          <ToolButton icon="undo" label="Undo" onClick={() => act().undo()} disabled={useApp.getState().historyIndex <= 0} />
          <ToolButton
            icon="redo"
            label="Redo"
            onClick={() => act().redo()}
            disabled={useApp.getState().historyIndex >= useApp.getState().history.length - 1}
          />
          <ToolButton icon="rotate" label="Rotate" onClick={() => act().rotateSelection()} disabled={!hasSelection} />
          <ToolButton icon="mirror" label="Mirror" onClick={() => act().mirrorSelection()} disabled={!hasSelection} />
          <ToolButton icon="trash" label="Delete" onClick={() => act().deleteSelection()} disabled={!hasSelection} />
          <div className="tsep" />
          <ToolButton icon="zoomout" label="Zoom out" onClick={() => viewApi.zoomOut()} />
          <ToolButton icon="zoomin" label="Zoom in" onClick={() => viewApi.zoomIn()} />
          <ToolButton icon="fit" label="Fit" onClick={() => viewApi.fit()} />
          <ToolButton icon="grid" label="Grid" active={ui.grid} onClick={() => act().setUi({ grid: !ui.grid })} />
          <div className="tsep" />
          <ToolButton icon="chart" label="Grapher" onClick={() => act().setUi({ showBottom: true, bottomTab: "Grapher" })} />
          <ToolButton
            icon="scope"
            label="Instruments"
            onClick={() => act().setUi({ showLeft: true, leftTab: "Instruments" })}
          />
          <ToolButton icon="panel" label="Panels" onClick={() => act().setUi({ showBottom: !ui.showBottom })} />
        </div>
        <div className="ml-auto flex items-center gap-1 pr-2">
          <ToolButton
            icon="check"
            label="ERC"
            onClick={() => act().setUi({ showBottom: true, bottomTab: "Problems" })}
            active={graph.errors.length > 0}
          />
          <button
            className="btn primary"
            style={{ height: 25 }}
            onClick={() => act().run()}
            title="Run the active analysis (F5)"
          >
            <span className="flex items-center gap-1">
              <Icon name="run" size={12} />
              Run
            </span>
          </button>
          <button className="btn" style={{ height: 25 }} onClick={() => act().stopSim()} title="Stop the simulation">
            <span className="flex items-center gap-1">
              <Icon name="stop" size={12} />
              Stop
            </span>
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex flex-1 min-h-0">
        {ui.showLeft && <DesignBrowser />}
        <main className="flex-1 min-w-0 flex flex-col min-h-0 relative">
          <Canvas />
          {ui.showBottom && (
            <div style={{ height: ui.bottomHeight, flex: "none" }} className="rule-t relative">
              <div
                onPointerDown={(e) => {
                  const startY = e.clientY;
                  const h0 = ui.bottomHeight;
                  const move = (ev: PointerEvent) => {
                    act().setUi({ bottomHeight: Math.max(120, Math.min(720, h0 + (startY - ev.clientY))) });
                  };
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
                style={{
                  position: "absolute",
                  top: -3,
                  left: 0,
                  right: 0,
                  height: 6,
                  cursor: "ns-resize",
                  zIndex: 20,
                }}
                title="Drag to resize the bottom panel"
              />
              <BottomPanel />
            </div>
          )}
          {!ui.showBottom && (
            <button
              className="tbtn rule-t"
              style={{ height: 22, borderRadius: 0, justifyContent: "flex-start", paddingLeft: 12 }}
              onClick={() => act().setUi({ showBottom: true })}
            >
              <Icon name="up" size={12} />
              <span className="sc">Show bottom panel</span>
            </button>
          )}
        </main>
        {ui.showRight && <Inspector />}
      </div>

      <InstrumentWindows />

      {/* hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          act().importProjectJson(await f.text());
          e.target.value = "";
        }}
      />
      <input
        ref={netlistRef}
        type="file"
        accept=".cir,.net,.sp,.spice,.txt"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          importNetlist(await f.text());
          e.target.value = "";
        }}
      />

      {/* dialogs */}
      {modal === "componentBrowser" && <ComponentBrowser />}
      {modal === "analysis" && <AnalysisDialog />}
      {modal === "sweep" && <SweepDialog />}
      {modal === "shortcuts" && <ShortcutsDialog />}
      {modal === "about" && <AboutDialog />}
      {modal === "docs" && <DocumentationDialog />}
      {modal === "open" && <OpenProjectDialog />}
      {modal === "find" && <FindDialog />}
      {modal === "properties" && <PropertiesDialog id={String(modalPayload)} />}
      {modal === "report" && <ReportDialog kind={String(modalPayload)} />}
      {modal === "saveAs" && (
        <SaveAsDialog />
      )}
      {modal === "instrument" && <InstrumentDialog />}
      {modal === "recovery" && <RecoveryDialog />}

      {/* command palette */}
      {paletteOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}
        >
          <div className="modal" style={{ width: 520 }}>
            <div className="panel-head" style={{ height: 36 }}>
              <Icon name="search" size={14} />
              <input
                className="inp"
                style={{ border: "none", background: "transparent", fontSize: 13 }}
                placeholder="Type a command…"
                value={paletteQuery}
                autoFocus
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredCommands[0] && !filteredCommands[0].disabled) {
                    filteredCommands[0].run();
                    setPaletteOpen(false);
                    setPaletteQuery("");
                  }
                }}
              />
            </div>
            <div className="scroll" style={{ maxHeight: 380 }}>
              {filteredCommands.map((c, i) => (
                <div
                  key={i}
                  className={`row ${c.disabled ? "opacity-50" : ""}`}
                  onClick={() => {
                    if (c.disabled) return;
                    c.run();
                    setPaletteOpen(false);
                    setPaletteQuery("");
                  }}
                >
                  <Icon name="chevron" size={11} />
                  <span>{c.label}</span>
                </div>
              ))}
              {filteredCommands.length === 0 && <div className="hint p-3">No matching command.</div>}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2"
          style={{
            background: "var(--ink)",
            color: "var(--ink-inv)",
            padding: "6px 14px",
            borderRadius: 5,
            fontSize: 11.5,
            zIndex: 300,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`tbtn ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function createBlank() {
  return createProject("Untitled Project");
}

function SaveAsDialog() {
  const [name, setName] = useState(useApp.getState().project.name);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && useApp.getState().openModal(null)}>
      <div className="modal" style={{ width: 420 }}>
        <div className="panel-head" style={{ height: 34 }}>
          <span className="sc" style={{ color: "var(--ink)" }}>
            Save Project As
          </span>
        </div>
        <div className="p-3">
          <div className="field">
            <span className="lbl">Project name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="rule-t p-3 flex justify-end gap-2">
          <button className="btn" onClick={() => useApp.getState().openModal(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await useApp.getState().saveProjectAs(name);
              useApp.getState().openModal(null);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function InstrumentDialog() {
  const kinds: { id: string; label: string }[] = [
    { id: "oscilloscope", label: "Oscilloscope — 4 channels, trigger, cursors" },
    { id: "fgen", label: "Function Generator — sine / square / triangle / saw" },
    { id: "dmm", label: "Digital Multimeter — DC/AC V & I, frequency" },
    { id: "bode", label: "Bode Plotter — magnitude & phase" },
    { id: "logic", label: "Logic Analyzer — 8/16/32 channels" },
    { id: "wattmeter", label: "Wattmeter — power & energy" },
  ];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && useApp.getState().openModal(null)}>
      <div className="modal" style={{ width: 460 }}>
        <div className="panel-head" style={{ height: 34 }}>
          <span className="sc" style={{ color: "var(--ink)" }}>
            Place Instrument
          </span>
        </div>
        <div className="scroll" style={{ maxHeight: 320 }}>
          {kinds.map((k) => (
            <div
              key={k.id}
              className="row"
              onClick={() => {
                useApp.setState({
                  instrumentKind: k.id as never,
                  tool: "instrument",
                });
                useApp.getState().openModal(null);
                useApp.getState().addLog("info", `Instrument placement armed: ${k.label}`);
              }}
            >
              <Icon name="scope" size={13} />
              <span>{k.label}</span>
            </div>
          ))}
        </div>
        <div className="rule-t p-3 flex justify-end">
          <button className="btn" onClick={() => useApp.getState().openModal(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RecoveryDialog() {
  const payload = useApp((s) => s.modalPayload) as { doc: unknown; at: string } | null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && useApp.getState().openModal(null)}
    >
      <div className="modal" style={{ width: 440 }}>
        <div className="panel-head" style={{ height: 34 }}>
          <span className="sc" style={{ color: "var(--ink)" }}>
            Crash Recovery
          </span>
        </div>
        <div className="p-3" style={{ fontSize: 12 }}>
          A locally autosaved working copy from{" "}
          <span className="mono">{payload?.at || "an earlier session"}</span> was found. Restore it, or discard it and
          continue with the current document.
        </div>
        <div className="rule-t p-3 flex justify-end gap-2">
          <button
            className="btn"
            onClick={() => {
              clearAutosave();
              useApp.getState().openModal(null);
              useApp.getState().addLog("info", "Autosave copy discarded");
            }}
          >
            Discard
          </button>
          <button
            className="btn primary"
            onClick={() => {
              useApp.getState().importProjectJson(JSON.stringify(payload?.doc ?? {}));
              clearAutosave();
            }}
          >
            Restore working copy
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Vec };
