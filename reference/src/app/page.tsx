"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--chrome)",
        color: "var(--ink-2)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      CircuitBench — loading workbench
    </div>
  ),
});

export default function Page() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <App />;
}
