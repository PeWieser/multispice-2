import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Icon from './components/Icon';
import Multimeter, { DIAL, METER_POSITION, SOCKET_X, SceneDefinitions } from './components/Multimeter';
import TestCircuit from './components/TestCircuit';
import Leads from './components/Leads';
import {
  CIRCUITS, DEFAULT_CIRCUIT, DEFAULT_CONNECTIONS, MODES,
  createDemoAdapter, formatReading, getRanges, modeLabel, rangeLabel,
  readMeasurement, secondaryLabel, supportsMinMax, supportsManualRange, supportsSecondary,
  type CircuitKind, type CircuitState, type Connections, type MeasurementAdapter,
  type MeasurementRequest, type MeasurementSample, type MinMaxMode, type ModeId, type NodeId, type RedJack,
} from './lib/multimeter';
import { panAt, sound, type SoundSettings } from './lib/sound';

type DialogName = 'guide' | 'connections' | 'keyboard' | 'accessibility' | null;
type Statistics = { min: number; max: number; sum: number; count: number };
/** How the meter answers a key: one beep, two beeps (rejected) or silence (switched off). */
type KeyResult = 'ok' | 'invalid' | 'off';

// Stereo position of every sound source, taken from the scene layout.
const METER_PAN = panAt(METER_POSITION.x + 170);
const DIAL_PAN = panAt(METER_POSITION.x + DIAL.x);
const BOARD_PAN = panAt(605);
const jackPan = (jack: 'COM' | 'V') => panAt(METER_POSITION.x + SOCKET_X[jack]);
const nodePan = (node: NodeId) => panAt(node === 'positive' ? 655 : node === 'negative' ? 555 : 605);
// Continuity beeper of the reference meter: on below 20 Ω, off only above 250 Ω.
const CONTINUITY_ON = 20;
const CONTINUITY_OFF = 250;

function Brand() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="m5 10 7 13L26 8M11 10l5 9 6-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>voltwerk<span className="brand-period">.</span></span></span>;
}

function SelectField({ label, value, onChange, children, id, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; children: ReactNode; id: string; disabled?: boolean;
}) {
  return <div className="select-field"><label htmlFor={id}>{label}</label><div className="select-wrap"><select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select><Icon name="chevron" size={15} /></div></div>;
}

function formatParameter(value: number, preferredDecimals: number) {
  const normalized = Number(value.toPrecision(12));
  const [mantissa, exponent = '0'] = String(normalized).split('e');
  return normalized.toFixed(Math.min(9, Math.max(preferredDecimals, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))));
}

function NumberControl({ label, value, onChange, min, max, step, unit, precision = 2, slider = true, sliderMin = min, sliderMax = max, disabled = false, id }: {
  label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number; unit: string;
  precision?: number; slider?: boolean; sliderMin?: number; sliderMax?: number; disabled?: boolean; id: string;
}) {
  const [draft, setDraft] = useState(() => formatParameter(value, precision));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(formatParameter(value, precision)); }, [value, precision, focused]);
  const progress = Math.max(0, Math.min(100, (value - sliderMin) / (sliderMax - sliderMin) * 100));
  return <div className={`number-control ${slider ? '' : 'compact-number'}`}>
    <div className="number-heading"><label htmlFor={id}>{label}</label><div className="number-input-wrap"><input id={id} type="number" inputMode="decimal" min={min} max={max} step="any" value={draft} disabled={disabled} aria-label={`${label} in ${unit}`}
      onFocus={(event) => { setFocused(true); event.target.select(); }}
      onChange={(event) => { const next = event.target.value; setDraft(next); const parsed = Number(next); if (next !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed); }}
      onBlur={() => { const parsed = Number(draft); const next = draft !== '' && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value; onChange(next); setDraft(formatParameter(next, precision)); setFocused(false); }} /><span>{unit}</span></div></div>
    {slider && <><input type="range" className="value-slider" min={sliderMin} max={sliderMax} step={step} value={Math.min(sliderMax, Math.max(sliderMin, value))} disabled={disabled} aria-label={`${label} mit Schieberegler einstellen`} onChange={(event) => { onChange(Number(event.target.value)); sound.encoderTick(BOARD_PAN); }} style={{ '--progress': `${progress}%` } as CSSProperties} /><div className="range-endpoints"><span>{sliderMin.toLocaleString('de-DE')} {unit}</span><span>{sliderMax.toLocaleString('de-DE')} {unit}</span></div></>}
  </div>;
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button className="toggle-row" role="switch" aria-checked={checked} onClick={onChange} disabled={disabled}><span>{label}</span><span className={`toggle-track ${checked ? 'on' : ''}`} aria-hidden="true"><span /></span></button>;
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-header"><div><span className="eyebrow">VOLTWERK VM-114</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" aria-label="Dialog schliessen" onClick={onClose} autoFocus><Icon name="close" /></button></div><div className="modal-body">{children}</div></dialog>;
}

