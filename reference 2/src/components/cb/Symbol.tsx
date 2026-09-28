"use client";
import type { Prim } from "@/lib/cb/library";

export function Prims({ prims, stroke = "currentColor", sw = 1.2 }: { prims: Prim[]; stroke?: string; sw?: number }) {
  return (
    <>
      {prims.map((p, i) => {
        switch (p.t) {
          case "l": {
            const pts = []; for (let k = 0; k < p.p.length; k += 2) pts.push(`${p.p[k]},${p.p[k + 1]}`);
            return <polyline key={i} points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />;
          }
          case "c": return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.fill ? stroke : "none"} stroke={stroke} strokeWidth={sw} />;
          case "p": return <path key={i} d={p.d} fill={p.fill ? stroke : "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
          case "r": return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke={stroke} strokeWidth={sw} />;
          case "tx": return <text key={i} x={p.x} y={p.y} fontSize={p.size ?? 8} textAnchor="middle" fill={stroke} stroke="none" style={{ fontFamily: "ui-monospace, monospace" }}>{p.s}</text>;
        }
      })}
    </>
  );
}
