



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { nextLogId, now } from "../shared";
import { hashTeacherCode, isTeacherCodeFormat, saveTeacherLock, verifyTeacherCode } from "@/lib/teacher";export function createUiSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setTheme" | "setUiFontSize" | "setSymbolStyle" | "setESeries" | "toggleTheme" | "toggleCurrentFlow" | "toggleVoltageColors" | "setCurrentFlowDirection" | "toggleInlineValues" | "toggleRulers" | "togglePageFrame" | "toggleErcMarkers" | "toggleRated" | "log" | "clearLogs" | "setBottomTab" | "toggleBottom" | "toggleLeft" | "toggleRight" | "toggleLibrary" | "setLibraryPos" | "setLibrarySize" | "setToast" | "clearToast" | "setTeacherCode" | "setTeacherLocked" | "unlockTeacher"> {
  return {
      setTheme: (t) => set({ theme: t }),
      setUiFontSize: (s) => set({ uiFontSize: s }),
      setSymbolStyle: (s) => set({ symbolStyle: s }),
      setESeries: (s) => set({ eSeries: s }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : s.theme === "light" ? "system" : "dark" })),
      toggleCurrentFlow: () => set((s) => ({ showCurrentFlow: !s.showCurrentFlow })),
      toggleVoltageColors: () => set((s) => ({ showVoltageColors: !s.showVoltageColors })),
      setCurrentFlowDirection: (d) => set({ currentFlowDirection: d }),
      toggleInlineValues: () => set((s) => ({ showInlineValues: !s.showInlineValues })),
      toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
      togglePageFrame: () => set((s) => ({ showPageFrame: !s.showPageFrame })),
      toggleErcMarkers: () => set((s) => ({ showErcMarkers: !s.showErcMarkers })),
      toggleRated: () => set((s) => ({ showRated: !s.showRated })),

      log: (level, message) =>
        set((s) => ({ logs: [...s.logs.slice(-300), { id: nextLogId(), level, time: now(), message }] })),
      clearLogs: () => set({ logs: [] }),

      setBottomTab: (t) => set({ bottomTab: t, bottomOpen: true }),
      toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
      toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      toggleLibrary: () => set((s) => ({ libraryOpen: !s.libraryOpen })),
      setLibraryPos: (pos) => set({ libraryPos: pos }),
      setLibrarySize: (size) => set({ librarySize: size }),
      setToast: (t) => set({ toast: t }),
      clearToast: () => set({ toast: null }),
      // S5.6d: Lehrer-Modus
      setTeacherCode: (code) => {
        if (!isTeacherCodeFormat(code)) return false;
        const next = { locked: false, codeHash: hashTeacherCode(code) };
        set({ teacher: next });
        saveTeacherLock(next);
        get().log("ok", "Lehrer-Modus: Code gesetzt (Plan noch entsperrt).");
        return true;
      },
      setTeacherLocked: (locked) => {
        const cur = get().teacher;
        if (locked && !cur.codeHash) return;
        const next = { ...cur, locked };
        set({ teacher: next });
        saveTeacherLock(next);
        get().log("info", locked ? "Lehrer-Modus: Plan gesperrt (Werte/Faults versteckt)." : "Lehrer-Modus: Plan entsperrt.");
      },
      unlockTeacher: (code) => {
        const cur = get().teacher;
        if (!cur.codeHash || !verifyTeacherCode(code, cur.codeHash)) return false;
        const next = { ...cur, locked: false };
        set({ teacher: next });
        saveTeacherLock(next);
        get().log("ok", "Lehrer-Modus: entsperrt.");
        return true;
      },
  };
}
