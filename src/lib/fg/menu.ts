import type { Channel, FieldId, GenState, MenuItem, ModMode, PageId, Snapshot } from './types';
import { ARB_WAVES, WAVE_NAMES } from './waveforms';
import { EDIT_UNITS, FIELDS, clampCursor, cursorToTop, sanitize, setField } from './fields';
import { formatCompact } from './format';
import { defaultChannel } from './state';

export const MODES: ModMode[] = ['AM', 'FM', 'PM', 'FSK', 'sweep', 'burst'];
export const MODE_LABEL: Record<ModMode, string> = {
  off: 'Off', AM: 'AM', FM: 'FM', PM: 'PM', FSK: 'FSK', sweep: 'Sweep', burst: 'Burst',
};

export interface BaseMenu {
  title: string;
  items: MenuItem[];
  fields: FieldId[];
  info?: string[];
  infoHi?: number;
}
export interface CurrentMenu {
  title: string;
  slots: (MenuItem | null)[];
  fields: FieldId[];
  info?: string[];
  infoHi?: number;
  pages: number;
}

const cur = (s: GenState) => s.ch[s.active];

function msg(s: GenState, text: string) {
  s.ui.msg = text;
  s.ui.msgId++;
}

export function focusField(s: GenState, id: FieldId) {
  s.ui.focus = id;
  s.ui.edit = null;
  cursorToTop(s);
}

export function goPage(s: GenState, page: PageId) {
  s.ui.page = page;
  s.ui.menuPage = 0;
  s.ui.edit = null;
  ensureFocus(s);
}

export function ensureFocus(s: GenState) {
  const { fields } = buildMenu(s);
  if (fields.length && !fields.includes(s.ui.focus)) focusField(s, fields[0]);
  else if (fields.length) clampCursor(s);
}

export function mainFields(c: Channel): FieldId[] {
  const f: FieldId[] = [c.freqView, c.ampView, c.offView];
  switch (c.wave) {
    case 'sine': return [...f, 'phase'];
    case 'square': return [...f, 'phase', 'duty'];
    case 'ramp': return [...f, 'phase', 'symmetry'];
    case 'pulse': return [...f, 'width', 'delay'];
    case 'noise': return [c.ampView, c.offView];
    case 'arb': return [...f, 'phase'];
  }
}

export function modFields(c: Channel): FieldId[] {
  switch (c.mode) {
    case 'AM': return ['modFreq', 'depth'];
    case 'FM': return ['modFreq', 'devFreq'];
    case 'PM': return ['modFreq', 'devPhase'];
    case 'FSK': return ['rate', 'hopFreq'];
    case 'sweep': return ['sweepStart', 'sweepStop', 'sweepTime'];
    case 'burst': return ['burstCycles', 'burstPeriod', 'phase'];
    default: return [];
  }
}

const fieldItem = (s: GenState, id: FieldId, label?: string): MenuItem => ({
  lines: [label ?? FIELDS[id].short],
  selected: s.ui.focus === id,
  run: (st) => focusField(st, id),
});

function pairItem(
  s: GenState, view: 'freqView' | 'ampView' | 'offView', a: FieldId, b: FieldId, l1: string, l2: string,
): MenuItem {
  const showing = cur(s)[view];
  return {
    lines: [l1, l2],
    hi: showing === a ? 0 : 1,
    selected: s.ui.focus === showing,
    run: (st) => {
      const cc = st.ch[st.active] as unknown as Record<string, string>;
      if (st.ui.focus === cc[view]) cc[view] = cc[view] === a ? b : a;
      focusField(st, cc[view] as FieldId);
    },
  };
}

const onOff = (b: boolean) => (b ? 'On' : 'Off');

function snapInfo(sn: Snapshot | null): string {
  if (!sn) return 'Empty';
  const c = sn.ch[0];
  return `${WAVE_NAMES[c.wave]} ${formatCompact(c.freq, 'freq')} ${formatCompact(c.amp, 'vpp')}`;
}

function mainMenu(s: GenState, c: Channel): BaseMenu {
  const items: MenuItem[] = [];
  const fields = mainFields(c);
  if (c.wave !== 'noise') items.push(pairItem(s, 'freqView', 'freq', 'period', 'Freq', 'Period'));
  items.push(pairItem(s, 'ampView', 'amp', 'high', 'Ampl', 'Hi_Level'));
  items.push(pairItem(s, 'offView', 'offset', 'low', 'Offset', 'Lo_Level'));
  for (const f of fields.slice(c.wave === 'noise' ? 2 : 3)) {
    items.push(fieldItem(s, f, f === 'duty' ? 'Duty' : undefined));
  }
  if (c.wave === 'arb') {
    items.push({ lines: ['Wave', ARB_WAVES[c.arb].name], hi: 1, run: (st) => goPage(st, 'arb') });
  }
  return { title: WAVE_NAMES[c.wave], items, fields };
}

