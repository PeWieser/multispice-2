# Responsive Webapp – Recherche & Plan (Ziel 2)

## Ist-Zustand

- Workbench: fixed `h-screen w-screen flex-col`, MenuBar top, ComponentStrip 32px, Canvas flex-1, Inspector absolute right 300px, BottomPanel 248px, StatusBar bottom
- Keine Media Queries, keine Touch-Handling für Pinch/Two-Finger, keine Mobile Breakpoints
- LibraryPalette floating, drag via PointerEvents – funktioniert auf Touch, aber klein
- Canvas: MouseEvents, Wheel Zoom, Space+Drag Pan – kein Touch
- Buttons: teilweise <44px, nicht ideal für Finger
- Text: 10-12px – auf Mobile zu klein
- Kein Portrait/Landscape Handling

## Recherche – Wie machen es andere?

### EasyEDA, Flux, Protoboard Designer, Figma, Excalidraw
- **Breakpoints**: 
  - Mobile <768px, Tablet 768-1024, Desktop >1024
  - Portrait vs Landscape via `orientation` Media Query
- **Layout Strategien**:
  - **Desktop**: 3-Spalten (Left Sidebar Library, Center Canvas, Right Inspector), Top Toolbar, Bottom Console
  - **Tablet Portrait**: Canvas full, Toolbar top collapsible, Bottom Sheet für Library/Inspector (drag up), Floating Action Button für Tools
  - **Tablet Landscape**: Ähnlich Desktop, aber Sidebar schmaler (56px Icons only), Inspector als Drawer von rechts
  - **Mobile Portrait**: 
    - Top: Hamburger + Search + Play/Pause
    - Canvas: full, mit Pinch Zoom, Two-Finger Pan, Long Press = Context Menu
    - Bottom: Toolbar als 44px hohe Scrollable Row (Tools: Select, Wire, Probe, etc)
    - Library: Bottom Sheet (80% Höhe), Inspector: Bottom Sheet oder Fullscreen Modal
    - StatusBar: nur essenziell (Zoom, Cursor) – rest in Menü
  - **Mobile Landscape**: 
    - Canvas nimmt 70%, rechte Seite 30% für Inspector (collapsible)
    - Toolbar links vertikal (wie Figma mobile)
- **Touch Interactions**:
  - Pinch Zoom: 2 Finger Abstand → Zoom zum Mittelpunkt
  - Pan: 1 Finger drag wenn Tool=pan oder 2 Finger drag
  - Tap: Select, Double Tap: Inspector öffnen
  - Long Press (500ms): Context Menu
  - Drag Part: Long Press + Drag
  - Wire: Tap Start Pin, Tap End Pin (statt Drag – besser für Touch)
  - Undo: 2-Finger Tap oder Shake? Besser Button
- **Human Design – Touch**:
  - Hit Targets min 44x44px (Apple HIG), 48x48 (Material)
  - Kein Hover – alles muss auch ohne Hover funktionieren (Long Press statt Hover Tooltip)
  - Kein Verschwinden bei leicht daneben: Context Menu bleibt bis explizit geschlossen, nicht bei MouseLeave
  - Lesbarkeit: 14px min auf Mobile, 12px für sekundär
  - Kein Flackern: Canvas nicht bei jedem Touch neu rendern, nur bei PointerMove mit Throttle 16ms

## Geplanter Umbau – Responsive V2

### 1. CSS & Layout

**Tokens in `globals.css`:**
```css
:root {
  --sidebar-w: 300px;
  --toolbar-h: 32px;
  --bottom-h: 248px;
}
@media (max-width: 1024px) {
  :root { --sidebar-w: 260px; --bottom-h: 200px; }
}
@media (max-width: 768px) {
  :root { --sidebar-w: 100vw; --toolbar-h: 44px; --bottom-h: 50vh; }
}
```

**Workbench.tsx neu:**
- Nutze `useMediaQuery` Hook für Breakpoints
- Desktop: wie jetzt, aber Inspector nicht absolute, sondern flex `w-[300px]`
- Tablet: Inspector als Drawer (Slide von rechts), Library als Bottom Sheet
- Mobile Portrait:
  - `<div className="flex flex-col h-dvh">` – nutze `dvh` statt `vh` für Browser UI
  - TopBar: Hamburger (Menü Drawer), Title, Search Icon, Play
  - Canvas: `flex-1 min-h-0`
  - BottomToolbar: `h-[56px] overflow-x-auto` mit großen Buttons (44px)
  - BottomSheet für Library/Inspector: `transform translate-y` mit Drag Handle
- Mobile Landscape:
  - Row Layout: Left Toolbar vertical 56px, Canvas flex-1, Right Inspector 40% collapsible

**2. Komponenten Anpassungen**

**MenuBar:**
- Desktop: wie jetzt (6 Menüs)
- Tablet/Mobile: Hamburger Icon → Drawer mit Menü Items, Suche, Simulation Controls

**ComponentStrip:**
- Desktop: horizontal 32px
- Mobile: wird Teil der BottomToolbar, horizontal scrollable, Buttons 44px, Icons größer

