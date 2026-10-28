/**
 * Zeiger, die zur Tätigkeit passen (W65/W89, Detailschliff 2026-10).
 *
 * Ein Fadenkreuz sagt nichts darüber aus, was gerade passiert. Beim Zeichnen
 * eines Netzes zeigt deshalb ein technischer Stift (Spitze am Anschlusspunkt),
 * wo die Leitung entsteht; beim Löschen zeigt ein Radiergummi (Vorderkante am
 * Zeigerpunkt), was entfernt wird; wer eine Messleitung in der Hand hält,
 * sieht einen Bananenstecker. Alle mit hellem Saum, damit sie auf hellem wie
 * dunklem Grund lesbar bleiben.
 */

/** Technischer Stift – beim Netz zeichnen (Spitze auf 5/27, also am Zeiger). */
export const PEN_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    // weicher Schatten
    '<g opacity="0.30" transform="translate(0.9 0.9)">' +
    '<polygon points="8.2,23.8 13,22.3 9.7,19" fill="#000000"/>' +
    '<polygon points="9.7,19 17.5,9.8 20,7.4 24.7,12 22.2,14.5 13,22.3" fill="#000000"/>' +
    "</g>" +
    // heller Saum (Lesbarkeit auf dunklem Grund)
    '<g fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round" opacity="0.9">' +
    '<polygon points="8.2,23.8 13,22.3 9.7,19"/>' +
    '<polygon points="9.7,19 17.5,9.8 20,7.4 24.7,12 22.2,14.5 13,22.3"/>' +
    "</g>" +
    // Metallkonus + Nadel
    '<polygon points="8.2,23.8 13,22.3 9.7,19" fill="#cbd5e1" stroke="#0f172a" stroke-width="1" stroke-linejoin="round"/>' +
    '<line x1="5" y1="27" x2="8.6" y2="23.4" stroke="#0f172a" stroke-width="1.7" stroke-linecap="round"/>' +
    // Schafftiefenschwarz mit Akzentrille
    '<polygon points="9.7,19 17.5,9.8 20,7.4 24.7,12 22.2,14.5 13,22.3" fill="#1e293b" stroke="#0f172a" stroke-width="1" stroke-linejoin="round"/>' +
    '<line x1="11.2" y1="19.1" x2="18.3" y2="12" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round"/>' +
    '<line x1="21.1" y1="10.8" x2="23.6" y2="13.3" stroke="#64748b" stroke-width="1.6" stroke-linecap="round"/>' +
    "</svg>";
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 5 27, default`;
})();

/** Radiergummi – beim Löschen-Werkzeug (Vorderkante auf 6/28). */
export const ERASER_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<g transform="rotate(-12 13 21)">' +
    // heller Saum
    '<rect x="5" y="16" width="18" height="10" rx="2" fill="none" stroke="#f8fafc" stroke-width="3" opacity="0.9"/>' +
    // weicher Schatten
    '<rect x="5.9" y="16.9" width="18" height="10" rx="2" fill="#000000" opacity="0.28"/>' +
    // Körper: Elfenbein mit Manschette in Blau
    '<rect x="5" y="16" width="18" height="10" rx="2" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.2"/>' +
    '<path d="M16 16.6 h4.6 a1.6 1.6 0 0 1 1.6 1.6 v5.6 a1.6 1.6 0 0 1 -1.6 1.6 H16 z" fill="#2563eb"/>' +
    '<line x1="16" y1="16.6" x2="16" y2="25.4" stroke="#0f172a" stroke-width="1"/>' +
    '<line x1="6.6" y1="18.6" x2="14.4" y2="18.6" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>' +
    '<line x1="6.6" y1="24" x2="14.4" y2="24" stroke="#cbd5e1" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="17.6" y1="18.6" x2="20.4" y2="18.6" stroke="#bfdbfe" stroke-width="1.2" stroke-linecap="round"/>' +
    "</g>" +
    "</svg>";
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 6 28, pointer`;
})();

/** Bananenstecker – wenn eine Messleitung aufgenommen ist und ein Ziel sucht. */
export const PLUG_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    '<path d="M6 6 L14 14" stroke="#f8fafc" stroke-width="1.2" opacity="0.85"/>' +
    '<path d="M4.6 4.6 L9.6 9.6" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M4.6 4.6 L9.6 9.6" stroke="#a78bfa" stroke-width="3.4" stroke-linecap="round"/>' +
    '<rect x="9" y="9" width="6" height="6" rx="1.4" transform="rotate(45 12 12)" fill="#e2e8f0" stroke="#0f172a" stroke-width="1"/>' +
    '<rect x="15.2" y="15.2" width="12" height="5" rx="2.5" transform="rotate(45 21.2 17.7)" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>' +
    "</svg>";
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 8 26, default`;
})();
