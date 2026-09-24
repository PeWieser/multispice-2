"use client";

import { useEffect, useState } from "react";
import AnalysisDialog from "./AnalysisDialog";
import BottomPanel from "./BottomPanel";
import Canvas from "./Canvas";
import Inspector from "./Inspector";
import { InstrumentDock, InstrumentLayer } from "./Instruments";
import LeftSidebar from "./LeftSidebar";
import MenuBar from "./MenuBar";
import StatusBar from "./StatusBar";
import Toolbar from "./Toolbar";
import { useEditor } from "@/state/editor";

export default function Workbench() {
  const theme = useEditor((s) => s.theme);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const [dialogKind, setDialogKind] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Einmalig beim Start: gespeicherten Stand aus dem Browser wiederherstellen.
  useEffect(() => {
    useEditor.getState().restoreLocalProject();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <MenuBar onAnalysis={setDialogKind} />
      <Toolbar />
      <div className="relative flex min-h-0 flex-1">
        {leftOpen && <LeftSidebar />}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Canvas />
            <InstrumentLayer />
          </div>
          <BottomPanel />
        </div>
        {rightOpen && <Inspector />}
        <InstrumentDock />
      </div>
      <StatusBar />
      {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
    </div>
  );
}
