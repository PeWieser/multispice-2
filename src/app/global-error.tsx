"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body className="h-full antialiased select-none p-6" style={{ background: "#0b0d12", color: "#e8ecf5", fontFamily: "ui-monospace, monospace" }}>
        <h1 className="text-[18px] font-bold mb-3">Client-Crash gefangen</h1>
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed p-3 rounded" style={{ background: "#151a25", border: "1px solid rgba(255,255,255,0.1)" }}>
          {String(error?.message || "Unbekannter Fehler")}
          {"\n\n"}
          {String(error?.stack || "")}
          {"\n\nDigest: "}
          {error?.digest || "—"}
        </pre>
        <button className="mt-4 px-3 py-1.5 rounded text-[13px]" style={{ background: "#5b8cff", color: "white" }} onClick={() => reset()}>
          Neu versuchen
        </button>
      </body>
    </html>
  );
}
