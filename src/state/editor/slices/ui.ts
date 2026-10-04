



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { nextLogId, now } from "../shared";export function createUiSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setTheme" | "setSymbolStyle" | "toggleTheme" | "toggleCurrentFlow" | "toggleVoltageColors" | "setCurrentFlowDirection" | "toggleInlineValues" | "toggleRulers" | "togglePageFrame" | "toggleErcMarkers" | "toggleRated" | "log" | "clearLogs" | "setBottomTab" | "toggleBottom" | "toggleLeft" | "toggleRight" | "toggleLibrary" | "setLibraryPos" | "setLibrarySize" | "setToast" | "clearToast"> {
  return {
      setTheme: (t) => set({ theme: t }),
      setSymbolStyle: (s) => set({ symbolStyle: s }),
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
  };
}