function modMenu(s: GenState, c: Channel): BaseMenu {
  const items: MenuItem[] = [];
  items.push({
    lines: ['Type', MODE_LABEL[c.mode]],
    hi: 1,
    run: (st) => {
      const cc = cur(st);
      cc.mode = MODES[(MODES.indexOf(cc.mode) + 1) % MODES.length];
      sanitize(cc);
      st.ui.menuPage = 0;
      ensureFocus(st);
      const f = modFields(cc)[0];
      if (f) focusField(st, f);
    },
  });
  const shape = (): MenuItem => ({
    lines: ['Shape', c.mod.shape],
    hi: 1,
    run: (st) => {
      const m = cur(st).mod;
      m.shape = m.shape === 'sine' ? 'square' : m.shape === 'square' ? 'ramp' : 'sine';
    },
  });
  switch (c.mode) {
    case 'AM':
      items.push(shape(), fieldItem(s, 'modFreq', 'MFreq'), fieldItem(s, 'depth'));
      break;
    case 'FM':
      items.push(shape(), fieldItem(s, 'modFreq', 'MFreq'), fieldItem(s, 'devFreq'));
      break;
    case 'PM':
      items.push(shape(), fieldItem(s, 'modFreq', 'MFreq'), fieldItem(s, 'devPhase'));
      break;
    case 'FSK':
      items.push(fieldItem(s, 'rate'), fieldItem(s, 'hopFreq'));
      break;
    case 'sweep':
      items.push(
        fieldItem(s, 'sweepStart'), fieldItem(s, 'sweepStop'), fieldItem(s, 'sweepTime'),
        {
          lines: ['Sweep', c.sweep.type === 'lin' ? 'Linear' : 'Log'],
          hi: 1,
          run: (st) => { const w = cur(st).sweep; w.type = w.type === 'lin' ? 'log' : 'lin'; },
        },
      );
      break;
    case 'burst':
      items.push(fieldItem(s, 'burstCycles'), fieldItem(s, 'burstPeriod'), fieldItem(s, 'phase', 'Phase'));
      break;
  }
  items.push({ lines: ['Carrier', '▸ Main'], hi: 0, run: (st) => goPage(st, 'main') });
  return { title: MODE_LABEL[c.mode], items, fields: modFields(c) };
}

function utilityMenu(s: GenState, c: Channel): BaseMenu {
  const a = s.active;
  const items: MenuItem[] = [
    {
      lines: ['Load', c.load === '50' ? '50 Ω' : 'High Z'], hi: 1,
      run: (st) => {
        const cc = cur(st);
        cc.load = cc.load === '50' ? 'highz' : '50';
        sanitize(cc);
        msg(st, `CH${st.active + 1} load: ${cc.load === '50' ? '50 Ω' : 'High Z'}`);
      },
    },
    { lines: ['Sync', onOff(s.sys.sync)], hi: 1, run: (st) => { st.sys.sync = !st.sys.sync; } },
    { lines: ['Beep', onOff(s.sys.beep)], hi: 1, run: (st) => { st.sys.beep = !st.sys.beep; } },
    { lines: ['Bright', `${s.sys.brightness}/5`], hi: 1, run: (st) => { st.sys.brightness = (st.sys.brightness % 5) + 1; } },
    { lines: ['Freq', `Couple ${onOff(s.sys.coupleFreq)}`], hi: 1, run: (st) => { st.sys.coupleFreq = !st.sys.coupleFreq; } },
    { lines: ['Ampl', `Couple ${onOff(s.sys.coupleAmp)}`], hi: 1, run: (st) => { st.sys.coupleAmp = !st.sys.coupleAmp; } },
    {
      lines: ['Copy', `CH${a + 1}→CH${2 - a}`], hi: 1,
      run: (st) => {
        const keep = st.ch[1 - st.active].output;
        st.ch[1 - st.active] = structuredClone(st.ch[st.active]);
        st.ch[1 - st.active].output = keep;
        msg(st, `CH${st.active + 1} copied to CH${2 - st.active}`);
      },
    },
    { lines: ['Audio', onOff(s.sys.audio)], hi: 1, run: (st) => { st.sys.audio = !st.sys.audio; } },
    {
      lines: ['Default'],
      run: (st) => {
        st.ch = [defaultChannel(), defaultChannel()];
        st.ch[0].output = true;
        st.active = 0;
        goPage(st, 'main');
        msg(st, 'Factory defaults restored');
      },
    },
  ];
  const info = [
    `Load CH${a + 1}   : ${c.load === '50' ? '50 Ω' : 'High Z'}`,
    `Sync Out   : ${onOff(s.sys.sync)}`,
    `Beep       : ${onOff(s.sys.beep)}`,
    `Brightness : ${s.sys.brightness}/5`,
    `Freq Couple: ${onOff(s.sys.coupleFreq)}`,
    `Ampl Couple: ${onOff(s.sys.coupleAmp)}`,
    `Audio Mon. : ${onOff(s.sys.audio)}`,
  ];
  return { title: 'Utility', items, fields: [], info };
}

