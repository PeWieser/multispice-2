"use client";

import { Button, Kbd } from "@/components/ui";
import { adaptShortcut, useIsApple } from "@/lib/platform";

/** Leerer Schaltplan: ruhiger Einstieg mit drei klaren nächsten Schritten. */
export default function EmptyCanvas({
  onPlaceResistor,
  onOpenLibrary,
  onShowShortcuts,
}: {
  onPlaceResistor: () => void;
  onOpenLibrary: () => void;
  onShowShortcuts: () => void;
}) {
  const apple = useIsApple();
  return (
    <div className="pointer-events-none absolute inset-0 z-floating flex items-center justify-center p-6">
      <section
        aria-labelledby="empty-canvas-title"
        className="pointer-events-auto w-full max-w-sm rounded-window border border-hairline bg-surface/90 p-6 text-center shadow-2 backdrop-blur-md"
      >
        <svg aria-hidden viewBox="0 0 96 32" className="mx-auto mb-4 h-8 w-24 text-ink-3">
          <path d="M2 16h22l4-8 8 16 8-16 8 16 8-16 4 8h30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="2" cy="16" r="2" fill="currentColor" />
          <circle cx="94" cy="16" r="2" fill="currentColor" />
        </svg>
        <h2 id="empty-canvas-title" className="text-base font-semibold text-ink">Leerer Schaltplan</h2>
        <p className="mt-1 text-sm text-ink-2">Setze ein erstes Bauteil und verbinde es mit Leitungen.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" onClick={onPlaceResistor}>Widerstand platzieren</Button>
          <Button variant="secondary" onClick={onOpenLibrary}>
            Bibliothek öffnen <Kbd>{adaptShortcut("⌘K", apple)}</Kbd>
          </Button>
          <Button variant="ghost" onClick={onShowShortcuts}>
            Tastenkürzel <Kbd>?</Kbd>
          </Button>
        </div>
      </section>
    </div>
  );
}
