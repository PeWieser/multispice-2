export type ModeId = 'autoVoltage' | 'off' | 'acVoltage' | 'dcVoltage' | 'millivolts' | 'resistance' | 'continuity';
export type RedJack = 'V';
export type NodeId = string;
export type CircuitKind = 'dc' | 'ac' | 'resistor' | 'continuity';
export type MinMaxMode = 'off' | 'max' | 'min' | 'avg';
export type VoltageKind = 'AC' | 'DC';

export interface ModeDefinition {
  id: ModeId;
  label: string;
  symbol: string;
  angle: number;
}

// The front panel follows the seven positions and two sockets of the reference.
export const MODES: ModeDefinition[] = [
  { id: 'autoVoltage', label: 'Auto-V / LoZ', symbol: 'AUTO-V', angle: -24 },
  { id: 'off', label: 'Ausgeschaltet', symbol: 'OFF', angle: 0 },
  { id: 'acVoltage', label: 'Wechselspannung', symbol: 'V', angle: 24 },
  { id: 'dcVoltage', label: 'Gleichspannung', symbol: 'V', angle: 46 },
  { id: 'millivolts', label: 'Millivolt AC / DC', symbol: 'mV', angle: 70 },
  { id: 'resistance', label: 'Widerstand', symbol: '\u03a9', angle: 92 },
  { id: 'continuity', label: 'Durchgang', symbol: 'continuity', angle: 114 },
];

export const CIRCUITS: { id: CircuitKind; label: string; mode: ModeId }[] = [
  { id: 'dc', label: 'Gleichspannungsquelle', mode: 'dcVoltage' },
  { id: 'ac', label: 'Wechselspannungsquelle', mode: 'acVoltage' },
  { id: 'resistor', label: 'Widerstand', mode: 'resistance' },
  { id: 'continuity', label: 'Leitungsverbindung', mode: 'continuity' },
];

export interface CircuitState {
  kind: CircuitKind;
  enabled: boolean;
  voltageDC: number;
  voltageAC: number;
  sourceResistance: number;
  resistance: number;
  continuityResistance: number;
  closed: boolean;
  componentPowered: boolean;
}

export const DEFAULT_CIRCUIT: CircuitState = {
  kind: 'dc', enabled: true, voltageDC: 12, voltageAC: 230,
  sourceResistance: 0, resistance: 1000, continuityResistance: 0.4,
  closed: true, componentPowered: false,
};

export interface Connections {
  blackConnected: boolean;
  redJack: RedJack | null;
  blackNode: NodeId | null;
  redNode: NodeId | null;
}

export const DEFAULT_CONNECTIONS: Connections = {
  blackConnected: true, redJack: 'V', blackNode: 'negative', redNode: 'positive',
};

export interface MeasurementRequest {
  mode: ModeId;
  connections: Connections;
  secondary: boolean;
  inputImpedance: number;
}

export type MeasurementStatus = 'ok' | 'off' | 'open' | 'live';
export interface MeasurementSample {
  value: number | null;
  unit: 'V' | 'ohm';
  status: MeasurementStatus;
  message: string;
  voltageKind?: VoltageKind;
}

/** The simulator boundary; sample() returns an SI snapshot without side effects. */
export interface MeasurementAdapter {
  id: string;
  configure?: (request: MeasurementRequest) => void;
  sample: (request: MeasurementRequest) => MeasurementSample;
  subscribe?: (onChange: () => void) => () => void;
}

function baseUnit(mode: ModeId): MeasurementSample['unit'] {
  return mode === 'resistance' || mode === 'continuity' ? 'ohm' : 'V';
}

function result(request: MeasurementRequest, value: number | null, status: MeasurementStatus = 'ok', message = '', voltageKind?: VoltageKind): MeasurementSample {
  return { value, unit: baseUnit(request.mode), status, message, voltageKind };
}

export function supportsSecondary(mode: ModeId) { return mode === 'millivolts'; }
export function supportsManualRange(mode: ModeId) { return !['off', 'autoVoltage', 'continuity'].includes(mode); }
export function supportsMinMax(mode: ModeId) { return !['off', 'autoVoltage', 'continuity'].includes(mode); }
export function secondaryLabel(secondary: boolean) { return secondary ? 'Millivolt DC' : 'Millivolt AC'; }

