import { getDefinition, findRunnableTemplates, getInstance } from "./DD6.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";
import { diffRaw as diff } from "https://cdn.jsdelivr.net/gh/orstavik/making-a@25.09.12/difference.js";

function moveNodes(first, last, target) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, target.after(n), (target = n);
  target.after(last);
}

function removeNodes(first, last) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, n.remove();
  last.remove();
}

const tupleMap = {};
const tuplify = (obj) => tupleMap[JSON.stringify(obj)] ??= obj;

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
    values.push(tuplify(innerValues));
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

  fill(reusable) {
    if (this.#nodes)
      throw new Error("Stamp can only be filled once");
    this.#nodes = reusable.nodes;
    moveNodes(reusable.start.nextSibling, reusable.last, this.#start);
    reusable.start.remove();  //it doesn't matter if the start is connected or not..
    return this;
  }
}

class StampGroup {
  #Def;
  #start;
  #end;
  #values;
  #stamps = [];
  #newStampsNotFilled;
  #filledStampsNotUsed;

  get fillables() { return this.#newStampsNotFilled }
  get reusables() { return this.#filledStampsNotUsed }
  get Def() { return this.#Def; }

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
    const unFulfilled = [], filledButNotUsed = [], newStamps = [];
    const diffs = diff(this.#values ?? [], newValues ?? []);
    for (let { a, b } of diffs) {
      if (b.length == a.length) {
        if (a == b)
          debugger; //if this is ok, then we can remove the length check
        newStamps.push(...this.#stamps.splice(0, a.length));
      } else if (b.length) {
        const cs = b.map(_ => document.createComment("::,"));
        const stamps = cs.map((c, i) => new Stamp(c, b[i]));
        (this.#stamps[0]?.start ?? this.#end).before(...cs);
        newStamps.push(...stamps);
        unFulfilled.push(...stamps);
      } else if (a.length) {
        //make Stamps reusable, ie. add .last to mark the last node belonging to the stamp.
        for (let i = 0; i < a.length; i++)
          this.#stamps[i].last = (this.#stamps[i + 1]?.start ?? this.#end).previousSibling;
        filledButNotUsed.push(...this.#stamps.splice(0, a.length));
      }
    }
    this.#newStampsNotFilled = unFulfilled;
    this.#filledStampsNotUsed = filledButNotUsed;
    this.#values = newValues;
    this.#stamps = newStamps;
    return this;
  }
}

const IdenticalValues = (f, r) => f.value === r.value;
const IdenticalInnerArrays = (f, r) => f.value.every((v, i) => typeof v === 'string' || v === r.value[i])

function reuseAndInstantiateIndividualStamps(todos) {
  let globalNotUsed = new Set();
  while (todos.length) {
    //1. get fillable and reusable stamps for stampGroup with outermost Def.
    const Def = todos.map(({ Def }) => Def).reduce((a, b) => a.position > b.position ? a : b);
    const fillables = new Set(), reusables = new Set(), restTodos = [];
    for (let n of todos) {
      if (n.Def === Def) {
        for (let f of n.fillables) fillables.add(f)
        for (let r of n.reusables) reusables.add(r)
        // n.fillables.clear();
        // n.reusables.clear();
      } else {
        restTodos.push(n)
      }
    }
    todos = restTodos;

    //2. fill stamps with reusables with the exact same value.
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalValues))
      fillable.fill(reusable);

    //2b. here we can dig inside globalNotUsed for stamps with the current Def. 
    //    The Def of the stamps can use an innerDefs to filter for relevance more quickly.

    //3. ligthWeight matches all with identical inner arrays. These matches will only change (text, comments, attribute).nodeValue
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalInnerArrays))
      fillable.fill(reusable).hydrate(Def, reusable.value);

    //4. heavyWeight. reuse and hydrate complex mismatches
    for (let { fillable, reusable } of extractMatch(fillables, reusables))
      todos.push(...fillable.fill(reusable).hydrate(Def, reusable.value));

    //5. create new stamp instance and hydrate for the rest
    for (let fillable of fillables)
      todos.push(...fillable.fill(getInstance(Def)).hydrate(Def));

    globalNotUsed = globalNotUsed.union(reusables);
  }

  for (let { start, last } of globalNotUsed)
    removeNodes(start.nextNode, last);
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
  const todos = stampGroups.map(g => g.update(renderDefValues(state, g.Def))).filter(Boolean);
  reuseAndInstantiateIndividualStamps(todos);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
