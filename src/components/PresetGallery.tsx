"use client";

import { useMemo } from "react";
import { Dialog } from "./ui";
import { PRESETS } from "@/lib/schematic/tools";
import { docToSvg } from "@/lib/export/sheet";
import { useEditor } from "@/state/editor";

/**
 * S2.5: Beispiel-Galerie — alle Vorlagen mit Vorschaubild, Name und
 * Beschreibung. Die Thumbnails rendert derselbe `docToSvg`-Renderer wie den
 * Export: Was man sieht, ist ehrlich das, was man lädt.
 */
export default function PresetGallery({ onClose }: { onClose: () => void }) {
  const loadPreset = useEditor((s) => s.loadPreset);
  const thumbs = useMemo(
    () =>
      PRESETS.map((p) => {
        try {
          return { id: p.id, name: p.name, description: p.description, svg: docToSvg(p.build(), { frame: false }) };
        } catch {
          return { id: p.id, name: p.name, description: p.description, svg: "" };
        }
      }),
    [],
  );
  return (
    <Dialog
      title="Beispiel-Galerie"
      subtitle="Vorschaubild anklicken lädt den Entwurf in den aktuellen Reiter (Rückgängig stellt die vorige Schaltung wieder her)"
      onClose={onClose}
      wide
      actions={
        <button className="btn btn-primary" onClick={onClose}>
          Schließen
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {thumbs.map((t) => (
          <button
            key={t.id}
            className="group flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface text-left transition-colors hover:border-accent"
            onClick={() => {
              loadPreset(t.id);
              onClose();
            }}
            title={`${t.name} laden`}
          >
            {t.svg ? (
              <span
                className="block aspect-[4/3] w-full bg-app [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: t.svg }}
              />
            ) : (
              <span className="grid aspect-[4/3] w-full place-items-center bg-app text-2xs text-ink-3">
                Keine Vorschau
              </span>
            )}
            <span className="flex flex-col gap-0.5 p-2">
              <span className="text-xs font-medium">{t.name}</span>
              <span className="line-clamp-2 text-2xs leading-snug text-ink-3">{t.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
