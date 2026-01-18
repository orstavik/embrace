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
function reuse(todo, removeables) {
  const nextReusables = new ReuseMap();
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
        //todo we need to maybe comma instance from the reusables
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
          const newTasks = splitTask(innerValue, node, node.nextSibling);
          // const { tasks, removeables: newRemoveables } = splitTask(innerValue, node, node.nextSibling);
          todo.push(...newTasks);
          // removeables.push(newRemoveables);
        } else if (!Def && innerValue != node.nodeValue) {
          node.nodeValue = innerValue;
        }
      }
    }
  }
  for (let { start, end } of removeables) {
    const res = [];
    for (; start != end; start = start.nextSibling)
      res.push(start);
    res.push(end);
    res.forEach(n => n.remove());
  }

  reusables = nextReusables;
}

// const news = [start.cloneNode(), ...Array(defValues.length - 1).fill(document.createComment("::,")), end.cloneNode()];
//   start.before(...news);
//   const tasks = defValues.map((defValue, i) => ({ defValue, start: news[i], end: news[i + 1] }));
//   return { tasks, removeables: { start, end } };
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

function setupInitialRootTask(root) {
  const tasks = [];
  for (let { id, commas } of findRunnableTemplates(root)) {
    const Def = getDefinition(id);
    setupInnerDefs(Def);
    tasks.push({ Def, commas, values: [] });
  }
  return { innerHydras: tasks }; //{Def, commas, values, (nextValues)}
}

//only adds comma if needed
//and then splits into tasks
function splitTask2(Def, commas, values, nextValues) {
  if (nextValues.length > (commas.length - 1)) {
    const xtra = Array(nextValues.length - (commas.length - 1)).fill(document.createComment("::,"));
    const end = commas.pop();
    commas.push(...xtra, end);
    end.before(...xtra);
  }
  return nextValues.map((defValue, i) => {
    debugger
    return ({ Def, start: commas[i], end: commas[i + 1], oldValues: values[i], values: defValue })
  });
}

//the cleanup task is different. We need to remember a start+end and commaCount.
//once all is done, then we can delete all the extra commas at the end.
//or. we change the task object during the reuse/render. and then we save that completed task.
//and this completed task, that is what we use to delete the extra commas.
//we can simply spool the output tasks, see how many extra commas there are, and then just move them.
//so, we only add commas inside reuse
const rootToTasks = new WeakMap();
export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  let previousTask = rootToTasks.get(root);
  !previousTask && rootToTasks.set(root, previousTask = setupInitialRootTask(root));

  const nextTopTask = { ...previousTask };
  debugger
  nextTopTask.innerHydras = previousTask.innerHydras.map(({ Def, commas, values }) =>
    splitTask2(Def, commas, values, renderDefValues(state, Def)));
  const didTasks = reuse(nextTopTask.innerHydras);
  //removeNodesNoLongerNeededFromDidTasks

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
