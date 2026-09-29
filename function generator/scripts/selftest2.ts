import { GeneratorCore } from '../src/generator/core';
import { previewPoints, rawVoltage } from '../src/generator/waveforms';
const g = new GeneratorCore();
const d = g.dispatch;
const ok = (n: string, c: boolean, e = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + e);
const c = () => g.getState().ch[g.getState().active];
ok('sine t=0.25ms 0.5V', Math.abs(g.voltage(0, 0.25e-3) - 0.5) < 1e-9, String(g.voltage(0, 0.25e-3)));
ok('50ohm load halves', Math.abs(g.voltage(0, 0.25e-3, 50) - 0.25) < 1e-9);
ok('CH2 off = 0', g.voltage(1, 0.25e-3) === 0);
d({ type: 'utility' }); d({ type: 'fkey', n: 0 });
ok('load 50 -> open circuit 2x', Math.abs(g.voltage(0, 0.25e-3) - 1.0) < 1e-9 && Math.abs(g.voltage(0, 0.25e-3, 50) - 0.5) < 1e-9);
d({ type: 'utility' });
for (const w of ['sine','square','ramp','pulse','noise','arb'] as const) {
  d({ type: 'wave', wave: w });
  const p = previewPoints(c());
  ok('preview ' + w, p.every(Number.isFinite) && Math.max(...p) <= 1.0001 && Math.min(...p) >= -1.0001, `min ${Math.min(...p).toFixed(2)} max ${Math.max(...p).toFixed(2)}`);
}
d({ type: 'wave', wave: 'sine' });
for (let i = 0; i < 6; i++) {
  d({ type: 'mod' }); // first: enable AM; then cycle via F1
  if (i === 0) { ok('mod on AM', c().mode === 'AM'); }
  else { }
  break;
}
const modes: string[] = [];
for (let i = 0; i < 6; i++) {
  const p = previewPoints(c());
  modes.push(c().mode);
  ok('preview mode ' + c().mode, p.every(Number.isFinite) && p.length === 400, `min ${Math.min(...p).toFixed(2)} max ${Math.max(...p).toFixed(2)}`);
  d({ type: 'fkey', n: 0 });
}
console.log(modes.join(','), c().mode);
// AM: at 100% depth, envelope zero when m=-1 : t = 0.75/100 s
c().mode; d({ type: 'mod' }); // off? (page mod)-> toggles off
console.log('mode after mod key:', c().mode, g.getState().ui.page);
// burst
d({ type: 'mod' });
while (c().mode !== 'burst') d({ type: 'fkey', n: 0 });
// burst 3 cycles 1kHz, period 10ms: at t=3.5ms zero-level (offset), at t=0.25ms 0.5
ok('burst active', Math.abs(g.voltage(0, 0.25e-3) - 0.5) < 1e-9);
ok('burst idle', Math.abs(g.voltage(0, 5e-3)) < 1e-9);
// bridge-ish
console.log(Array.from(g.block(0, 0, 1e-4, 5)).map(v => v.toFixed(3)).join(' '));