**LibraryPalette:**
- Desktop: floating wie jetzt
- Tablet: Bottom Sheet 70% Höhe, Drag Handle oben, Close via Swipe Down
- Mobile: Fullscreen Modal mit Search oben, List darunter

**Inspector:**
- Desktop: Right Sidebar
- Tablet: Drawer von rechts, 80% Breite, Overlay
- Mobile: Bottom Sheet 60% Höhe, oder Fullscreen bei Probe Edit

**BottomPanel:**
- Desktop: 248px Höhe
- Mobile: als Tab Bar über BottomToolbar, Höhe 40% und collapsible

**StatusBar:**
- Desktop: alle Infos
- Mobile: nur Zoom + Cursor + DRC, rest in Menü

**3. Canvas Touch Handling**

Erweitere `Canvas.tsx`:

```ts
// Pinch Zoom
let lastDist = 0;
onTouchStart: if 2 touches → calc dist, midpoint
onTouchMove: if 2 touches → zoom = dist/lastDist, pan to midpoint
// Pan
if 1 touch && tool===pan → pan
// Tap vs Drag
tapThreshold 10px, 300ms → Select
longPress 500ms → ContextMenu
// Wire Tool auf Touch: Tap statt Drag
// Double Tap → Inspector
```

- Nutze `pointerEvents` statt `mouseEvents` wo möglich (bereits teilweise)
- Throttle `pointermove` auf 16ms (60fps) für Performance
- Verhindere `touchmove` default (prevent scroll) wenn auf Canvas

**4. Human Design – Anti-Nervig**

- **Kein Verschwinden bei leicht daneben**: 
  - ContextMenu: bleibt bis Esc/Outside Tap, nicht bei MouseLeave
  - Library Bottom Sheet: hat Drag Handle, schließt nur bei Swipe Down >100px oder Close Button, nicht bei leicht daneben tippen
  - Inspector: bleibt offen bis explizit geschlossen
- **Hit Targets**: 
  - Alle Buttons min 44x44 auf Mobile (via `min-h-[44px] min-w-[44px]`)
  - Probe Hit Radius von 14 auf 24 auf Mobile erhöhen
  - Wire Hit Radius von 6 auf 12 auf Mobile
- **Lesbarkeit**:
  - Auf Mobile: Text 14px base, 12px muted, Mono 13px
  - Canvas Labels: auf Mobile 20% größer (zoom factor)
  - Kein Flackern: `will-change: transform` für Canvas, `transform` statt `left/top` für Drag
- **Feedback**:
  - Touch: kurzer Haptic Feedback via `navigator.vibrate(10)` bei Select/Place
  - Visuell: Pulse Ring bei Tap, wie bei Maus

**5. Portrait vs Landscape Nutzung**

- **Portrait**: 
  - Nutzer hält Tablet/Phone hoch, will schnell was checken, nicht lange editieren
  - Fokus: Canvas groß, Tools unten leicht erreichbar, Library als Bottom Sheet
  - Weniger Panels gleichzeitig – nur eins offen
- **Landscape**: 
  - Nutzer hat mehr Breite, will editieren wie Desktop
  - Fokus: Sidebar + Canvas + Inspector nebeneinander, aber schmaler
  - Toolbar vertikal links (wie in Figma) spart Höhe

**6. Performance**

- Auf Mobile: weniger gleichzeitige Canvas Layers, `devicePixelRatio` auf max 2 begrenzen (statt 3)
- `requestAnimationFrame` für Canvas Render, nicht bei jedem Touch Event
- Lazy Load: Library Icons erst rendern wenn sichtbar (IntersectionObserver)

### Offene Fragen für dich

**Q1 – Mobile Priorität:**
- A) Mobile = nur Viewer + kleine Edits (wie Protoboard – Fokus auf Anschauen, nicht komplexes Editieren)
- B) Mobile = vollwertiger Editor (wie Figma – alles geht, aber UI angepasst)
- C) Hybrid: Portrait = Viewer, Landscape = Editor

**Q2 – Bottom Sheet vs Drawer:**
- A) Library und Inspector beide als Bottom Sheet (wie Google Maps – vertraut)
- B) Library Bottom Sheet, Inspector Right Drawer (wie Figma mobile)
- C) Beides Fullscreen Modal (einfach, aber bricht Flow)

**Q3 – Touch Wire Drawing:**
- A) Tap Start Pin → Tap End Pin (einfach, kein Drag)
- B) Long Press Pin + Drag to End Pin (wie Desktop, aber mit Finger)
- C) Beides: Tap für kurze Wires, Drag für lange (mit Auto-Scroll)

**Q4 – Extra Mobile Features:**
- A) Keine, nur Responsive
- B) + Shake to Undo, 2-Finger Tap Undo, Pinch to Fit View
- C) + On-Screen Joystick für Pan (für Einhand-Bedienung)

---

**Mein Vorschlag:** Q1=B (vollwertig, aber smart), Q2=A (Bottom Sheet vertraut), Q3=A (Tap-Tap), Q4=B (Shake/2-Finger ist cool, Joystick zu viel).

