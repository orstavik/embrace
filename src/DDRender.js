import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";
import { diffRaw as diff } from "https://cdn.jsdelivr.net/gh/orstavik/making-a@25.09.12/difference.js";

function moveNodes(first, last, target) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, target.after(n), (target = n);
  last && target.after(last);
}

function removeNodes(first, last) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, n.remove();
  last.remove();
}

const tupleMap = {};
const tuplify = obj => (!obj || typeof obj !== 'object') ? obj : (tupleMap[JSON.stringify(obj)] ??= obj);

function* extractMatch(set1, set2, test) {
  for (let fillable of set1)
    for (let reusable of set2)
      if (!test || test(fillable, reusable)) {
        set1.delete(fillable), set2.delete(reusable);
        yield { fillable, reusable };
        break;
      }
}

function renderDefValues(state, Def) {
  const $ = Object.assign(state instanceof Array ? [] : {}, state);
  const values = [];
  Def.hydra($, function run() {
    const innerValues = Def.innerHydras.map(inner =>
      inner.Def ? renderDefValues($, inner.Def) : inner.hydra($));
    values.push(tuplify(innerValues.map(tuplify)));
  });
  return values;
}

class Stamp {
  #start;
  #value;
  #nodes;

  constructor(start, value) {
    this.#start = start;
    this.#value = value;
  }

