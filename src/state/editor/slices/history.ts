



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { gesture, clone } from "../shared";export function createHistorySlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setDoc" | "commit" | "beginGesture" | "endGesture" | "undo" | "redo"> {
  return {
      setDoc: (doc, pushHistory = true) => {
        // S5.6d: Lehrer-Modus sperrt jeden Planwechsel (Boot-Restore nutzt set() direkt).
        if (get().teacher.locked) return;
        const prev = get().doc;
        set((s) => ({
          doc,
          past: pushHistory ? [...s.past.slice(-49), clone(prev)] : s.past,
          future: pushHistory ? [] : s.future,
        }));
        get().refreshNets();
      },

      commit: (mutator) => {
        // S5.6d: Flaschenhals aller Plan-Änderungen (21 Stellen) — gesperrt ist gesperrt.
        if (get().teacher.locked) return;
        const prev = get().doc;
        const next = clone(prev);
        mutator(next);
        const shouldPush = !gesture.active || !gesture.pushed;
        if (gesture.active) gesture.pushed = true;
        set((s) => ({
          doc: next,
          past: shouldPush ? [...s.past.slice(-49), prev] : s.past,
          future: shouldPush ? [] : s.future,
        }));
        get().refreshNets();
        get().markPartEditorDirty(); // S6.2: Editor-Änderung (Undo-fähig, aber Projekt-unabhängig).
      },

      beginGesture: () => {
        gesture.active = true;
        gesture.pushed = false;
      },

      endGesture: () => {
        gesture.active = false;
        gesture.pushed = false;
      },

      undo: () => {
        if (get().teacher.locked) return;
        gesture.active = false;
        gesture.pushed = false;
        const { past, doc, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, 50) });
        get().refreshNets();
        get().markPartEditorDirty();
        get().log("info", "Rückgängig");
        // S5.15: Undo-Toast mit Wiederholen-Aktion (TEST_MATRIX §14).
        get().setToast({ message: "Rückgängig gemacht.", actionLabel: "Wiederholen", action: () => get().redo() });
      },

      redo: () => {
        if (get().teacher.locked) return;
        gesture.active = false;
        gesture.pushed = false;
        const { future, doc, past } = get();
        if (!future.length) return;
        const next = future[0];
        set({ doc: next, future: future.slice(1), past: [...past, doc] });
        get().refreshNets();
        get().markPartEditorDirty();
        get().log("info", "Wiederholen");
        get().setToast({ message: "Wiederholt.", actionLabel: "Rückgängig", action: () => get().undo() });
      },
  };
}
