import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";
import { diffRaw as diff } from "https://cdn.jsdelivr.net/gh/orstavik/making-a@25.09.12/difference.js";

const tupleMap = {};
const tuplify = (obj) => tupleMap[JSON.stringify(obj)] ??= obj;

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

  fillFresh(Def) {
    const { start, end, innerHydras } = getInstance(Def);
    const nodes = innerHydras.map(({ Def, hydra, node }) => ({ start: node, end: Def ? node.nextSibling : undefined }));
    return this.fillAndHydrate({ start, last: end.previousSibling, nodes }, Def);
  }

  fillAndHydrate(otherStamp, Def) {
    this.fill(otherStamp);
    const res = [];
    for (let i = 0; i < this.#nodes.length; i++) {
      const { Def: insideDef, hydra } = Def.innerHydras[i];
      const { start, end } = this.#nodes[i];
      const value = this.#value?.[i];
      const oldValue = otherStamp.value?.[i];
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
    let target = this.#start;
    for (let n = reusable.start.nextSibling, nextNode; true; n = nextNode) {
      nextNode = n.nextSibling;
      target.after(n);
      target = n;
      if (n == reusable.last)
        break;
    }
    reusable.start.remove();  //it doesn't matter if the start is connected or not..
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

function* extractIfMatch(fillables, reusables, test) {
  for (let fillable of fillables) {
    for (let reusable of reusables) {
      if (!test || test(fillable, reusable)) {
        fillables.delete(fillable);
        reusables.delete(reusable);
        yield { fillable, reusable };
        break;
      }
    }
  }
}

function reuseAndInstantiateIndividualStamps(changedStampGroups) {
  let globalNotUsed = new Set();
  while (changedStampGroups.length) {
    //1. get fillable and reusable stamps for stampGroup with outermost Def.
    const Def = changedStampGroups.map(({ Def }) => Def).reduce((a, b) => a.position > b.position ? a : b);
    const fillables = new Set(), reusables = new Set(), restStampGroups = [];
    for (let n of changedStampGroups) {
      if (n.Def === Def) {
        for (let f of n.fillables) fillables.add(f)
        for (let r of n.reusables) reusables.add(r)
        // n.fillables.clear();
        // n.reusables.clear();
      } else {
        restStampGroups.push(n)
      }
    }
    changedStampGroups = restStampGroups;

    //2. fill stamps with reusables with the exact same value.
    for (let { fillable, reusable } of extractIfMatch(fillables, reusables, (f, r) => f.value === r.value))
      fillable.fill(reusable);

    //2b. here we can dig inside globalNotUsed for stamps with the current Def. 
    //    The Def of the stamps can use an innerDefs to filter for relevance more quickly.

    // 1) to match the reusables and fillables on them *only* changing text and comment nodes. They are super lightweight.
    // 2) then we want to match changes that only change attribute values.
    // 3) then we want to match changes that only remove or add nodes inside.
    // 4) then we want to match changes that does as little as possible changes inside their inner templateStamps.
    // * we should be able to see this just by looking at the signature of the values. If their inner arrays are the same, then we null that.

    //4. reuse and hydrate complex different groups
    for (let { fillable, reusable } of extractIfMatch(fillables, reusables))
      changedStampGroups.push(...fillable.fillAndHydrate(reusable, Def));

    //5. create new stamp instance and hydrate for the rest
    for (let fillable of fillables)
      changedStampGroups.push(...fillable.fillFresh(Def));

    globalNotUsed = globalNotUsed.union(reusables);
  }

  for (let stamp of globalNotUsed) {
    for (let n = stamp.start, next; n != stamp.last; n = next)
      next = n.nextSibling, n.remove();
    stamp.last.remove();
  }
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
  const changes = stampGroups.map(g => g.update(renderDefValues(state, g.Def))).filter(Boolean);
  reuseAndInstantiateIndividualStamps(changes);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
