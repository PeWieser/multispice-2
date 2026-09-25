import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-[100dvh] place-items-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-[420px] rounded-2xl p-8 text-center" style={{ background: "var(--panel-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={72} height={72} className="mx-auto mb-5 rounded-2xl" />
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-mute">Fehler 404</div>
        <h1 className="mt-2 text-[20px] font-semibold">Diese Seite gibt es nicht.</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">
          Der Link führt ins Leere – deine Schaltungen im Browser-Speicher bleiben unberührt.
          Zurück zum Arbeitsplatz, dort wartet dein Projekt.
        </p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex h-9 items-center px-4 text-[13px]">
          Zurück zum Arbeitsplatz
        </Link>
      </div>
    </div>
  );
}
