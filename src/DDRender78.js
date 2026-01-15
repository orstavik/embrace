import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

//att!! assumes that arrayWithValues has already been unified.
//Def => {valuesArrayOfArraysAsKey => [...reusableInstances]}
//Def => {valuesArrayAsKey => [...reusableInstances]}
class ReuseMap {

  #map = new Map();

  //deep remember. This is a point for optimization.
  remember(a) {
    const Def = a.Def;
    const values = a.values;
    this.put(Def, values, a);
    for (let i = 0; i < a.instances.length; i++) {
      const instance = a.instances[i];
      const value = a.values[i];
      if (instance)
        this.put(Def, value, instance);
    }
  }

  put(a, b, v) {
    let group = this.#map.get(a);
    if (!group)
      this.#map.set(a, group = new Map());
    let set = group.get(b);
    if (!set)
      group.set(b, set = new Set());
    set.add(v);
  }

  reuseMatch(a, b, matcher) {
    const set = this.#map.get(a)?.get(b);
    if (set)
      for (let v of set)
        if (matcher(v)) {
          set.delete(v);
          return v;
        }
  }

  reuseAny(a, b) {
    const set = this.#map.get(a)?.get(b);
    if (!set)
      return;
    set.delete(b);
    return set;
  }

  pop(a) {
    const topMap = this.#map.get(a);
    if (!topMap)
      return;
    const next = topMap.entries().next();
    if (next.done)
      return;
    const [k, v] = next.value;
    topMap.delete(k);
    return v;
  }
}

const tupleMap = {};
const tuplify = (obj) => tupleMap[JSON.stringify(obj)] ??= obj;

function renderValues(state, Def) {
  const $ = Object.assign(state instanceof Array ? [] : {}, state);
  const values = [];
  Def.hydra($, function run() {
    const innerValues = Def.innerHydras.map(inner =>
      inner.Def ? renderValues($, inner.Def) : inner.hydra($));
    values.push(innerValues);
  });
  return tuplify(values.map(tuplify)); //tuplify self and direct children.
}

function xIsDescendantOf(xDef, otherDef) {
  for (let inner of otherDef.innerHydras)
    if (inner.Def && (inner.Def === xDef || xIsDescendantOf(xDef, inner.Def)))
      return true;
}
function firstDefNotADescendant(tasks) {
  return [...new Set(tasks.map(({ Def }) => Def))]
    .find(def => tasks.every(({ Def }) => !xIsDescendantOf(def, Def)));
}

let reusables = new ReuseMap();
function reuse(todo) {
  todo = todo.filter(({ values }) => values.length);
  const completedTasks = new Set();
  const removeables = [];
  while (todo.length) {
    const topDef = firstDefNotADescendant(todo);
    const nowTasks = todo.filter(({ Def }) => Def === topDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    //1. superExact reusables: identical values and identical .start comment, 
    //   ie. no replacement necessary as the reusable is already in the right place.
    const nowTasks2 = [];
    for (let nowTask of nowTasks) {
      const task = reusables.reuseMatch(topDef, nowTask.values, reTask => reTask.start === nowTask.start);
      if (!task)
        nowTasks2.push(nowTask);
    }

    //2. exact value match: identical values, but positioned elsewhere in the DOM.
    //   we must move the reusable to the new position.
    const nowTasks3 = [];
    for (let nowTask of nowTasks2) {
      const reuseTask = reusables.reuseAny(topDef, nowTask.values);
      if (reuseTask) {
        inject(nowTask.start, reuseTask.start.nextSibling, reuseTask.end.previousSibling);
      } else {
        nowTasks3.push(nowTask);
      }
    }

    //3. Reuse run() instances
    //A. prep nowTask with `<!--::,-->` comments and instances arrays
    for (let nowTask of nowTasks3) {
      const commas = Array(nowTask.values.length - 1).fill(document.createComment("::,"));
      nowTask.start.after(...commas);
      nowTask.comments = [nowTask.start, ...commas, nowTask.end];
      nowTask.instances = Array(nowTask.values.length);
    }

    function inBetweens(start, end) {
      const res = [];
      for (let n = start.nextSibling; n != end; n = n.nextSibling)
        res.push(n);
      return res;
    }

    function useInstance(start, end, instance) {
      start.after(...inBetweens(instance.start, instance.end));
      instance.start = start;
      instance.end = end;
      return instance;
    }

    //B. reuse exact run() instance
    for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        if (!nowTask.values[i].length)
          continue;
        const reusable = reusables.reuseAny(topDef, nowTask.values[i]);
        if (reusable)
          nowTask.instances[i] =
            useInstance(nowTask.comments[i], nowTask.comments[i + 1], reusable);
      }
    }

    //C. reuse partial
    main: for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        if (!nowTask.values[i].length)
          continue;
        if (nowTask.instances[i]) continue;
        const value = nowTask.values[i];
        const reusePartial = reusables.pop(topDef); //this is an instance, so i should have access to nodes here
        if (!reusePartial) {
          break main;
        }
        nowTask.instances[i] =
          useInstance(nowTask.comments[i], nowTask.comments[i + 1], reusePartial);
        for (let k = 0; k < reusePartial.innerHydras.length; k++) {
          const { Def, node } = reusePartial.innerHydras[k];
          const innerValue = value[k];
          if (Def && innerValue.length) {
            //todo here we are missing the endNode. This is lost once the reusePartial is filled.
            //i think node is correct, but node.nextSibling is not!
            todo.push({ Def, values: innerValue, start: node, end: node.nextSibling });
          } else if (innerValue != node.nodeValue) {
            node.nodeValue = innerValue;
          }
        }
      }
    }

    //D. create new
    for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        if (nowTask.instances[i]) continue;
        const instance = nowTask.instances[i] =
          useInstance(nowTask.comments[i], nowTask.comments[i + 1], getInstance(topDef));
        const values = nowTask.values[i];
        for (let k = 0; k < instance.innerHydras.length; k++) {
          const { Def, node } = instance.innerHydras[k];
          const innerValue = values[k];
          if (Def && innerValue.length) {
            todo.push({ Def, values: innerValue, start: node, end: node.nextSibling });
          } else {
            node.nodeValue = innerValue;
          }
        }
      }
    }
    //4. add to reusables the tasks that needed internal handling
    for (let nowTask of nowTasks)
      completedTasks.add(nowTask);
  }

  for (let [last, end] of removeables)
    for (let next = last.nextSibling; next != end; next = next.nextSibling)
      next.remove();

  const nextReusables = new ReuseMap();
  for (let task of completedTasks)
    nextReusables.remember(task);
  reusables = nextReusables;
}

export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);

  const tasks = [];
  for (let task of findRunnableTemplates(root)) {
    task.Def = getDefinition(task.id);
    delete task.id;
    task.values = renderValues(state, task.Def);
    tasks.push(task);
  }

  reuse(tasks);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
