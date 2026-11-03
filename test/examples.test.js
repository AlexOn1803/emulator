for (const f of ['transpiler','boards','components','engine','runtime','examples']) require('../js/'+f+'.js');
const Sim = globalThis.Sim;
const AF = Object.getPrototypeOf(async function(){}).constructor;
let bad = 0;
for (const ex of Sim.Examples) {
  const e = new Sim.Engine(); e.setProject({board: ex.board, components: ex.components, wires: ex.wires});
  const rt = new Sim.Runtime(e, {}); e.runtime = rt;
  try {
    const res = rt.compile(ex.code);
    const names = res.apiNames.filter(n => !res.topNames.has(n));
    new AF('__api','__st', `var {${names.join(',')}} = __api;\n` + res.code);
    // wiring refs valid?
    for (const w of ex.wires) for (const r of [w.a, w.b]) {
      const [o, p] = r.split(':');
      if (o === 'B') { if (!Sim.Boards[ex.board].pinById[p]) throw new Error('bad board pin '+r); }
      else { const c = ex.components.find(c=>c.id===o); if (!c) throw new Error('no comp '+r); if (!Sim.Components[c.type].pins.find(x=>x.id===p)) throw new Error('bad pin '+r); }
    }
    console.log('OK  ', ex.id, res.warnings.length ? res.warnings : '');
  } catch (err) { bad++; console.log('FAIL', ex.id, err.line, err.message); }
}
process.exit(bad ? 1 : 0);
