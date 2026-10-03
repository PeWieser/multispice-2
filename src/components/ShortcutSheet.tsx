"use client";

import { SHORTCUTS } from "@/lib/shortcuts";
import { DialogHeader, Kbd, ModalShell } from "./ui";

/** Kurzbefehl-Übersicht (?) — liest aus der einzigen Quelle `lib/shortcuts`. */
export default function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell label="Kurzbefehle" onClose={onClose} maxWidth={640}>
      <DialogHeader title="Kurzbefehle" onClose={onClose} />
      <div className="grid min-h-0 flex-1 gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
        {SHORTCUTS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-3">{group.title}</h3>
            <ul className="space-y-0.5">
              {group.items.map((s) => (
                <li key={s.label} className="flex min-h-7 items-center justify-between gap-4 text-sm text-ink">
                  <span>{s.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-3">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                    {s.note && <span>{s.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ModalShell>
  );
}