export function createDemoAdapter(circuit: CircuitState): MeasurementAdapter {
  return {
    id: 'voltwerk-demo',
    sample(request) {
      const { mode, connections, secondary, inputImpedance } = request;
      const sameNode = connections.redNode === connections.blackNode;
      const sign = connections.redNode === 'positive' ? 1 : -1;
      const isSource = circuit.kind === 'dc' || circuit.kind === 'ac';
      const dc = circuit.kind === 'dc' ? (circuit.enabled ? circuit.voltageDC : 0) : circuit.componentPowered ? 5 : 0;
      const ac = circuit.kind === 'ac' && circuit.enabled ? circuit.voltageAC : 0;
      const loadFactor = isSource ? inputImpedance / (inputImpedance + circuit.sourceResistance) : 1;

      if ((mode === 'resistance' || mode === 'continuity') && !sameNode && (dc !== 0 || ac !== 0)) {
        return result(request, null, 'live', 'Spannung erkannt. Die Quelle vor einer Widerstands- oder Durchgangsmessung ausschalten.');
      }

      switch (mode) {
        case 'off': return result(request, null, 'off', 'Multimeter ausgeschaltet.');
        case 'autoVoltage': {
          const voltageKind: VoltageKind = circuit.kind === 'ac' ? 'AC' : 'DC';
          return result(request, sameNode ? 0 : (voltageKind === 'AC' ? ac : sign * dc) * loadFactor, 'ok', '', voltageKind);
        }
        case 'dcVoltage': return result(request, sameNode ? 0 : sign * dc * loadFactor, 'ok', '', 'DC');
        case 'acVoltage': return result(request, sameNode ? 0 : ac * loadFactor, 'ok', '', 'AC');
        case 'millivolts':
          // The reference measures AC+DC millivolts; its yellow key selects DC.
          return result(request, sameNode ? 0 : (secondary ? sign * dc : Math.hypot(ac, dc)) * loadFactor, 'ok', '', secondary ? 'DC' : 'AC');
        case 'resistance':
        case 'continuity': {
          if (sameNode) return result(request, 0);
          const resistance = circuit.kind === 'resistor' ? circuit.resistance
            : circuit.kind === 'continuity' && circuit.closed ? circuit.continuityResistance
            : isSource && !circuit.enabled ? circuit.sourceResistance : null;
          return resistance === null
            ? result(request, null, 'open', 'Offener Messpfad. Beide Messspitzen mit einem leitenden Bauteil verbinden.')
            : result(request, resistance);
        }
      }
    },
  };
}

export function readMeasurement(request: MeasurementRequest, adapter: MeasurementAdapter): MeasurementSample {
  if (request.mode === 'off') return result(request, null, 'off', 'Multimeter ausgeschaltet.');
  const { connections } = request;
  if (!connections.blackConnected || !connections.redJack || !connections.redNode || !connections.blackNode) {
    return result(request, null, 'open', 'Schwarze Leitung in COM, rote Leitung in + stecken und beide Messspitzen verbinden.');
  }
  let sample: MeasurementSample;
  try { sample = adapter.sample(request); }
  catch { return result(request, null, 'open', 'Simulationsdaten sind derzeit nicht verf\u00fcgbar.'); }
  if (!sample || sample.unit !== baseUnit(request.mode)) {
    return result(request, null, 'open', 'Warten auf passende Messdaten der Simulation.');
  }
  if (sample.status === 'ok' && (sample.value === null || !Number.isFinite(sample.value))) {
    return result(request, null, 'open', 'Noch kein g\u00fcltiger Messwert verf\u00fcgbar.');
  }
  if (sample.status === 'ok' && request.mode === 'autoVoltage' && !['AC', 'DC'].includes(sample.voltageKind ?? '')) {
    return result(request, null, 'open', 'Warten auf AC-/DC-Erkennung der Simulation.');
  }
  return sample;
}

export interface RangeDefinition { max: number; factor: number; decimals: number; unit: string; }
const range = (max: number, factor: number, decimals: number, unit: string): RangeDefinition => ({ max, factor, decimals, unit });

export function getRanges(mode: ModeId): RangeDefinition[] {
  switch (mode) {
    case 'dcVoltage':
    case 'acVoltage': return [range(6, 1, 3, 'V'), range(60, 1, 2, 'V'), range(600, 1, 1, 'V')];
    case 'autoVoltage': return [range(600, 1, 1, 'V')];
    case 'millivolts': return [range(0.6, 1000, 1, 'mV')];
    case 'resistance': return [range(600, 1, 1, '\u03a9'), range(6000, .001, 3, 'k\u03a9'), range(60000, .001, 2, 'k\u03a9'), range(600000, .001, 1, 'k\u03a9'), range(6e6, 1e-6, 3, 'M\u03a9'), range(40e6, 1e-6, 2, 'M\u03a9')];
    case 'continuity': return [range(600, 1, 1, '\u03a9')];
    default: return [range(600, 1, 1, 'V')];
  }
}

export function autoRangeIndex(value: number | null, ranges: RangeDefinition[]) {
  const found = ranges.findIndex((item) => Math.abs(value ?? 0) < item.max);
  return found === -1 ? ranges.length - 1 : found;
}

export interface DisplayReading {
  text: string; unit: string; range: RangeDefinition; rangeIndex: number;
  fraction: number; overloaded: boolean;
}

export function formatReading(sample: MeasurementSample, ranges: RangeDefinition[], manualRange: number | null): DisplayReading {
  const index = manualRange === null ? autoRangeIndex(sample.value, ranges) : Math.max(0, Math.min(manualRange, ranges.length - 1));
  const selected = ranges[index];
  const overloaded = sample.status === 'ok' && sample.value !== null && Math.abs(sample.value) > selected.max;
  const errors: Record<MeasurementStatus, string> = { ok: '', off: '', open: 'OL', live: 'Err' };
  let text = overloaded ? 'OL' : sample.status === 'ok' && sample.value !== null
    ? (sample.value * selected.factor).toFixed(selected.decimals) : errors[sample.status];
  if (Number(text) === 0 && text.startsWith('-')) text = text.slice(1);
  return { text, unit: selected.unit, range: selected, rangeIndex: index,
    fraction: sample.value === null || sample.status !== 'ok' ? 0 : Math.min(Math.abs(sample.value) / selected.max, 1), overloaded };
}

export function rangeLabel(item: RangeDefinition) {
  return `${(item.max * item.factor).toLocaleString('de-DE', { maximumFractionDigits: 3 })} ${item.unit}`;
}

export function modeLabel(mode: ModeId, secondary: boolean) {
  return mode === 'millivolts' ? secondaryLabel(secondary) : MODES.find((item) => item.id === mode)?.label ?? '';
}
