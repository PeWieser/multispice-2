"use client";
import dynamic from "next/dynamic";

const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <div style={{ padding: 16, fontFamily: "system-ui", fontSize: 12, color: "#656d76" }}>Loading CircuitBench…</div>,
});

export default function ClientApp() {
  return <App />;
}
