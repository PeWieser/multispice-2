"use client";

/** Runde 19 (W36): gemeinsamer Hinweis-Streifen „Messleitung in der Hand" –
 *  das Oszi nutzt ihn für den Tastkopf (CH1–CH4), der FG-2500 für das Kabel
 *  an OUT1/OUT2. Er schwebt oben in der Mitte des Gerätefensters. */
export function LeadBanner({
  color,
  title,
  hint,
  onCancel,
}: {
  color: string;
  title: string;
  hint: string;
  onCancel: () => void;
}) {
  return (
    <div
      className="pointer-events-auto fixed left-1/2 top-3 z-[60] flex max-w-[min(920px,92vw)] -translate-x-1/2 items-center gap-3 rounded-full bg-black/85 px-5 py-2 text-[13px] text-white shadow-xl"
      style={{ boxShadow: `0 0 0 2px ${color}` }}
    >
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
      <span>
        <b>{title}</b> {hint}
      </span>
      <button className="shrink-0 rounded-full bg-white/15 px-3 py-0.5 text-[12px] hover:bg-white/25" onClick={onCancel}>
        Zurückstecken
      </button>
    </div>
  );
}