  get start() { return this.#start; }
  get value() { return this.#value; }
  get nodes() { return this.#nodes; }

  hydrate(Def, prevValue) {
    const res = [];
    for (let i = 0; i < this.#nodes.length; i++) {
      const { Def: insideDef, hydra } = Def.innerHydras[i];
      const { start, end } = this.#nodes[i];
      const value = this.#value?.[i];
      const oldValue = prevValue?.[i];
      if (oldValue != value) {
        if (insideDef) {
          start.stampGroup ??= StampGroup.make(insideDef, start, end);
          const change = start.stampGroup.update(value);
          change && res.push(change);
        } else
          start.nodeValue = value;
      }
    }
    return res;
  }

  fill({ start, last, nodes }) {
    if (this.#nodes)
      throw new Error("Stamp can only be filled once");
    this.#nodes = nodes;
    moveNodes(start.nextSibling, last, this.#start);
    start.remove();  //it doesn't matter if the start is connected or not..
    return this;
  }
}

class StampGroup {
  #Def;
  #start;
  #end;
  #values;
  #stamps = [];
  get Def() { return this.#Def; }
  get stamps() { return this.#stamps; }

  static make(Def, start, end) {
    const n = new StampGroup();
    n.#Def = Def;
    n.#end = end;
    n.#start = start;
    n.#start.stampGroup = n; //todo this is spaghettish..
    return n;
  }

  update(newValues) {
    if (!newValues?.length)
      newValues = undefined;
    if (this.#values == newValues)
      return;
    const fillables = [], reusables = [], newStamps = [];
    const diffs = diff(this.#values ?? [], newValues ?? []);
    for (let { a, b } of diffs) {
      if (b.length == a.length) {
        newStamps.push(...this.#stamps.splice(0, a.length));
      } else if (b.length) {
        const cs = b.map(_ => document.createComment("::,"));
        const stamps = cs.map((c, i) => new Stamp(c, b[i]));
        (this.#stamps[0]?.start ?? this.#end).before(...cs);
        newStamps.push(...stamps);
        fillables.push(...stamps);
      } else if (a.length) {
        //makes Stamps reusable by adding .last= "last content node of the stamp"
        for (let i = 0; i < a.length; i++)
          this.#stamps[i].last = (this.#stamps[i + 1]?.start ?? this.#end).previousSibling;
        reusables.push(...this.#stamps.splice(0, a.length));
      }
    }
    this.#values = newValues;
    this.#stamps = newStamps;
    return { fillables, reusables, Def: this.#Def };
  }
}

class UnusedStampsMap {
  #map = new Map();
  add(Def, reusables) { this.#map.set(Def, reusables); }

  static resolveNestedStamps(nodePositions, i, stamp, result) {
    for (let nodeIs of nodePositions[i]) {
      for (let nodeI of nodeIs) {
        const groupNode = stamp.nodes[nodeI];
        const stampGroup = groupNode.stampGroup;
        if (nodeIs.length === 1)
          result.push(...stampGroup.stamps);
        else
          for (let innerStamp of stampGroup.stamps)
            UnusedStampsMap.resolveNestedStamps(nodePositions, i + 1, innerStamp, result);
      }
    }
  }

  extractUnusedInnerReusables(targetDef) {
    const res = [];
    for (let [outerDef, stamps] of this.#map.entries()) {
      const nodePositions = outerDef.innerDefs.get(targetDef);
      if (nodePositions != null)
        for (let stamp of stamps)
          UnusedStampsMap.resolveNestedStamps(nodePositions, 0, stamp, res);
    }
    return res;
  }

  * all() {
    for (let reusables of this.#map.values())
      for (let reusable of reusables)
        if (reusable.start.isConnected)
          yield reusable;
  }
}

class StampMap {
  #fillables = new Map();
  #reusables = new Map();

  add(todo) {
    const { Def, fillables, reusables } = todo;
    let fs, rs;
    fs = this.#fillables.get(Def);
    rs = this.#reusables.get(Def);
    if (!fs) {
      this.#fillables.set(Def, fs = []);
      this.#reusables.set(Def, rs = []);
    }
    fs.push(...fillables);
    rs.push(...reusables);
  }

  addAll(todos) {
    for (let todo of todos)
      todo && this.add(todo);
  }

  extractOutermostDefGroup() {
    if (!this.#fillables.size)
      return;
    const Def = this.#fillables.keys().reduce((a, b) => a.position > b.position ? a : b);
    const fillables = new Set(this.#fillables.get(Def));
    const reusables = new Set(this.#reusables.get(Def));
    this.#fillables.delete(Def);
    this.#reusables.delete(Def);
    return { Def, fillables, reusables };
  }
}

const IdenticalValues = (f, r) => f.value === r.value;
const IdenticalInnerArrays = (f, r) => f.value.every((v, i) => typeof v === 'string' || v === r.value[i])

function reuseAndInstantiateIndividualStamps(todos) {
  let globalNotUsed = new UnusedStampsMap();
  let todo;
  while (todo = todos.extractOutermostDefGroup()) {
    const { Def, fillables, reusables } = todo;

    //2b. here we can dig inside globalNotUsed for stamps with the current Def. 
    if (fillables.size > reusables.size) {
      const innerReusables = globalNotUsed.extractUnusedInnerReusables(Def);
      for (let r of innerReusables)
        reusables.add(r);
    }

    //2. fill stamps with reusables with the exact same value.
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalValues))
      fillable.fill(reusable);

    //3. ligthWeight matches all with identical inner arrays. These matches will only change (text, comments, attribute).nodeValue
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalInnerArrays))
      fillable.fill(reusable).hydrate(Def, reusable.value);

    //4. heavyWeight. reuse and hydrate complex mismatches
    for (let { fillable, reusable } of extractMatch(fillables, reusables))
      todos.addAll(fillable.fill(reusable).hydrate(Def, reusable.value));

    //5. create new stamp instance and hydrate for the rest
    for (let fillable of fillables)
      todos.addAll(fillable.fill(getInstance(Def)).hydrate(Def));

    globalNotUsed.add(Def, reusables);
  }

  for (let { start, last } of globalNotUsed.all())
    removeNodes(start, last);
}

let rootStampGroups = new WeakMap();
export function renderUnder(root, state) {

  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  let stampGroups = rootStampGroups.get(root);
  if (!stampGroups) {
    stampGroups = [];
    for (let { start, id, end } of findRunnableTemplates(root))
      stampGroups.push(StampGroup.make(getDefinition(id), start, end));
    rootStampGroups.set(root, stampGroups);
  }
  const todos = new StampMap();
  todos.addAll(stampGroups.map(g => g.update(renderDefValues(state, g.Def))));

  reuseAndInstantiateIndividualStamps(todos);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
