import { GeneratorCore, spiceSource } from '../src/generator/core';
const g = new GeneratorCore();
const s = g.getState();
console.log(spiceSource(s, 0));
console.log(spiceSource({ ...s, ch: [{ ...s.ch[0], wave: 'square', duty: 30 }, s.ch[1]] }, 0));
console.log(spiceSource({ ...s, ch: [{ ...s.ch[0], wave: 'ramp', mode: 'AM' }, s.ch[1]] }, 0).slice(0, 200));