function CircuitControls({ circuit, mode, update, disabled }: { circuit: CircuitState; mode: ModeId; update: (patch: Partial<CircuitState>) => void; disabled: boolean }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => setAdvancedOpen(false), [circuit.kind]);
  const source = circuit.kind === 'dc' || circuit.kind === 'ac';
  const smallVoltage = mode === 'millivolts' && Math.abs(circuit.kind === 'dc' ? circuit.voltageDC : circuit.voltageAC) <= .6;
  const sliderMax = smallVoltage ? .6 : circuit.kind === 'ac' || Math.abs(circuit.voltageDC) > 30 ? 600 : 30;
  return <div className="circuit-controls">
    {circuit.kind === 'dc' && <NumberControl id="voltage-dc" label="Quellspannung" value={circuit.voltageDC} onChange={(voltageDC) => update({ voltageDC })} min={-600} max={600} step={smallVoltage ? .0001 : .01} unit="V" sliderMin={circuit.voltageDC < 0 ? -sliderMax : 0} sliderMax={sliderMax} disabled={disabled} />}
    {circuit.kind === 'ac' && <NumberControl id="voltage-ac" label="Effektivspannung" value={circuit.voltageAC} onChange={(voltageAC) => update({ voltageAC })} min={0} max={600} step={smallVoltage ? .0001 : .1} precision={1} unit="V" sliderMax={sliderMax} disabled={disabled} />}
    {circuit.kind === 'resistor' && <NumberControl id="resistance" label="Widerstand" value={circuit.resistance / 1000} onChange={(value) => update({ resistance: value * 1000 })} min={0} max={40000} step={.001} precision={3} sliderMax={circuit.resistance <= 10000 ? 10 : 40000} unit={'k\u03a9'} disabled={disabled} />}
    {circuit.kind === 'continuity' && <><NumberControl id="continuity-ohms" label="Leitungswiderstand" value={circuit.continuityResistance} onChange={(continuityResistance) => update({ continuityResistance })} min={0} max={600} step={.1} precision={1} unit={'\u03a9'} sliderMax={circuit.continuityResistance <= 60 ? 60 : 600} disabled={disabled} /><Toggle label={circuit.closed ? 'Verbindung geschlossen' : 'Verbindung offen'} checked={circuit.closed} onChange={() => update({ closed: !circuit.closed })} disabled={disabled} /></>}
    <div className="source-power-controls">{source ? <Toggle label={circuit.enabled ? 'Quelle eingeschaltet' : 'Quelle ausgeschaltet'} checked={circuit.enabled} onChange={() => update({ enabled: !circuit.enabled })} disabled={disabled} /> : <span className="sr-only">Spannungssicherheit</span>}<button className="tiny-icon-button" aria-label="Quelloptionen und Spannungssicherheit" aria-expanded={advancedOpen} aria-controls="source-options" title="Quelloptionen" onClick={() => setAdvancedOpen((value) => !value)}><Icon name="settings" size={15} /></button></div>
    <div id="source-options" className="source-option-content" hidden={!advancedOpen}>{source ? <NumberControl id="source-resistance" label="Innenwiderstand" value={circuit.sourceResistance} onChange={(sourceResistance) => update({ sourceResistance })} min={0} max={1e8} step={1} precision={0} unit={'\u03a9'} slider={false} disabled={disabled} /> : <Toggle label="Bauteil unter Spannung (5 V)" checked={circuit.componentPowered} onChange={() => update({ componentPowered: !circuit.componentPowered })} disabled={disabled} />}</div>
  </div>;
}

