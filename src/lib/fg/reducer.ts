import type { Action, GenState, WaveId } from './types';
import { MAXF, WAVE_NAMES } from './waveforms';
import { EDIT_UNITS, FIELDS, clampCursor, cursorToTop, sanitize, setField } from './fields';
import { applyEdit, buildMenu, currentMenu, ensureFocus, goPage, MODE_LABEL } from './menu';

const HELP_WAVE: Record<WaveId, string> = {
  sine: 'SINE: selects the sine wave. Freq 1 µHz – 25 MHz, phase adjustable.',
  square: 'SQUARE: selects the square wave (up to 10 MHz). Duty cycle 0.1 – 99.9 %.',
  ramp: 'RAMP: triangle / sawtooth (up to 300 kHz). Symmetry 100 % = rising ramp, 0 % = falling.',
  pulse: 'PULSE: pulse wave (up to 5 MHz) with adjustable width and delay.',
  noise: 'NOISE: white noise (120 MSa/s). Only amplitude and offset apply.',
  arb: 'ARB: built-in arbitrary waveforms. Use F5 "Wave" to pick one of 10 shapes.',
};

function helpFor(a: Action, s: GenState): string {
  switch (a.type) {
    case 'wave': return HELP_WAVE[a.wave];
    case 'fkey': {
      const it = currentMenu(s).slots[a.n];
      return it
        ? `F${a.n + 1} [${it.lines.join(' / ')}]: press to select this item. Pressing a pair (Freq/Period, Ampl/Hi_Level, Offset/Lo_Level) again toggles the view.`
        : `F${a.n + 1}: no function assigned in this menu.`;
    }
    case 'digit': return 'NUMPAD: type a value, then choose the unit with F1–F5. The knob press confirms with the base unit.';
    case 'sign': return '+/-: enter a negative value (offset / levels only).';
    case 'knob': return 'KNOB: turn to change the digit under the cursor. Drag in a circle or use the mouse wheel.';
    case 'knobPress': return 'KNOB PRESS: confirms an entry (base unit) or moves the cursor to the leading digit.';
    case 'arrow': return 'ARROWS: move the cursor between digits. While typing, ◀ deletes the last character.';
    case 'chSel': return 'CH1/2: switches the channel that is being edited.';
    case 'output': return `CH${a.ch + 1} output key: connects / disconnects the BNC output (LED lit = ON).`;
    case 'both': return 'BOTH: shows both channels on the display at the same time.';
    case 'mod': return 'MOD: AM, FM, PM, FSK, Sweep or Burst. Press again to switch modulation off.';
    case 'save': return 'SAVE: four memory slots for the complete setup (kept after reload).';
    case 'utility': return 'UTILITY: load impedance, sync, beep, brightness, channel coupling/copy, audio monitor, defaults.';
    default: return 'Press any key for help.';
  }
}

export function reduce(prev: GenState, a: Action): GenState {
  const s: GenState = structuredClone(prev);
  s.ui.msg = '';
  const c = s.ch[s.active];

  if (a.type === 'power') {
    s.sys.power = !s.sys.power;
    s.ui.edit = null;
    s.ui.help = false;
    return s;
  }
  if (a.type === 'patch') {
    Object.assign(s.ch[a.ch], a.patch);
    sanitize(s.ch[a.ch]);
    ensureFocus(s);
    return s;
  }
  if (!s.sys.power) return prev;

  if (a.type === 'help') {
    s.ui.help = !s.ui.help;
    s.ui.helpText = 'Help mode: press any key to learn what it does. Press HELP again to leave.';
    return s;
  }
  if (s.ui.help) {
    s.ui.helpText = helpFor(a, s);
    return s;
  }

  switch (a.type) {
    case 'wave': {
      c.wave = a.wave;
      c.freq = Math.min(c.freq, MAXF[a.wave]);
      if (a.wave === 'noise') c.mode = 'off';
      sanitize(c);
      goPage(s, 'main');
      break;
    }
    case 'fkey': {
      const it = currentMenu(s).slots[a.n];
      it?.run?.(s);
      break;
    }
    case 'digit': {
      if (!buildMenu(s).fields.length) {
        if (s.ui.page === 'save' && /[1-4]/.test(a.d)) s.sys.slot = Number(a.d) - 1;
        break;
      }
      if (!s.ui.edit) s.ui.edit = { text: a.d === '.' ? '0.' : a.d };
      else {
        const t = s.ui.edit.text;
        if (a.d === '.' && t.includes('.')) break;
        if (t.replace('-', '').length >= 10) break;
        s.ui.edit.text = t + a.d;
      }
      break;
    }
    case 'sign': {
      if (!buildMenu(s).fields.length) break;
      if (FIELDS[s.ui.focus].kind !== 'volt') {
        s.ui.msg = 'Negative values not allowed here';
        s.ui.msgId++;
        break;
      }
      if (!s.ui.edit) s.ui.edit = { text: '-' };
      else s.ui.edit.text = s.ui.edit.text.startsWith('-') ? s.ui.edit.text.slice(1) : '-' + s.ui.edit.text;
      break;
    }
    case 'knob': {
      if (s.ui.edit || !buildMenu(s).fields.length) break;
      const f = FIELDS[s.ui.focus];
      setField(s, s.active, f.id, f.get(c) + a.steps * Math.pow(10, s.ui.cursorExp));
      clampCursor(s);
      break;
    }
    case 'knobPress': {
      if (s.ui.edit) applyEdit(s, EDIT_UNITS[FIELDS[s.ui.focus].kind].def);
      else if (buildMenu(s).fields.length) cursorToTop(s);
      break;
    }
    case 'arrow': {
      if (s.ui.edit) {
        if (a.dir === 'left') {
          const t = s.ui.edit.text.slice(0, -1);
          s.ui.edit = t ? { text: t } : null;
        }
      } else if (buildMenu(s).fields.length) {
        s.ui.cursorExp += a.dir === 'left' ? 1 : -1;
        clampCursor(s);
      }
      break;
    }
    case 'chSel': {
      s.active = s.active === 0 ? 1 : 0;
      const p = s.ui.page === 'mod' || s.ui.page === 'arb' ? 'main' : s.ui.page;
      goPage(s, p);
      break;
    }
    case 'output': {
      const ch = s.ch[a.ch];
      ch.output = !ch.output;
      s.ui.msg = `CH${a.ch + 1} output ${ch.output ? 'ON' : 'OFF'}`;
      s.ui.msgId++;
      break;
    }
    case 'both': {
      s.ui.both = !s.ui.both;
      break;
    }
    case 'mod': {
      if (c.wave === 'noise') {
        s.ui.msg = 'Modulation not available for noise';
        s.ui.msgId++;
      } else if (c.mode === 'off') {
        c.mode = 'AM';
        goPage(s, 'mod');
        s.ui.msg = 'Modulation: ' + MODE_LABEL[c.mode];
        s.ui.msgId++;
      } else if (s.ui.page !== 'mod') {
        goPage(s, 'mod');
      } else {
        c.mode = 'off';
        goPage(s, 'main');
        s.ui.msg = 'Modulation OFF';
        s.ui.msgId++;
      }
      break;
    }
    case 'save':
      goPage(s, s.ui.page === 'save' ? 'main' : 'save');
      break;
    case 'utility':
      goPage(s, s.ui.page === 'utility' ? 'main' : 'utility');
      break;
  }
  ensureFocus(s);
  return s;
}

export { WAVE_NAMES };
