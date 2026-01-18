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

class FreshStampInstance {
  #nodes;
  #start;
  #end;
  #value = [];
  constructor(Def) {
    const { start, end, innerHydras } = getInstance(Def);
    this.#nodes = innerHydras.map(({ Def, hydra, node }) => ({ start: node, end: Def ? node.nextSibling : undefined }));
    this.#start = start;
    this.#end = end;
  }
  get start() { return this.#start; }
  get end() { return this.#end; }
  get nodes() { return this.#nodes; }
  get value() { return this.#value; }
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
  set value(v) { this.#value = v; }

  fillAndHydrate(otherStamp) {
    this.fill(otherStamp);
    const res = [];
    for (let i = 0; i < this.#value.length; i++) {
      const { Def, hydra } = this.#group.Def.innerHydras[i];
      const { start, end } = this.#nodes[i];
      const value = this.#value[i];
      const oldValue = otherStamp.value[i];
      if (oldValue != value) {
        if (Def) {
          let stampGroup = start.stampGroup;
          if (!stampGroup)
            stampGroup = StampGroup.make(Def, [], start, end);
          const change = stampGroup.update(value);
          if (change)
            res.push(change);
        } else
          start.nodeValue = value;
      }
    }
    return res;
  }

  fill(otherStamp) {
    if (this.#nodes)
      throw new Error("Stamp can only be filled once");
    this.#nodes = otherStamp.nodes;
    let target = this.#start;
    for (let n = otherStamp.start.nextSibling, nextNode; n != otherStamp.end; n = nextNode) {
      nextNode = n.nextSibling;
      target.after(n);
      target = n;
    }
  }

  removeMe() {
    this.#group.removeStamp(this);
  }
}

class StampGroup {
  #values;
  #stamps;
  #Def;
  #newStampsNotFilled;
  #filledStampsNotUsed;
  #end;

  getEndNode(stamp) {
    return this.#stamps[this.#stamps.indexOf(stamp) + 1]?.start ?? this.#end;
  }

  get fillables() { return this.#newStampsNotFilled }
  get reusables() { return this.#filledStampsNotUsed }
  get Def() { return this.#Def; }

  static make(Def, values, ...commas) {
    const n = new StampGroup();
    n.#Def = Def;
    n.#values = values;
    n.#end = commas.pop();
    n.#stamps = commas.map(c => new Stamp(n, c));
    commas[0].stampGroup = n; //todo this is spaghettish..
    return n;
  }

  injectStamp(pos, value) {
    if (pos == 0 && !this.#values.length) {
      this.#stamps[0].value = value;
      return this.#stamps[0];
    }
    const oldComment = this.#stamps[pos]?.start ?? this.#end;
    const newComment = document.createComment("::,");
    oldComment.before(newComment);
    if (pos == 0) {
      newComment.nodeValue = oldComment.nodeValue;
      oldComment.nodeValue = "::,";
      newComment.stampGroup = this;
      oldComment.stampGroup = null;
    }
    const newStamp = new Stamp(this, newComment, value);
    this.#stamps.splice(pos, 0, newStamp);
    return newStamp;
  }

  removeStamp(stamp) {
    const pos = this.#stamps.indexOf(stamp);
    const endComment = this.#stamps[pos + 1]?.start ?? this.#end;
    for (let n = stamp.start, next; n != endComment; n = next) {
      next = n.nextSibling;
      n.remove();
    }
    this.#stamps.splice(pos, 1);
  }

  update(newValues) {
    if (this.#values == newValues)
      return;
    const unFulfilled = [], filledButNotUsed = [];
    const diffs = diff(this.#values, newValues);
    for (let d = 0, a = 0; d < diffs.length; d++) {
      const { type, x, y, i } = diffs[d]; //i is the number of x or y we need to add.
      if (type == "match") {
        ; //do nothing
      } else if (type == "ins") {
        for (let c = 0; c < i; c++)
          unFulfilled.push(this.injectStamp(a + c, newValues[y + c]));
      } else if (type == "del") {
        for (let c = 0; c < i; c++)
          filledButNotUsed.push(this.#stamps[a + c]);
      }
      a += i;
    }
    this.#newStampsNotFilled = unFulfilled;
    this.#filledStampsNotUsed = filledButNotUsed;
    this.#values = newValues;
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
    const cleanUp = new Set(reusables);

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
        const stampGroups = fillable.fillAndHydrate(reusable);
        changedStampGroups.push(...stampGroups);
        fillables.delete(fillable);
        reusables.delete(reusable);
        continue reuseIt;
      }
    }

    //4b. here we can try to dig inside globalNotUsed for stamps with the current Def. 
    //    The Def of the stamps can use an innerDefs to filter for relevance more quickly.

    //5. create new stamp instance and hydrate
    for (let fillable of fillables) {
      const fresh = new FreshStampInstance(fillable.Def); //Def == fillable.Def
      const stampGroups = fillable.fillAndHydrate(fresh);
      changedStampGroups.push(...stampGroups);
      fillables.delete(fillable);
    }

    for (let stamp of cleanUp.difference(reusables))
      stamp.removeMe();
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
      stampGroups.push(StampGroup.make(getDefinition(id), [], start, end));
    rootStampGroups.set(root, stampGroups);
  }
  const changes = stampGroups.map(g => g.update(renderDefValues(state, g.Def))).filter(Boolean);
  reuseAndInstantiateIndividualStamps(changes);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
