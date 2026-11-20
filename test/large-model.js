// An invented model of realistic size for the force layout (130 tables, ~370 relations, 18 modules), generated
// deterministically: modules of uneven size, most relations inside a module, the rest pointing to earlier modules,
// two hub tables nearly half of the relations reference (the kind a page shows as tiles: hubTables, so a test can
// leave their relations out as the viewer does), a few opaque references, tables of very different heights, a few
// tables without a module and two without any relation.
import { estimateHeight, seededRandom } from "../src/viewer/layout.js";

const TABLES = 130, MODULES = 18, RELATIONS = 370, WITHOUT_MODULE = 4, ISOLATED = 2;

export function largeModel(seed = 20261120) {
  const random = seededRandom(seed);
  const pick = list => list[Math.floor(random() * list.length)];
  const weights = Array.from({ length: MODULES }, () => 0.15 + random() * random());
  const total = weights.reduce((s, w) => s + w, 0);
  const moduleOfTable = [];
  for (let m = 0; m < MODULES; m++) {
    const size = Math.max(1, Math.round(weights[m] / total * (TABLES - WITHOUT_MODULE)));
    for (let k = 0; k < size && moduleOfTable.length < TABLES - WITHOUT_MODULE; k++) moduleOfTable.push(m);
  }
  while (moduleOfTable.length < TABLES) moduleOfTable.push(null);
  const ids = moduleOfTable.map((_, i) => "table" + String(i).padStart(3, "0"));
  const module = new Map(ids.map((id, i) => [id, moduleOfTable[i] == null ? null : "module" + String(moduleOfTable[i]).padStart(2, "0")]));
  const isolated = new Set(ids.slice(-ISOLATED));
  const linkable = ids.filter(id => !isolated.has(id));
  const hubs = [linkable[0], linkable[Math.floor(linkable.length / 3)]];
  const members = new Map();
  for (const id of linkable) { const key = module.get(id); if (!members.has(key)) members.set(key, []); members.get(key).push(id); }
  const keys = [...members.keys()];
  const relations = [];
  while (relations.length < RELATIONS) {
    const from = pick(linkable), own = members.get(module.get(from));
    const roll = random();
    let to;
    if (roll < 0.45) to = pick(hubs);
    else if (roll < 0.85 && own.length > 1) to = pick(own);
    else { const others = keys.filter(k => k !== module.get(from) && (k == null || keys.indexOf(k) <= keys.indexOf(module.get(from)) + 1)); to = pick(members.get(pick(others.length ? others : keys))); }
    if (to === from) continue;
    relations.push({ from, to, ...(random() < 0.06 ? { opaque: true } : {}) });
  }
  // Mostly small tables, a few very tall ones; start positions on a shuffled grid (no head start for any module).
  const order = ids.map((id, i) => [random(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const boxes = ids.map((id, i) => {
    const slot = order.indexOf(i);
    return { id, x: (slot % 12) * 290, y: Math.floor(slot / 12) * 420, w: 236, h: estimateHeight(4 + Math.floor(Math.pow(random(), 2.5) * 50), random() < 0.5 ? 1 : 2) };
  });
  return { boxes, relations, moduleOf: id => module.get(id), hubTables: hubs };
}
