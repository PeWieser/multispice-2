import type { KeyboardEvent } from 'react';
import type { CircuitState, NodeId } from '../lib/multimeter';

const names: Record<CircuitState['kind'], string> = { dc: 'DC-QUELLE', ac: 'AC-QUELLE', resistor: 'WIDERSTAND', continuity: 'VERBINDUNG' };

function boardValue(circuit: CircuitState) {
  if (circuit.kind === 'resistor') {
    const factor = circuit.resistance >= 1e6 ? 1e-6 : circuit.resistance >= 1000 ? .001 : 1;
    return `${(circuit.resistance * factor).toLocaleString('de-DE', { maximumFractionDigits: 3 })} ${factor === 1e-6 ? 'M' : factor === .001 ? 'k' : ''}\u03a9`;
  }
  if (circuit.kind === 'continuity') return circuit.closed ? `${circuit.continuityResistance.toLocaleString('de-DE')} \u03a9` : 'OFFEN';
  const voltage = !circuit.enabled ? 0 : circuit.kind === 'dc' ? circuit.voltageDC : circuit.voltageAC;
  return `${(Math.abs(voltage) > 0 && Math.abs(voltage) < 1 ? voltage * 1000 : voltage).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${Math.abs(voltage) > 0 && Math.abs(voltage) < 1 ? 'mV' : 'V'}`;
}

export default function TestCircuit({ circuit, onNode, activeLead }: { circuit: CircuitState; onNode: (node: NodeId) => void; activeLead: 'red' | 'black' }) {
  const component = circuit.kind === 'resistor' || circuit.kind === 'continuity';
  return <g className="test-circuit" key={circuit.kind}>
    <g filter="url(#boardShadow)"><rect x="519" y="194" width="173" height="154" rx="10" fill="#c7cbc0" /><rect x="519" y="190" width="173" height="153" rx="10" fill="url(#board)" stroke="#d2d6cb" strokeWidth="1.1" /><path d="M531 194H680" stroke="white" strokeWidth="1.7" strokeLinecap="round" /></g>
    {[533, 678].map((x) => <g key={x}><circle cx={x} cy="205" r="3" fill="#dadcd3" stroke="#b7bdb0" strokeWidth=".7" /><path d={`M${x - 1.5} 205h3`} stroke="#939c8a" strokeWidth=".8" /></g>)}
    <text x="605" y="218" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="9.1" letterSpacing="1.2" fill="#68745c" fontWeight="600">{names[circuit.kind]}</text>
    <text x="605" y="252" textAnchor="middle" fontFamily="'Courier New', monospace" fontSize={boardValue(circuit).length > 10 ? 18 : 23} fontWeight="600" fill="#4c5742">{boardValue(circuit)}</text>
    <g transform="translate(605,280)" fill="none" stroke="#8d9782" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {circuit.kind === 'dc' && <><path d="M-28 0h20M8 0h20M-8-10v20M-2-6V6M4-10v20M9-6V6" /><path d="M-28 0v14h-22m78-14v14h22" strokeOpacity=".5" /></>}
      {circuit.kind === 'ac' && <><circle r="13" /><path d="M-7 0q3-10 7 0t7 0M-28 0h15m26 0h15" /></>}
      {circuit.kind === 'resistor' && <><path d="M-31 0h16m30 0h16" /><rect x="-15" y="-6" width="30" height="12" rx="1" /></>}
      {circuit.kind === 'continuity' && <><circle cx="-14" r="2" /><circle cx="14" r="2" /><path d={circuit.closed ? 'M-28 0h12m4 0h24m4 0h12' : 'M-28 0h12m4-1 23-13m5 14h12'} /></>}
    </g>
    {(['negative', 'positive'] as const).map((node, index) => {
      const label = component ? index === 0 ? 'B' : 'A' : index === 0 ? '\u2212' : '+';
      const action = () => onNode(node);
      const onKey = (event: KeyboardEvent<SVGGElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) action(); } };
      return <g key={node} transform={`translate(${index === 0 ? 555 : 655},322)`} role="button" tabIndex={0} aria-label={`Testpunkt ${label}: ${activeLead === 'red' ? 'rote' : 'schwarze'} Messspitze anschliessen`} className="terminal-control" onClick={action} onKeyDown={onKey}>
        <title>{`Testpunkt ${label} mit ${activeLead === 'red' ? 'roter' : 'schwarzer'} Messleitung verbinden`}</title>
        <rect x="-24" y="-23" width="48" height="48" rx="6" fill="transparent" className="control-focus" />
        <text y="-19" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="11" fill="#68735c" fontWeight="700">{label}</text>
        <circle r="12" fill={index === 0 ? '#5e6757' : '#af6557'} stroke="#f5f5ed" strokeWidth="2" /><circle r="8" fill="#283124" stroke={index === 0 ? '#3c4833' : '#a4594b'} strokeWidth="2" /><circle r="4" fill="url(#metal)" />
      </g>;
    })}
    {((!component && !circuit.enabled) || (component && circuit.componentPowered)) && <text x="605" y="369" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="8.5" fill="#80693e">{component ? '5 V am Bauteil' : 'Quelle ausgeschaltet'}</text>}
  </g>;
}