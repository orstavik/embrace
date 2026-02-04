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
  #group;
  #start;
  #value;
  #nodes;

  constructor(group, start, value) {
    this.#group = group;
    this.#start = start;
    this.#value = value;
  }

  get start() { return this.#start; }
  get end() { return this.#group.getEndNode(this); }
  get Def() { return this.#group.Def; }
  get value() { return this.#value; }
  get nodes() { return this.#nodes; }
  set value(v) { this.#value = v; }

  fillFresh() {
    const { start, end, innerHydras } = getInstance(this.#group.Def);
    const nodes = innerHydras.map(({ Def, hydra, node }) => ({ start: node, end: Def ? node.nextSibling : undefined }));
    return this.fillAndHydrate({ start, last: end.previousSibling, nodes });
  }

  fillAndHydrate(otherStamp) {
    this.fill(otherStamp);
    const res = [];
    for (let i = 0; i < this.#nodes.length; i++) {
      const { Def, hydra } = this.#group.Def.innerHydras[i];
      const { start, end } = this.#nodes[i];
      const value = this.#value?.[i];
      const oldValue = otherStamp.value?.[i];
      if (oldValue != value) {
        if (Def) {
          let stampGroup = start.stampGroup;
          if (!stampGroup)
            stampGroup = StampGroup.make(Def, start, end);

          const change = stampGroup.update(value);
          if (change)
            res.push(change);
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
  #values;
  #stamps = [];
  #Def;
  #newStampsNotFilled;
  #filledStampsNotUsed;
  #end;
  #start;

  getEndNode(stamp) {
    return this.#stamps[this.#stamps.indexOf(stamp) + 1]?.start ?? this.#end;
  }

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
    if (this.#values == newValues || (!this.#values?.length && !newValues?.length))
      return;
    const unFulfilled = [], filledButNotUsed = [], newStamps = [];
    const diffs = diff(this.#values ?? [], newValues ?? []);
    //x is the position in newValues, i is the number of matches/ins/dels.
    for (let x of diffs) {
      const { a, b } = x;
      if (b.length == a.length) {
        if (a == b)
          debugger; //if this is ok, then we can remove the length check
        newStamps.push(...this.#stamps.splice(0, a.length));
      } else if (b.length) {
        const cs = b.map(_ => document.createComment("::,"));
        const stamps = cs.map((c, i) => new Stamp(this, c, b[i]));
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
    // const cleanUp = new Set(reusables);

    //3. for all stamps with same value, move nodes
    fillIt: for (let fillable of fillables) {
      for (let reusable of reusables) {
        if (fillable.value === reusable.value) {
          fillable.fill(reusable);
          fillables.delete(fillable);
          reusables.delete(reusable);
          continue fillIt;
        }
      }
    }

    //4. reuse and hydrate as many as possible
    reuseIt: for (let reusable of reusables) {
      //todo here we can try to match fillables and reusables to find matches that only differ in text nodes, 
      // todo we want 1) to match the reusables and fillables on them *only* changing text and comment nodes. They are super lightweight.
      // 2) then we want to match changes that only change attribute values.
      // 3) then we want to match changes that only remove or add nodes inside.
      // 4) then we want to match changes that does as little as possible changes inside their inner templateStamps.
      // * we should be able to see this just by looking at the signature of the values. If their inner arrays are the same, then we null that.
      // * we should do this in iterator way. Same as 1/3/4 is doing.
      for (let fillable of fillables) {
        changedStampGroups.push(...fillable.fillAndHydrate(reusable));
        fillables.delete(fillable);
        reusables.delete(reusable);
        continue reuseIt;
      }
    }

    //4b. here we can try to dig inside globalNotUsed for stamps with the current Def. 
    //    The Def of the stamps can use an innerDefs to filter for relevance more quickly.

    //5. create new stamp instance and hydrate for the rest
    for (let fillable of fillables)
      changedStampGroups.push(...fillable.fillFresh());

    globalNotUsed = globalNotUsed.union(reusables);
  }

  for (let stamp of globalNotUsed)
    stamp.removeMe();
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