function saveMenu(s: GenState): BaseMenu {
  const slot = s.sys.slot;
  const items: MenuItem[] = [
    { lines: ['Slot', `M${slot + 1}`], hi: 1, run: (st) => { st.sys.slot = (st.sys.slot + 1) % 4; } },
    {
      lines: ['Save'],
      run: (st) => {
        st.sys.mem[st.sys.slot] = { ch: structuredClone(st.ch), active: st.active };
        msg(st, `Saved to M${st.sys.slot + 1}`);
      },
    },
    {
      lines: ['Recall'],
      run: (st) => {
        const m = st.sys.mem[st.sys.slot];
        if (!m) return msg(st, `M${st.sys.slot + 1} is empty`);
        st.ch = structuredClone(m.ch);
        st.active = m.active;
        goPage(st, 'main');
        msg(st, `Recalled M${st.sys.slot + 1}`);
      },
    },
    {
      lines: ['Clear'],
      run: (st) => { st.sys.mem[st.sys.slot] = null; msg(st, `M${st.sys.slot + 1} cleared`); },
    },
  ];
  const info = s.sys.mem.map((m, i) => `M${i + 1}: ${snapInfo(m)}`);
  return { title: 'Memory', items, fields: [], info, infoHi: slot };
}

function arbMenu(c: Channel): BaseMenu {
  const items: MenuItem[] = ARB_WAVES.map((w, i) => ({
    lines: [w.name],
    selected: c.arb === i,
    run: (st) => { cur(st).arb = i; goPage(st, 'main'); },
  }));
  return { title: 'Arb Wave', items, fields: [] };
}

export function buildMenu(s: GenState): BaseMenu {
  const c = cur(s);
  switch (s.ui.page) {
    case 'utility': return utilityMenu(s, c);
    case 'save': return saveMenu(s);
    case 'arb': return arbMenu(c);
    case 'mod': if (c.mode !== 'off') return modMenu(s, c); return mainMenu(s, c);
    default: return mainMenu(s, c);
  }
}

export function applyEdit(s: GenState, unitIdx: number) {
  const e = s.ui.edit;
  if (!e) return;
  const f = FIELDS[s.ui.focus];
  const n = parseFloat(e.text);
  s.ui.edit = null;
  if (!Number.isFinite(n)) return msg(s, 'Invalid entry');
  setField(s, s.active, f.id, n * EDIT_UNITS[f.kind].units[unitIdx].mult(cur(s)));
  clampCursor(s);
}

export function currentMenu(s: GenState): CurrentMenu {
  const base = buildMenu(s);
  if (s.ui.edit && base.fields.includes(s.ui.focus)) {
    const f = FIELDS[s.ui.focus];
    const slots: (MenuItem | null)[] = [null, null, null, null, null];
    EDIT_UNITS[f.kind].units.forEach((u, i) => {
      slots[i] = { lines: [u.label], run: (st) => applyEdit(st, i) };
    });
    slots[4] = { lines: ['Cancel'], run: (st) => { st.ui.edit = null; } };
    return { title: 'Unit', slots, fields: base.fields, pages: 1 };
  }
  const items = base.items;
  let slots: (MenuItem | null)[];
  let pages = 1;
  if (items.length <= 5) {
    slots = [...items, ...Array(5 - items.length).fill(null)];
  } else {
    pages = Math.ceil(items.length / 4);
    const p = s.ui.menuPage % pages;
    const part = items.slice(p * 4, p * 4 + 4);
    slots = [...part, ...Array(4 - part.length).fill(null)];
    slots.push({
      lines: ['More', `${p + 1}/${pages} ▸`], hi: 0,
      run: (st) => { st.ui.menuPage = (p + 1) % pages; },
    });
  }
  return { title: base.title, slots, fields: base.fields, info: base.info, infoHi: base.infoHi, pages };
}
