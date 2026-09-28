import type { ReactNode } from "react";

interface PushButtonProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string; // color when lit / active
  size?: "sm" | "md";
  led?: boolean;
  title?: string;
}

export function PushButton({
  children,
  onClick,
  active = false,
  activeColor = "#7ddc4b",
  size = "md",
  led = false,
  title,
}: PushButtonProps) {
  const pad = size === "sm" ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]";
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative flex items-center justify-center gap-1 rounded-[5px] font-semibold uppercase tracking-wide transition-all active:translate-y-[1px] ${pad}`}
      style={{
        color: active ? "#12200a" : "#e8e9ec",
        background: active
          ? `linear-gradient(#e6f7d6, ${activeColor})`
          : "linear-gradient(#5a5d63, #3b3d42 55%, #2c2e32)",
        boxShadow: active
          ? `0 0 10px ${activeColor}aa, inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.5)`
          : "inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -2px 3px rgba(0,0,0,0.5), 0 2px 3px rgba(0,0,0,0.55)",
        border: "1px solid rgba(0,0,0,0.5)",
      }}
    >
      {led && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: active ? activeColor : "#3a3a3a",
            boxShadow: active ? `0 0 6px ${activeColor}` : "none",
          }}
        />
      )}
      {children}
    </button>
  );
}
