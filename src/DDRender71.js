import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

const tupleMap = {};
const tuplify = (obj) => tupleMap[JSON.stringify(obj)] ??= obj;

function renderDefValues(state, Def) {
  const $ = Object.assign(state instanceof Array ? [] : {}, state);
  const values = [];
  Def.hydra($, function run() {
    const innerValues = Def.innerHydras.map(inner =>
      inner.Def ? renderDefValues($, inner.Def) : inner.hydra($));
    values.push(tuplify({ Def, values: innerValues }));
  });
  return values;
}

//todo rename Def to Type?
function firstDefNotADescendant(tasks) {
  for (let { defValue: { Def } } of tasks)
    if (tasks.every(({ defValue: { Def: otherDef } }) => !otherDef.innerDefs.includes(Def)))
      return Def;
}

//att!! assumes that arrayWithValues has already been unified.
class ReuseMap {

  #startToTask = new Map();
  #defValueToTasks = new Map();
  #defToTasks = new Map();

  startIsUnchangedAndRemove({ start, defValue }) {
    const task = this.#startToTask.get(start);
    return task && task.defValue == defValue && this.forget(task);
  }

  sameValueAndDef({ defValue }) {
    const task = this.#defValueToTasks.get(defValue)?.values().next().value;
    return task && this.forget(task);
  }

  pop(def) {
    const task = this.#defToTasks.get(def)?.values().next().value;
    return task && this.forget(task);
  }

  remember(...tasks) {
    for (let task of tasks) {
      this.#startToTask.set(task.start, task);
      let set = this.#defValueToTasks.get(task.defValue);
      !set && this.#defValueToTasks.set(task.defValue, set = new Set());
      set.add(task);
      let defSet = this.#defToTasks.get(task.defValue.Def);
      !defSet && this.#defToTasks.set(task.defValue.Def, defSet = new Set());
      defSet.add(task);
    }
  }

  forget(task) {
    this.#startToTask.delete(task.start);
    this.#defValueToTasks.get(task.defValue)?.delete(task);
    this.#defToTasks.get(task.defValue.Def)?.delete(task);
    return task;
  }
}

function useInstance(task, { start, end, innerHydras }) {
  task.innerHydras = innerHydras;
  const res = [];
  let n;
  for (n = start.nextSibling; n != end; n = n.nextSibling)
    res.push(n);
  task.start.after(...res);
}

let reusables = new ReuseMap();
function reuse(todo) {
  const nextReusables = new ReuseMap();
  const removeables = [];
  while (todo.length) {
    const nowDef = firstDefNotADescendant(todo);
    const nowTasks = todo.filter(({ defValue: { Def } }) => Def === nowDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    //A. reuse superExact run() instance
    const unchanged = nowTasks.filter(t => reusables.startIsUnchangedAndRemove(t));
    nextReusables.remember(...unchanged);
    const nowTasks2 = nowTasks.filter(t => !unchanged.includes(t));

    //B. reuse exact run() instance
    const nowTasks3 = [];
    for (let task of nowTasks2) {
      const reusable = reusables.sameValueAndDef(task);
      if (reusable) {
        useInstance(task, reusable);
        nextReusables.remember(task);
      } else {
        nowTasks3.push(task);
      }
    }
    //C. reuse partial or create new
    for (let task of nowTasks3) {
      const usable = reusables.pop(nowDef) ?? getInstance(nowDef);
      useInstance(task, usable);
      nextReusables.remember(task);
      //rehydrate
      for (let k = 0; k < task.innerHydras.length; k++) {
        const { Def, node } = task.innerHydras[k];
        const innerValue = task.defValue.values[k];
        if (Def && innerValue.length) {
          todo.push(...splitTask(innerValue, node, node.nextSibling));
        } else if (!Def && innerValue != node.nodeValue) {
          node.nodeValue = innerValue;
        }
      }
    }
  }

  //todo we need to find the nodes in reusables that are not forgotten, and then remove them.
  reusables = nextReusables;
}

function splitTask(defValues, start, end) {
  const commas = Array(defValues.length - 1).fill(document.createComment("::,"));
  start.after(...commas);
  const starts = [start, ...commas];
  const ends = [...commas, end];
  return defValues.map((defValue, i) => ({ defValue, start: starts[i], end: ends[i] }));
}

function setupInnerDefs(Def) {
  if (Def.innerDefs)
    return Def.innerDefs;
  let res = [];
  for (let inner of Def.innerHydras)
    if (inner.Def)
      res.push(inner.Def, ...setupInnerDefs(inner.Def));
  return Def.innerDefs = [...new Set(res)];
}

// let rootTasks = [];
export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  const tasks = [];
  for (let task of findRunnableTemplates(root)) {
    const Def = getDefinition(task.id);
    setupInnerDefs(Def);
    //todo this is different when i do it the first time, and when i do it the second time.
    //todo the second time, we already have `<!--::,-->` nodes in the dom.
    const defValues = renderDefValues(state, Def);
    tasks.push(...splitTask(defValues, task.start, task.end));
  }

  reuse(tasks);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
