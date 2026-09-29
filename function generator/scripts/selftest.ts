import { GeneratorCore } from '../src/generator/core';
import { formatString } from '../src/generator/format';
import { currentMenu } from '../src/generator/menu';
import { previewPoints } from '../src/generator/waveforms';

const g = new GeneratorCore();
const st = () => g.getState();
const c = () => st().ch[st().active];
const ok = (name: string, cond: boolean, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + ' ' + extra);
const d = g.dispatch;

// Frequenz per Ziffern: 2.5 kHz
d({ type: 'digit', d: '2' }); d({ type: 'digit', d: '.' }); d({ type: 'digit', d: '5' });
ok('edit menu units', currentMenu(st()).slots[1]?.lines[0] === 'kHz', JSON.stringify(currentMenu(st()).slots.map(s => s?.lines[0])));
d({ type: 'fkey', n: 1 });
ok('freq 2.5kHz', c().freq === 2500, String(c().freq));
// Knob: Cursor auf 1 kHz-Stelle
d({ type: 'knob', steps: 1 });
ok('knob +1 digit', c().freq === 3500, String(c().freq) + ' exp=' + st().ui.cursorExp);
d({ type: 'arrow', dir: 'right' }); d({ type: 'knob', steps: 2 });
ok('arrow+knob', c().freq === 3700, String(c().freq));
// Period toggle
d({ type: 'fkey', n: 0 });
ok('period view', c().freqView === 'period' && st().ui.focus === 'period', st().ui.focus);
d({ type: 'digit', d: '1' }); d({ type: 'fkey', n: 1 });
ok('period 1ms -> 1kHz', Math.abs(c().freq - 1000) < 1e-6, String(c().freq) + ' ' + formatString(c().freq, 'freq', true));
// Amp Vrms
d({ type: 'fkey', n: 1 }); d({ type: 'digit', d: '1' }); d({ type: 'fkey', n: 2 });
ok('1 Vrms sine = 2.828Vpp', Math.abs(c().amp - 2.8284271247) < 1e-6, String(c().amp));
// Offset negative
d({ type: 'fkey', n: 2 }); d({ type: 'sign' }); d({ type: 'digit', d: '5' }); d({ type: 'digit', d: '0' }); d({ type: 'digit', d: '0' }); d({ type: 'fkey', n: 1 });
ok('offset -500mV', c().offset === -0.5, String(c().offset));
// Limits
d({ type: 'fkey', n: 1 }); d({ type: 'digit', d: '9' }); d({ type: 'digit', d: '9' }); d({ type: 'fkey', n: 0 });
ok('amp clamp', c().amp <= 2 * (10 - 0.5) + 1e-9, String(c().amp) + ' ' + st().ui.msg);
// Square, duty
d({ type: 'wave', wave: 'square' });
ok('square menu has duty', currentMenu(st()).slots[4]?.lines[0] === 'Duty');
d({ type: 'fkey', n: 4 }); d({ type: 'digit', d: '2' }); d({ type: 'digit', d: '5' }); d({ type: 'fkey', n: 0 });
ok('duty 25', c().duty === 25);
// Reset to clean sine 1kHz 1Vpp offset 0
d({ type: 'utility' }); d({ type: 'fkey', n: 3 }); d({ type: 'fkey', n: 3 }); // more, more? (page 2 -> default)
console.log(currentMenu(st()).slots.map(s => s?.lines.join('/')));
