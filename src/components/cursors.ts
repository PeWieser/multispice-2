/**
 * W65 (Runde 25) / W89 (Runde 29): Zeiger, die zur Tätigkeit passen.
 *
 * Ein Fadenkreuz sagt nichts darüber aus, was gerade passiert. Beim Zeichnen
 * eines Netzes zeigt deshalb ein Stift (Spitze am Anschlusspunkt), wo die
 * Leitung entsteht; beim Löschen zeigt ein Radiergummi (Reibekante am
 * Zeigerpunkt), was entfernt wird; wer eine Messleitung in der Hand hält,
 * sieht einen Bananenstecker.
 */

/** Stift – beim Netz zeichnen (Spitze auf 3/27, also am Zeiger). */
export const PEN_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    '<path d="M3 27 L12.5 17.5" stroke="#f8fafc" stroke-width="1.2" opacity="0.85"/>' +
    '<path d="M3 27 l1.1-5.6 4.5 4.5z" fill="#e2e8f0" stroke="#0f172a" stroke-width="1" stroke-linejoin="round"/>' +
    '<path d="M13.6 16.4 l8.6-8.6 4.4 4.4-8.6 8.6z" fill="#38bdf8" stroke="#0f172a" stroke-width="1" stroke-linejoin="round"/>' +
    '<path d="M22.2 7.8 l1.6-1.6 4.4 4.4-1.6 1.6z" fill="#0f172a"/>' +
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 3 27, default`;
})();

/** Radiergummi – beim Löschen-Werkzeug (vordere Radierkante auf 5/25). */
export const ERASER_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    '<g transform="rotate(-45 15 15)">' +
    '<rect x="5" y="10" width="11" height="10" rx="2" fill="#f472b6" stroke="#0f172a" stroke-width="1.2"/>' +
    '<rect x="14" y="10" width="10" height="10" rx="1.8" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2"/>' +
    '<line x1="14" y1="10.5" x2="14" y2="19.5" stroke="#0f172a" stroke-width="1.1"/>' +
    '</g>' +
    '<circle cx="5" cy="25" r="1.6" fill="#f43f5e" stroke="#ffffff" stroke-width="0.8"/>' +
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 5 25, pointer`;
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
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 8 26, default`;
})();