export default function App({ adapter: suppliedAdapter }: { adapter?: MeasurementAdapter } = {}) {
  const [mode, setMode] = useState<ModeId>('dcVoltage');
  const [circuit, setCircuit] = useState<CircuitState>({ ...DEFAULT_CIRCUIT });
  const [connections, setConnections] = useState<Connections>({ ...DEFAULT_CONNECTIONS });
  const [secondary, setSecondary] = useState(false);
  const [manualRange, setManualRange] = useState<number | null>(null);
  const [hold, setHold] = useState(false);
  const [heldSample, setHeldSample] = useState<MeasurementSample | null>(null);
  const [minMax, setMinMax] = useState<MinMaxMode>('off');
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [backlight, setBacklight] = useState(false);
  const [continuity, setContinuity] = useState(false);
  const [activeLead, setActiveLead] = useState<'red' | 'black'>('red');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => sound.settings);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [motionDisabled, setMotionDisabled] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [exported, setExported] = useState(false);
  const [announcement, setAnnouncement] = useState('Gleichspannung: 12,00 Volt.');
  const [sampleTick, setSampleTick] = useState(0);
  const pendingAnnouncement = useRef(announcement);
  const physical = useRef({ mode, connections, circuit });
  const demoAdapter = useMemo(() => createDemoAdapter(circuit), [circuit]);
  const adapter = suppliedAdapter ?? demoAdapter;
  const request = useMemo<MeasurementRequest>(() => ({ mode, connections, secondary, inputImpedance: mode === 'autoVoltage' ? 3000 : 10_000_000 }), [mode, connections, secondary]);
  const sample = useMemo(() => readMeasurement(request, adapter), [request, adapter, sampleTick]);
  const ranges = useMemo(() => getRanges(mode), [mode]);
  const recording = minMax !== 'off';
  const rangeLocked = hold || recording;
  // The hysteresis depends on the previous state; React allows this derived update during render.
  const continuityNow = mode === 'continuity' && sample.status === 'ok' && sample.value !== null
    && (sample.value < CONTINUITY_ON || (continuity && sample.value <= CONTINUITY_OFF));
  if (continuityNow !== continuity) setContinuity(continuityNow);
  const displaySample = useMemo(() => {
    if (hold && heldSample) return heldSample;
    if (sample.status !== 'ok' || sample.value === null || !statistics || minMax === 'off') return sample;
    return { ...sample, value: minMax === 'avg' ? statistics.sum / statistics.count : statistics[minMax] };
  }, [sample, hold, heldSample, minMax, statistics]);
  const reading = useMemo(() => formatReading(displaySample, ranges, manualRange), [displaySample, ranges, manualRange]);
  const selectedModeLabel = modeLabel(mode, secondary);
  const suggestedMode = CIRCUITS.find((item) => item.id === circuit.kind)?.mode ?? 'dcVoltage';
  const safeToExport = displaySample.status === 'ok' && !reading.overloaded && mode !== 'off';
  const warning = sample.status !== 'ok' && sample.status !== 'off' ? sample.message : reading.overloaded ? 'Messbereich überschritten. RANGE drücken oder automatische Bereichswahl aktivieren.' : '';
  const volumePercent = Math.round(soundSettings.volume * 100);

  useEffect(() => { adapter.configure?.(request); }, [adapter, request]);
  useEffect(() => {
    if (!suppliedAdapter?.subscribe) return;
    let dirty = true;
    const unsubscribe = suppliedAdapter.subscribe(() => { dirty = true; });
    const timer = window.setInterval(() => { if (dirty) { dirty = false; setSampleTick((tick) => tick + 1); } }, 500);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [suppliedAdapter]);

  // Browsers allow audio only after a gesture; the capture phase unlocks it before any control reacts.
  useEffect(() => {
    const unlock = () => sound.unlock();
    const events = ['pointerdown', 'pointerup', 'keydown'] as const;
    events.forEach((name) => window.addEventListener(name, unlock, true));
    return () => events.forEach((name) => window.removeEventListener(name, unlock, true));
  }, []);

  // Mechanical sounds follow the physical state, so mouse, keyboard, dialogs and reset sound alike.
  useEffect(() => {
    const before = physical.current;
    physical.current = { mode, connections, circuit };
    let delay = 0;
    if (before.mode !== mode) {
      const steps = Math.abs(MODES.findIndex((item) => item.id === mode) - MODES.findIndex((item) => item.id === before.mode));
      sound.rotarySwitch(steps, DIAL_PAN);
      delay += Math.min(steps, 8) * .035 + .04;
    }
    if (before.connections.blackConnected !== connections.blackConnected) {
      if (connections.blackConnected) sound.plugIn(jackPan('COM'), delay); else sound.plugOut(jackPan('COM'), delay);
      delay += .17;
    }
    if (!before.connections.redJack !== !connections.redJack) {
      if (connections.redJack) sound.plugIn(jackPan('V'), delay); else sound.plugOut(jackPan('V'), delay);
      delay += .17;
    }
    for (const lead of ['black', 'red'] as const) {
      const key = lead === 'red' ? 'redNode' : 'blackNode';
      const plugged = lead === 'red' ? !!connections.redJack : connections.blackConnected;
      const was = before.connections[key], now = connections[key];
      if (was === now || !plugged) continue;
      if (was) sound.probeLift(nodePan(was), delay);
      if (now) sound.probeContact(nodePan(now), delay + (was ? .06 : 0));
      delay += .08;
    }
    if (before.circuit.kind !== circuit.kind) sound.boardPlace(BOARD_PAN, delay);
    else if (before.circuit.enabled !== circuit.enabled && (circuit.kind === 'dc' || circuit.kind === 'ac')) sound.rockerSwitch(circuit.enabled, BOARD_PAN, delay);
    else if (before.circuit.componentPowered !== circuit.componentPowered) sound.rockerSwitch(circuit.componentPowered, BOARD_PAN, delay);
    else if (before.circuit.closed !== circuit.closed && circuit.kind === 'continuity') sound.slideSwitch(BOARD_PAN, delay);
  }, [mode, connections, circuit]);

  useEffect(() => { sound.setContinuity(continuity, METER_PAN); }, [continuity]);
  useEffect(() => () => sound.setContinuity(false), []);

  useEffect(() => {
    if (!recording || hold || sample.status !== 'ok' || sample.value === null) return;
    const value = sample.value;
    // Like the original, MIN MAX AVG beeps whenever it records a new high or low.
    if (statistics && (value > statistics.max || value < statistics.min)) sound.extremeBeep(METER_PAN);
    setStatistics((previous) => previous ? { min: Math.min(previous.min, value), max: Math.max(previous.max, value), sum: previous.sum + value, count: previous.count + 1 } : { min: value, max: value, sum: value, count: 1 });
  }, [sample, recording, hold]);

  // Announce at most once per second, even when a host supplies continuous updates.
  useEffect(() => { pendingAnnouncement.current = mode === 'off' ? 'Multimeter ausgeschaltet.' : `${selectedModeLabel}: ${reading.text.replace('.', ',')} ${reading.unit}${displaySample.voltageKind ? ` ${displaySample.voltageKind}` : ''}. ${hold ? 'Messwert gehalten.' : ''} ${continuity ? 'Durchgang vorhanden.' : ''} ${warning}`; }, [mode, selectedModeLabel, reading.text, reading.unit, displaySample.voltageKind, hold, continuity, warning]);
  useEffect(() => { const timer = window.setInterval(() => setAnnouncement(pendingAnnouncement.current), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setExported(false); }, [reading.text, mode, circuit.kind]);

  function clearModifiers() { setHold(false); setHeldSample(null); setMinMax('off'); setStatistics(null); setManualRange(null); }
  function changeMode(next: ModeId) { if (next !== mode) { setMode(next); setSecondary(false); clearModifiers(); } }
  function toggleSecondary(): KeyResult {
    if (mode === 'off') return 'off';
    if (!supportsSecondary(mode)) return 'invalid';
    setSecondary((value) => !value); clearModifiers();
    return 'ok';
  }
  function toggleHold(): KeyResult {
    if (mode === 'off') return 'off';
    setHeldSample(hold ? null : { ...displaySample }); setHold(!hold);
    return 'ok';
  }
  function toggleBacklight(): KeyResult {
    if (mode === 'off') return 'off';
    setBacklight((value) => !value);
    return 'ok';
  }
  function toggleMinMax(): KeyResult {
    if (mode === 'off') return 'off';
    if (!supportsMinMax(mode)) return 'invalid';
    setHold(false); setHeldSample(null);
    const next: Record<MinMaxMode, MinMaxMode> = { off: 'max', max: 'min', min: 'avg', avg: 'off' };
    setMinMax(next[minMax]);
    if (minMax === 'off' || minMax === 'avg') setStatistics(null);
    return 'ok';
  }
  // The range is locked in HOLD and MIN MAX AVG; the original answers with two beeps.
  function changeRange(next: number | null | 'next'): KeyResult {
    if (mode === 'off') return 'off';
    if (!supportsManualRange(mode) || rangeLocked) return 'invalid';
    setManualRange(next === 'next' ? manualRange === null ? reading.rangeIndex : (manualRange + 1) % ranges.length : next);
    return 'ok';
  }
  // The rubber dome always clicks; the beeper only confirms keys the meter accepts.
  function pressKey(action: () => KeyResult, mechanical = true) {
    if (mechanical) sound.buttonTap(METER_PAN);
    const result = action();
    if (result === 'ok') sound.keyBeep(METER_PAN);
    else if (result === 'invalid') sound.invalidBeep(METER_PAN);
  }
  function updateSound(patch: Partial<SoundSettings>) {
    const next = { ...soundSettings, ...patch };
    setSoundSettings(next);
    sound.configure(next);
    if (next.enabled) sound.unlock();
  }
  function handlePort(port: RedJack | 'COM') {
    setActiveLead(port === 'COM' ? 'black' : 'red');
    setConnections((previous) => port === 'COM' ? { ...previous, blackConnected: !previous.blackConnected } : { ...previous, redJack: previous.redJack ? null : 'V' });
  }
  function handleNode(node: NodeId) {
    const key = activeLead === 'red' ? 'redNode' : 'blackNode';
    const plugged = activeLead === 'red' ? !!connections.redJack : connections.blackConnected;
    // Tapping the terminal the probe already touches still makes contact.
    if (plugged && connections[key] === node) sound.probeContact(nodePan(node));
    setConnections((previous) => ({ ...previous, [key]: node }));
  }
  function setupSuggestedMode() { changeMode(suggestedMode); setSecondary(false); setConnections({ ...DEFAULT_CONNECTIONS }); clearModifiers(); }
  function reset() { setMode('dcVoltage'); setCircuit({ ...DEFAULT_CIRCUIT }); setConnections({ ...DEFAULT_CONNECTIONS }); setSecondary(false); clearModifiers(); setBacklight(false); setActiveLead('red'); setExported(false); }
  function updateCircuit(patch: Partial<CircuitState>) { setCircuit((previous) => ({ ...previous, ...patch })); }
  function exportReading() {
    if (!safeToExport) return;
    const rows = [
      ['Zeitpunkt', 'Messfunktion', 'Testschaltung', 'Messwert (Basiseinheit)', 'Basiseinheit', 'Anzeige', 'Bereich', 'HOLD', 'MIN/MAX/AVG', 'Roter Testpunkt', 'Schwarzer Testpunkt'],
      [new Date().toISOString(), selectedModeLabel, CIRCUITS.find((item) => item.id === circuit.kind)?.label ?? '', String(displaySample.value), displaySample.unit, `${reading.text} ${reading.unit}`, `${manualRange === null ? 'AUTO' : 'MANUELL'} ${rangeLabel(reading.range)}`, String(hold), minMax, connections.redNode ?? '', connections.blackNode ?? ''],
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `voltwerk-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (!shortcutsEnabled || dialog || event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName) || target.isContentEditable || !target.closest('.workspace, .control-panel')) return;
      const actions: Record<string, () => void> = {
        h: () => pressKey(toggleHold),
        m: () => pressKey(toggleMinMax),
        r: () => pressKey(() => changeRange(event.shiftKey ? null : 'next')),
        l: () => pressKey(toggleBacklight),
        s: () => pressKey(toggleSecondary),
        '?': () => setDialog('keyboard'),
      };
      const action = actions[event.key.toLowerCase()];
      if (action) { event.preventDefault(); action(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function connectionDescription(lead: 'red' | 'black') {
    if (lead === 'black' ? !connections.blackConnected : !connections.redJack) return 'Nicht eingesteckt';
    const node = lead === 'black' ? connections.blackNode : connections.redNode;
    return `${lead === 'black' ? 'COM' : '+'} \u2192 ${node === 'positive' ? 'Testpunkt +' : node === 'negative' ? 'Testpunkt \u2212' : 'Messspitze frei'}`;
  }
  const statusTitle = warning ? sample.status === 'live' ? 'Spannung erkannt' : 'Messpfad prüfen' : mode === 'off' ? 'Multimeter ausgeschaltet' : hold ? 'Messwert gehalten' : continuity ? 'Durchgang vorhanden' : recording ? `${minMax.toUpperCase()} aktiv` : '';

  return <div className="app-shell" data-reduced-motion={motionDisabled}>
    <a href="#messlabor" className="skip-link">Zum Multimeter springen</a>
    <header className="site-header"><div className="header-inner"><a href="#messlabor" className="brand-link" aria-label="Voltwerk Messlabor"><Brand /></a><nav className="main-nav" aria-label="Hauptnavigation"><button onClick={() => setDialog('guide')}>Anleitung<Icon name="help" size={16} /></button></nav><div className="header-tools"><button className="icon-button" onClick={() => updateSound({ enabled: !soundSettings.enabled })} aria-pressed={soundSettings.enabled} aria-label="Gerätegeräusche" title={soundSettings.enabled ? 'Geräusche ausschalten' : 'Geräusche einschalten'}><Icon name={soundSettings.enabled ? 'volume' : 'volumeOff'} size={19} /></button><button className="icon-button" onClick={() => setDialog('accessibility')} aria-label="Barrierefreiheit und Ton einstellen" title="Barrierefreiheit & Ton"><Icon name="settings" size={19} /></button></div></div></header>
    <main id="messlabor" className="main-content" tabIndex={-1}>
      <div className="page-heading"><div><div className="eyebrow">INTERAKTIVES MULTIMETER</div><h1>Voltwerk VM-114<span className="heading-period">.</span></h1><p>Spannung, Widerstand und Durchgang.</p></div><button className="reset-button" onClick={reset}><Icon name="reset" size={16} /><span>Zurücksetzen</span></button></div>
      <div className="laboratory-layout">
        <section className="workspace" aria-label="Interaktiver Messplatz">
          <div className="scene-container">
            <svg className="lab-scene" viewBox="0 0 760 685" role="group" aria-label="2D-Multimeter mit zwei Buchsen, Messleitungen und Testschaltung">
              <SceneDefinitions />
              <Multimeter
                mode={mode}
                reading={reading}
                voltageKind={displaySample.voltageKind}
                highVoltage={sample.unit === 'V' && sample.value !== null && Math.abs(sample.value) >= 30}
                secondary={secondary}
                hold={hold}
                minMax={minMax}
                backlight={backlight}
                autoRange={manualRange === null}
                connections={connections}
                onModeChange={changeMode}
                onHold={() => pressKey(toggleHold, false)}
                onMinMax={() => pressKey(toggleMinMax, false)}
                onRange={() => pressKey(() => changeRange('next'), false)}
                onAutoRange={() => pressKey(() => changeRange(null), false)}
                onSecondary={() => pressKey(toggleSecondary, false)}
                onBacklight={() => pressKey(toggleBacklight, false)}
                onPort={handlePort}
              />
              <TestCircuit circuit={circuit} onNode={handleNode} activeLead={activeLead} />
              <Leads
                connections={connections}
                activeLead={activeLead}
                onSelect={setActiveLead}
                onNodeChange={(lead, node) => setConnections((previous) => ({ ...previous, [lead === 'red' ? 'redNode' : 'blackNode']: node }))}
              />
            </svg>
          </div>
          <div className="workspace-bottomline"><span>Messspitzen ziehen oder Testpunkt anklicken.</span><button className="keyboard-hint" onClick={() => setDialog('keyboard')} aria-label="Tastaturbedienung anzeigen"><Icon name="keyboard" size={18} /></button></div><output className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</output>
        </section>
        <aside className="control-panel" aria-label="Testschaltung konfigurieren">
          <div className="panel-heading"><h2>Testschaltung</h2></div>
          <div className="panel-section circuit-section"><SelectField id="circuit-select" label="Messaufbau" value={circuit.kind} onChange={(value) => updateCircuit({ kind: value as CircuitKind, componentPowered: false })} disabled={!!suppliedAdapter}>{CIRCUITS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField><CircuitControls circuit={circuit} mode={mode} update={updateCircuit} disabled={!!suppliedAdapter} /></div>
          <div className="panel-section leads-section"><div className="section-title-row"><h3>Messleitungen</h3><button className="tiny-icon-button" aria-label="Messleitungen konfigurieren" title="Leitungen konfigurieren" onClick={() => setDialog('connections')}><Icon name="settings" size={15} /></button></div>
            {(['black', 'red'] as const).map((lead) => { const plugged = lead === 'black' ? connections.blackConnected : !!connections.redJack; return <div key={lead} className={`lead-row ${activeLead === lead ? 'lead-row-active' : ''}`}><button className="lead-select-button" onClick={() => setActiveLead(lead)} aria-pressed={activeLead === lead} aria-label={`${lead === 'red' ? 'Rote' : 'Schwarze'} Messspitze auswaehlen`}><span className={`lead-illustration ${lead}`} aria-hidden="true" /><span><strong>{lead === 'black' ? 'Schwarz' : 'Rot'}</strong><span className="lead-description">{connectionDescription(lead)}</span></span></button><button className={`lead-connect-button ${plugged ? 'connected' : ''}`} onClick={() => handlePort(lead === 'black' ? 'COM' : 'V')} aria-label={`${lead === 'black' ? 'Schwarze' : 'Rote'} Leitung ${plugged ? 'trennen' : 'anschliessen'}`} title={plugged ? 'Leitung trennen' : 'Leitung anschliessen'}><Icon name={plugged ? 'check' : 'plug'} size={15} /></button></div>; })}
            <button className="swap-button" onClick={() => setConnections((previous) => ({ ...previous, redNode: previous.blackNode, blackNode: previous.redNode }))}><Icon name="swap" size={13} />Messspitzen tauschen</button>
          </div>
          <details className="device-settings"><summary>Gerätebedienung<Icon name="chevron" size={15} /></summary><div className="device-settings-content"><SelectField id="mode-select" label="Messfunktion" value={mode} onChange={(value) => changeMode(value as ModeId)}>{MODES.map((item) => <option key={item.id} value={item.id}>{item.id === mode ? selectedModeLabel : item.label}</option>)}</SelectField>
            <SelectField id="range-select" label="Messbereich" value={manualRange === null ? 'auto' : String(manualRange)} onChange={(value) => pressKey(() => changeRange(value === 'auto' ? null : Number(value)))} disabled={!supportsManualRange(mode)}><option value="auto">AUTO &middot; {rangeLabel(reading.range)}</option>{ranges.map((item, index) => <option key={index} value={index}>{rangeLabel(item)}</option>)}</SelectField>
            <div className="accessible-control-grid"><button onClick={() => pressKey(toggleHold)} aria-pressed={hold} disabled={mode === 'off'}>HOLD</button><button onClick={() => pressKey(toggleMinMax)} aria-pressed={recording} disabled={!supportsMinMax(mode)}>MIN MAX</button><button onClick={() => pressKey(() => changeRange('next'))} onDoubleClick={() => pressKey(() => changeRange(null), false)} disabled={!supportsManualRange(mode)}>RANGE</button><button onClick={() => pressKey(toggleSecondary)} aria-pressed={secondary} disabled={!supportsSecondary(mode)} aria-label={secondaryLabel(!secondary)}>AC / DC</button><button onClick={() => pressKey(toggleBacklight)} aria-pressed={backlight} disabled={mode === 'off'}><Icon name="sun" size={15} />Licht</button></div>
            {mode !== suggestedMode && <button className="suggestion-button" onClick={setupSuggestedMode}>Passend zum Beispiel einstellen<Icon name="arrow" size={13} /></button>}
          </div></details>
          {statusTitle && <div className={`measurement-status ${warning ? 'has-warning' : ''}`} role="status"><Icon name={warning ? sample.status === 'live' ? 'alert' : 'info' : mode === 'off' ? 'power' : 'check'} size={16} /><div><strong>{statusTitle}</strong>{warning && <p>{warning}</p>}</div></div>}
          <div className="panel-action"><button className="export-link" onClick={exportReading} disabled={!safeToExport}><Icon name="download" size={15} />Messwert als CSV exportieren</button>{exported && <p role="status">CSV-Datei exportiert.</p>}</div>
        </aside>
      </div>
      <footer className="lab-footer"><p>Sichere Simulation. Keine reale Hardware.</p><button onClick={() => setDialog('accessibility')}><span className="steady-dot" />Flackerfreie Anzeige</button></footer>
    </main>

    {dialog === 'guide' && <Modal title="Wie am echten Gerät." onClose={() => setDialog(null)} className="guide-modal"><p className="modal-intro">Die Gerätefront folgt der Vorlage: zwei Buchsen, sieben Schalterstellungen.</p><ol className="guide-steps"><li><span className="step-number">01</span><div><h3>Funktion wählen</h3><p>Auto-V / LoZ erkennt AC oder DC und belastet die Quelle mit 3 kΩ. Daneben stehen OFF, V AC, V DC, mV, Widerstand und Durchgang zur Verfügung. Die gelbe Taste wechselt im mV-Modus zwischen AC+DC und DC.</p></div></li><li><span className="step-number">02</span><div><h3>Leitungen verbinden</h3><p>Schwarz in COM, Rot in +. Buchse anklicken, um die Leitung einzustecken oder zu trennen. Messspitzen an die Testpunkte ziehen oder eine Messspitze auswählen und den Testpunkt anklicken.</p></div></li><li><span className="step-number">03</span><div><h3>Messen</h3><p>Spannung parallel messen. Für Widerstand und Durchgang die Quelle ausschalten. Dieses Gerät hat wie die Vorlage keine Strom-, Dioden-, Kapazitäts- oder Temperaturmessung.</p></div></li></ol><div className="guide-functions"><h3>Die Tasten</h3><dl><div><dt>HOLD</dt><dd>Messwert halten. Noch einmal drücken: Liveanzeige.</dd></div><div><dt>MIN MAX</dt><dd>Maximum, Minimum, Mittelwert, Livewert. Neue Extremwerte meldet der Piepser. HOLD pausiert die Aufzeichnung.</dd></div><div><dt>RANGE</dt><dd>Bereich manuell wechseln. Doppelklick oder Shift + R: AUTO. In HOLD und MIN MAX gesperrt, das Gerät piept dann zweimal.</dd></div><div><dt>Gelbe Taste</dt><dd>Im mV-Modus zwischen AC und DC wechseln.</dd></div><div><dt>Licht</dt><dd>Die weiße LCD-Beleuchtung ein- oder ausschalten.</dd></div><div><dt>Ton</dt><dd>Lautsprecher oben rechts: Geräusche an oder aus. Lautstärke und Piepser unter Barrierefreiheit &amp; Ton.</dd></div></dl></div><div className="guide-note"><Icon name="info" size={17} /><p>Idealisierte Testschaltungen, kein SPICE-Solver. Bis 600 V, 600 mV und 40 MΩ. Durchgangston ein unter 20 Ω, aus erst über 250 Ω. MIN MAX und manuelle Bereiche sind in Auto-V / LoZ und Durchgang nicht verfügbar.</p></div><a href="./PORTIERUNG.md" download className="documentation-link"><Icon name="download" size={16} />Portierungsanleitung (.md)<Icon name="arrow" size={15} /></a></Modal>}

    {dialog === 'connections' && <Modal title="Messleitungen verbinden" onClose={() => setDialog(null)}><p className="modal-intro">Alle Verbindungen lassen sich auch ohne Ziehen einstellen.</p>{(['black', 'red'] as const).map((lead) => <div key={lead} className="connection-editor"><h3><span className={`lead-indicator ${lead}`} />{lead === 'black' ? 'Schwarz / COM' : 'Rot / +'}</h3><SelectField id={`${lead}-jack`} label="Buchse" value={lead === 'black' ? connections.blackConnected ? 'connected' : 'none' : connections.redJack ? 'connected' : 'none'} onChange={(value) => setConnections((previous) => lead === 'black' ? { ...previous, blackConnected: value === 'connected' } : { ...previous, redJack: value === 'connected' ? 'V' : null })}><option value="connected">{lead === 'black' ? 'COM' : 'Plus (+)'}</option><option value="none">Nicht angeschlossen</option></SelectField><SelectField id={`${lead}-node`} label="Testpunkt" value={(lead === 'black' ? connections.blackNode : connections.redNode) ?? 'none'} onChange={(value) => setConnections((previous) => ({ ...previous, [lead === 'black' ? 'blackNode' : 'redNode']: value === 'none' ? null : value }))}><option value="negative">Testpunkt B / Minuspol</option><option value="positive">Testpunkt A / Pluspol</option><option value="none">Messspitze frei</option></SelectField></div>)}<button className="modal-primary-button" onClick={() => setDialog(null)}>Weiter messen<Icon name="arrow" size={16} /></button></Modal>}

    {dialog === 'keyboard' && <Modal title="Tastaturbedienung" onClose={() => setDialog(null)}><p className="modal-intro">Tab wählt ein Bedienelement. Enter oder Leertaste aktiviert Tasten, Buchsen und Testpunkte.</p><dl className="keyboard-shortcuts"><div><dt><kbd>&larr;</kbd><kbd>&rarr;</kbd></dt><dd>Fokussierten Drehschalter einstellen</dd></div><div><dt><kbd>H</kbd></dt><dd>HOLD</dd></div><div><dt><kbd>M</kbd></dt><dd>MAX, MIN, AVG, Livewert</dd></div><div><dt><kbd>R</kbd></dt><dd>Messbereich wechseln</dd></div><div><dt><kbd>Shift</kbd><kbd>R</kbd></dt><dd>Automatische Bereichswahl</dd></div><div><dt><kbd>S</kbd></dt><dd>mV AC / DC</dd></div><div><dt><kbd>L</kbd></dt><dd>Displaybeleuchtung</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Dialog schließen</dd></div></dl><p className="modal-footnote">Buchstabenkürzel funktionieren nur im fokussierten Messplatz oder Versuchsaufbau, nicht in Eingabefeldern. In den Barrierefreiheitseinstellungen sind sie abschaltbar.</p></Modal>}

    {dialog === 'accessibility' && <Modal title="Barrierefreiheit & Ton" onClose={() => setDialog(null)}><p className="modal-intro">Keine blinkenden Ziffern oder Lichtblitze. Geräusche entstehen nur durch deine Bedienung und lassen sich jederzeit abschalten.</p><div className="accessibility-options">
      <Toggle label="Bewegungen reduzieren" checked={motionDisabled} onChange={() => setMotionDisabled((value) => !value)} /><p>Die Systemeinstellung für reduzierte Bewegung wird berücksichtigt. Die Option deaktiviert zusätzlich alle Übergänge.</p>
      <Toggle label="Gerätegeräusche" checked={soundSettings.enabled} onChange={() => updateSound({ enabled: !soundSettings.enabled })} /><p>Drehschalter, Tasten, Stecker, Messspitzen und Testschaltung, räumlich verortet. Auch über den Lautsprecher oben rechts schaltbar.</p>
      <div className="volume-control"><div><label htmlFor="sound-volume">Lautstärke</label><output htmlFor="sound-volume">{volumePercent} %</output></div><input id="sound-volume" type="range" className="value-slider" min={0} max={100} step={5} value={volumePercent} disabled={!soundSettings.enabled} aria-valuetext={`${volumePercent} Prozent`} onChange={(event) => updateSound({ volume: Number(event.target.value) / 100 })} onPointerUp={() => sound.preview(METER_PAN)} onKeyUp={(event) => { if (/^(Arrow|Home|End|Page)/.test(event.key)) sound.preview(METER_PAN); }} style={{ '--progress': `${volumePercent}%` } as CSSProperties} /></div>
      <Toggle label="Piepser des Multimeters" checked={soundSettings.beeper} onChange={() => updateSound({ beeper: !soundSettings.beeper })} disabled={!soundSettings.enabled} /><p>Tastenquittung, Doppelton bei ungültiger Taste, Signal bei neuem MIN- oder MAX-Wert und Durchgangston. Wie beim Original separat abschaltbar.</p>
      <Toggle label="Ein-Tasten-Kürzel aktivieren" checked={shortcutsEnabled} onChange={() => setShortcutsEnabled((value) => !value)} /><p>Bei Bedarf ausschalten, damit Buchstabentasten deinem Screenreader vorbehalten bleiben. Tab, Enter und Pfeiltasten bleiben aktiv.</p>
    </div><div className="accessibility-note"><Icon name="keyboard" size={20} /><div><h3>Ohne Maus bedienbar</h3><p>Sichtbarer Fokus, beschriftete Steuerelemente, native Dialoge und Screenreader-Ausgabe höchstens einmal pro Sekunde. Alle Gerätetasten sind zusätzlich unter „Gerätebedienung“ erreichbar.</p><button className="text-link" onClick={() => setDialog('keyboard')}>Tastenkürzel ansehen<Icon name="arrow" size={14} /></button></div></div><button className="modal-primary-button" onClick={() => setDialog(null)}>Weiter messen<Icon name="check" size={16} /></button></Modal>}
  </div>;
}
