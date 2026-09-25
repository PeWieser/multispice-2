"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body className="h-full antialiased" style={{ background: "#0b0d12", color: "#e8ecf5" }}>
        <div className="grid min-h-[100dvh] place-items-center p-6">
          <div className="w-full max-w-[460px] rounded-2xl p-8 text-center" style={{ background: "#12151d", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 L2 20 h20 Z" />
                <path d="M12 10 v4" />
                <path d="M12 17.5 v.5" />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold">Multispice hat sich verschluckt.</h1>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "#9aa3b5" }}>
              Ein unerwarteter Fehler hat die Oberfläche gestoppt. Keine Sorge: Deine Schaltung
              liegt sicher im Browser-Speicher – nichts geht verloren.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                className="h-9 rounded-lg px-4 text-[13px] font-medium text-white"
                style={{ background: "#5b8cff" }}
                onClick={() => reset()}
              >
                Neu versuchen
              </button>
              <button
                className="h-9 rounded-lg px-4 text-[13px] font-medium"
                style={{ background: "#1b2130", border: "1px solid rgba(255,255,255,0.1)", color: "#e8ecf5" }}
                onClick={() => window.location.reload()}
              >
                Seite neu laden
              </button>
            </div>
            <details className="mt-6 text-left">
              <summary className="cursor-pointer select-text text-[11px]" style={{ color: "#6b7488" }}>
                Technische Details (für Neugierige)
              </summary>
              <pre
                className="mt-2 max-h-[160px] overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-[11px] leading-relaxed select-text"
                style={{ background: "#0b0d12", border: "1px solid rgba(255,255,255,0.08)", color: "#8b93a7" }}
              >
                {String(error?.message || "Unbekannter Fehler")}
                {"\nDigest: "}
                {error?.digest || "—"}
              </pre>
            </details>
          </div>
        </div>
      </body>
    </html>
  );
}
