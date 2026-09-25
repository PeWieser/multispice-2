// Curated datasheet links for top ~80 parts – direct manufacturer links where possible
// Fallback: AllDatasheet search

export interface DatasheetInfo {
  url: string;
  manufacturer: string;
  direct?: boolean; // true = direct PDF, false = search page
}

export const DATASHEETS: Record<string, DatasheetInfo> = {
  // 555
  ne555: { url: "https://www.ti.com/lit/ds/symlink/ne555.pdf", manufacturer: "TI", direct: true },
  lm555: { url: "https://www.ti.com/lit/ds/symlink/lm555.pdf", manufacturer: "TI", direct: true },
  // OpAmps
  opamp_lm741: { url: "https://www.ti.com/lit/ds/symlink/lm741.pdf", manufacturer: "TI", direct: true },
  opamp_lm358: { url: "https://www.ti.com/lit/ds/symlink/lm358.pdf", manufacturer: "TI", direct: true },
  opamp_tl072: { url: "https://www.ti.com/lit/ds/symlink/tl072.pdf", manufacturer: "TI", direct: true },
  opamp_ideal: { url: "https://www.analog.com/en/design-notes.html", manufacturer: "Generic", direct: false },
  // Transistors
  npn_2n3904: { url: "https://www.onsemi.com/pdf/datasheet/2n3903-d.pdf", manufacturer: "ON Semi", direct: true },
  pnp_2n3906: { url: "https://www.onsemi.com/pdf/datasheet/2n3906-d.pdf", manufacturer: "ON Semi", direct: true },
  npn_2n2222: { url: "https://www.onsemi.com/pdf/datasheet/p2n2222a-d.pdf", manufacturer: "ON Semi", direct: true },
  npn_bc547: { url: "https://www.onsemi.com/pdf/datasheet/bc546-d.pdf", manufacturer: "ON Semi", direct: true },
  pnp_bc557: { url: "https://www.onsemi.com/pdf/datasheet/bc556-d.pdf", manufacturer: "ON Semi", direct: true },
  // MOSFETs
  nmos: { url: "https://www.infineon.com/cms/en/product/power/mosfet/", manufacturer: "Infineon", direct: false },
  pmos: { url: "https://www.infineon.com/cms/en/product/power/mosfet/p-channel/", manufacturer: "Infineon", direct: false },
  nmos_irf540: { url: "https://www.vishay.com/docs/91021/irf540.pdf", manufacturer: "Vishay", direct: true },
  nmos_2n7000: { url: "https://www.onsemi.com/pdf/datasheet/2n7000-d.pdf", manufacturer: "ON Semi", direct: true },
  // Diodes
  diode_1n4148: { url: "https://www.vishay.com/docs/81857/1n4148.pdf", manufacturer: "Vishay", direct: true },
  diode_1n4007: { url: "https://www.vishay.com/docs/88503/1n4001.pdf", manufacturer: "Vishay", direct: true },
  zener_5v1: { url: "https://www.vishay.com/docs/85816/bzx55.pdf", manufacturer: "Vishay", direct: true },
  schottky_1n5819: { url: "https://www.vishay.com/docs/88526/1n5817.pdf", manufacturer: "Vishay", direct: true },
  led: { url: "https://www.cree.com/led-components", manufacturer: "Cree", direct: false },
  // Regulators
  regulator_7805: { url: "https://www.ti.com/lit/ds/symlink/lm7805.pdf", manufacturer: "TI", direct: true },
  regulator_7812: { url: "https://www.ti.com/lit/ds/symlink/lm7812.pdf", manufacturer: "TI", direct: true },
  regulator_lm317: { url: "https://www.ti.com/lit/ds/symlink/lm317.pdf", manufacturer: "TI", direct: true },
  // Logic
  logic_and: { url: "https://www.ti.com/lit/ds/symlink/sn74hc08.pdf", manufacturer: "TI", direct: true },
  logic_or: { url: "https://www.ti.com/lit/ds/symlink/sn74hc32.pdf", manufacturer: "TI", direct: true },
  logic_not: { url: "https://www.ti.com/lit/ds/symlink/sn74hc04.pdf", manufacturer: "TI", direct: true },
  cd4001: { url: "https://www.ti.com/lit/ds/symlink/cd4001b.pdf", manufacturer: "TI", direct: true },
  cd4011: { url: "https://www.ti.com/lit/ds/symlink/cd4011b.pdf", manufacturer: "TI", direct: true },
  "74hc00": { url: "https://www.ti.com/lit/ds/symlink/sn74hc00.pdf", manufacturer: "TI", direct: true },
  "74hc04": { url: "https://www.ti.com/lit/ds/symlink/sn74hc04.pdf", manufacturer: "TI", direct: true },
  // MCU
  mcu_arduino: { url: "https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf", manufacturer: "Arduino", direct: true },
  // Passives are generic – no datasheet
};

export function getDatasheet(partId: string): DatasheetInfo | null {
  if (DATASHEETS[partId]) return DATASHEETS[partId];
  // try lowercased
  const lower = partId.toLowerCase();
  if (DATASHEETS[lower]) return DATASHEETS[lower];
  return null;
}

export function getDatasheetSearchUrl(partId: string, partName?: string): string {
  const q = encodeURIComponent(partName ? `${partName} ${partId}` : partId);
  // User wants top 80 direct, rest to alldatasheet – we implement fallback to alldatasheet
  return `https://www.alldatasheet.com/view.jsp?Searchword=${encodeURIComponent(partId)}`;
}

export function getOctopartUrl(partId: string): string {
  return `https://octopart.com/search?q=${encodeURIComponent(partId)}&currency=EUR&specs=0`;
}
