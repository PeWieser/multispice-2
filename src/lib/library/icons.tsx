"use client";

import React from "react";

// Handcrafted category icons – 16x16 viewBox, stroke 1.5, rounded caps, slight hand-drawn feel
// Farben werden via currentColor gesteuert, Hintergrund via wrapper

export type CategoryIconKey =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "transistor"
  | "mosfet"
  | "opamp"
  | "ic"
  | "power"
  | "ground"
  | "source"
  | "switch"
  | "connector"
  | "sensor"
  | "misc";

export const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  "Passives": { bg: "rgba(251,191,36,0.18)", fg: "#fbbf24" }, // amber
  "Resistors": { bg: "rgba(251,191,36,0.18)", fg: "#fbbf24" },
  "Capacitors": { bg: "rgba(251,191,36,0.18)", fg: "#fbbf24" },
  "Inductors": { bg: "rgba(251,191,36,0.18)", fg: "#fbbf24" },
  "Diodes": { bg: "rgba(251,146,60,0.18)", fg: "#fb923c" }, // orange
  "Transistors": { bg: "rgba(34,211,238,0.18)", fg: "#22d3ee" }, // cyan
  "MOSFETs": { bg: "rgba(34,211,238,0.18)", fg: "#22d3ee" },
  "OpAmps": { bg: "rgba(167,139,250,0.18)", fg: "#a78bfa" }, // purple
  "ICs": { bg: "rgba(167,139,250,0.18)", fg: "#a78bfa" },
  "Logic": { bg: "rgba(167,139,250,0.18)", fg: "#a78bfa" },
  "Power": { bg: "rgba(248,113,113,0.18)", fg: "#f87171" }, // red
  "Sources": { bg: "rgba(74,222,128,0.18)", fg: "#4ade80" }, // green
  "Switches": { bg: "rgba(148,163,184,0.18)", fg: "#94a3b8" },
  "Connectors": { bg: "rgba(148,163,184,0.18)", fg: "#94a3b8" },
  "Sensors": { bg: "rgba(96,165,250,0.18)", fg: "#60a5fa" },
  "default": { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" },
};

function getColorForCategory(cat: string) {
  const first = cat.split("/")[0];
  const last = cat.split("/").slice(-1)[0];
  return CATEGORY_COLORS[last] ?? CATEGORY_COLORS[first] ?? CATEGORY_COLORS.default;
}

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const key = category.toLowerCase();
  let iconKey: CategoryIconKey = "misc";
  if (key.includes("resistor")) iconKey = "resistor";
  else if (key.includes("capacitor")) iconKey = "capacitor";
  else if (key.includes("inductor")) iconKey = "inductor";
  else if (key.includes("diode")) iconKey = "diode";
  else if (key.includes("transistor") && !key.includes("mos")) iconKey = "transistor";
  else if (key.includes("mosfet") || key.includes("mos")) iconKey = "mosfet";
  else if (key.includes("opamp") || key.includes("op-amp")) iconKey = "opamp";
  else if (key.includes("ic") || key.includes("logic") || key.includes("gate") || key.includes("74") || key.includes("40")) iconKey = "ic";
  else if (key.includes("power") || key.includes("regulator") || key.includes("supply")) iconKey = "power";
  else if (key.includes("ground") || key.includes("gnd")) iconKey = "ground";
  else if (key.includes("source") || key.includes("voltage") || key.includes("current")) iconKey = "source";
  else if (key.includes("switch") || key.includes("button") || key.includes("relay")) iconKey = "switch";
  else if (key.includes("connector") || key.includes("header") || key.includes("jack")) iconKey = "connector";
  else if (key.includes("sensor") || key.includes("ldr") || key.includes("thermistor")) iconKey = "sensor";

  const col = getColorForCategory(category);

  return (
    <span
      className="grid place-items-center rounded-[5px] shrink-0"
      style={{ width: size + 8, height: size + 8, background: col.bg, color: col.fg }}
    >
      <IconSvg type={iconKey} size={size} />
    </span>
  );
}

export function IconSvg({ type, size = 16 }: { type: CategoryIconKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (type) {
    case "resistor":
      return (
        <svg {...common}>
          <path d="M1 8 L3 8 L4 5 L6 11 L8 5 L10 11 L11 8 L15 8" />
        </svg>
      );
    case "capacitor":
      return (
        <svg {...common}>
          <path d="M6 2 L6 14 M10 2 L10 14 M1 8 L6 8 M10 8 L15 8" />
        </svg>
      );
    case "inductor":
      return (
        <svg {...common}>
          <path d="M1 8 L3 8 C3 5, 5 5, 5 8 C5 11, 7 11, 7 8 C7 5, 9 5, 9 8 C9 11, 11 11, 11 8 L11 8 L15 8" />
        </svg>
      );
    case "diode":
      return (
        <svg {...common}>
          <path d="M2 3 L2 13 L10 8 Z M10 3 L10 13 M1 8 L2 8 M10 8 L15 8" />
        </svg>
      );
    case "transistor":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" />
          <path d="M8 3 L8 8 L11 11 M8 8 L5 11" />
          <path d="M11 10.5 L12.5 11.5 L11.5 12.5" strokeWidth={1.2} />
        </svg>
      );
    case "mosfet":
      return (
        <svg {...common}>
          <path d="M2 3 L2 13 M6 3 L6 13 M2 5 L6 5 M2 8 L10 8 M10 3 L10 13 M10 8 L14 8" />
          <path d="M12 6 L14 8 L12 10" />
        </svg>
      );
    case "opamp":
      return (
        <svg {...common}>
          <path d="M2 3 L2 13 L13 8 Z" />
          <path d="M1 5 L2 5 M1 11 L2 11 M13 8 L15 8" />
        </svg>
      );
    case "ic":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1" />
          <path d="M3 5 L1.5 5 M3 8 L1.5 8 M3 11 L1.5 11 M13 5 L14.5 5 M13 8 L14.5 8 M13 11 L14.5 11" />
        </svg>
      );
    case "power":
      return (
        <svg {...common}>
          <path d="M9 2 L4 9 L8 9 L7 14 L12 7 L8 7 Z" />
        </svg>
      );
    case "ground":
      return (
        <svg {...common}>
          <path d="M8 2 L8 8 M4 8 L12 8 M6 11 L10 11 M7.5 14 L8.5 14" />
        </svg>
      );
    case "source":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" />
          <path d="M8 5 L8 11 M5 8 L11 8" />
        </svg>
      );
    case "switch":
      return (
        <svg {...common}>
          <path d="M2 8 L6 8 M10 8 L14 8" />
          <path d="M6 8 L10 4" />
          <circle cx="6" cy="8" r="1" fill="currentColor" />
          <circle cx="10" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case "connector":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="8" height="8" rx="1" />
          <circle cx="6" cy="6" r="0.8" fill="currentColor" />
          <circle cx="10" cy="6" r="0.8" fill="currentColor" />
          <circle cx="6" cy="10" r="0.8" fill="currentColor" />
          <circle cx="10" cy="10" r="0.8" fill="currentColor" />
        </svg>
      );
    case "sensor":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 2 L8 3.5 M8 12.5 L8 14 M2 8 L3.5 8 M12.5 8 L14 8 M3.5 3.5 L4.5 4.5 M11.5 11.5 L12.5 12.5 M12.5 3.5 L11.5 4.5 M4.5 11.5 L3.5 12.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="2" />
          <path d="M6 8 L10 8 M8 6 L8 10" />
        </svg>
      );
  }
}
