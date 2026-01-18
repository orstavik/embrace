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
  get Def() { return this.#group.Def; }
  set value(v) { this.#value = v; }

  hydrate(newValue) {
    if (this.#value == newValue)
      return;
    const res = [];
    for (let i = 0; i < newValue.length; i++) {
      const { Def, hydra } = this.#group.Def.innerHydras[i];
      const node = this.#nodes[i];
      const value = this.#value[i];
      const newValue = newValue[i];
      if (newValue == value);
      else if (Def) res.push(StampGroup.make(Def, node, value, newValue));
      else node.nodeValue = newValue;
    }
    return res;
  }

  fill(start, end, nodes, values) {
    if (this.#nodes)
      throw new Error("Stamp can only be filled once");
    this.#nodes = nodes;
    this.#value = values;
    let target = this.#start;
    for (let n = start.nextSibling, nextNode; n != end; n = nextNode) {
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

  get fillables() { return this.#newStampsNotFilled }
  get reusables() { return this.#filledStampsNotUsed }
  get Def() { return this.#Def; }

  static make(Def, values, ...commas) {
    const n = new StampGroup();
    n.#Def = Def;
    n.#values = values;
    n.#end = commas.pop();
    n.#stamps = commas.map(c => new Stamp(n, c));
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
    const newStamp = new Stamp(this, value, newComment);
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
  const atTheEndNotReused = new Set();
  const mustBeCleanedUp = new Set();
  while (changedStampGroups.length) {
    //1. get fillable and reusable stamps for stampGroup with outermost Def.
    const Def = changedStampGroups.map(({ Def }) => Def).reduce((a, b) => a.position > b.position ? a : b);
    const fillables = new Set(), reusables = new Set(), restStampGroups = [];
    for (let n of changedStampGroups) {
      if (n.Def === Def) {
        for (let f of n.fillables) fillables.add(f)
        for (let r of n.reusables) reusables.add(r)
      } else {
        restStampGroups.push(n)
      }
    }
    changedStampGroups = restStampGroups;
    for (let n of reusables)
      mustBeCleanedUp.add(n.Def);

    //3. for all stamps with same value, move nodes
    fillIt: for (let fillable of fillables) {
      for (let reusable of reusables) {
        if (fillable.value === reusable.value) {
          debugger;
          fillable.consume(reusable);
          fillables.delete(fillable);
          reusables.delete(reusable);
          continue fillIt;
        }
      }
    }

    //4. reuse and hydrate as many as possible
    reuseIt: for (let reusable of reusables) {
      for (let fillable of fillables) {
        fillable.consume(reusable);
        const stampGroups = fillable.hydrate();
        changedStampGroups.push(...stampGroups);
        fillables.delete(fillable);
        reusables.delete(reusable);
        continue reuseIt;
      }
    }

    //4b. here we can try to dig inside the other branches 
    //    to see if we can find a stamp group with the given Def that we might try to reuse from.

    //5. create new stamp instance and hydrate
    for (let fillable of fillables) {
      const fresh = getInstance(Def);
      fillable.consume(fresh);
      const stampGroups = fillable.hydrate();
      changedStampGroups.push(...stampGroups);
      fillables.delete(fillable);
    }

    for (let notReusedStamp of reusables)
      atTheEndNotReused.add(notReusedStamp.Def);
  }

  for (let stamp of mustBeCleanedUp)
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
  debugger
  const changes = stampGroups.map(g => g.update(renderDefValues(state, g.Def))).filter(Boolean);

  reuseAndInstantiateIndividualStamps(changes);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
