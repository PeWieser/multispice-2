
import { GRID } from "@/lib/schematic/model";
import { useEditor } from "@/state/editor";

export interface Pt { x: number; y: number; }

let wireIdSeq = 0;
export function makeWireId(): string {
  wireIdSeq += 1;
  return `w_${Date.now().toString(36)}_${wireIdSeq.toString(36)}`;
}

export function polyLength(pts: Pt[]): number {
  let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return l;
}
export function pointAtLength(pts: Pt[], len: number): Pt | null {
  if (!pts.length) return null; if (len <= 0) return pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i-1], b = pts[i]; const seg = Math.hypot(b.x-a.x, b.y-a.y);
    if (acc+seg >= len) { const t = (len-acc)/Math.max(seg,1e-9); return { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t }; }
    acc+=seg;
  }
  return pts[pts.length-1];
}
export function tangentAtLength(pts: Pt[], len: number): Pt | null {
  if (pts.length<2) return null; let acc=0;
  for (let i=1;i<pts.length;i++) {
    const a=pts[i-1], b=pts[i]; const seg=Math.hypot(b.x-a.x,b.y-a.y);
    if (acc+seg>=len) return { x:b.x-a.x, y:b.y-a.y };
    acc+=seg;
  }
  const a=pts[pts.length-2], b=pts[pts.length-1]; return { x:b.x-a.x, y:b.y-a.y };
}
export function roundRect(ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

export function hexAlpha(hex:string,a:number):string { const h=hex.replace("#",""); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; }


export function snap(p: Pt) {
  const { snap: doSnap } = useEditor.getState();
  if (!doSnap) return p;
  return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
}

export function toScreen(p: Pt) {
  const { view } = useEditor.getState();
  return { x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom };
}
