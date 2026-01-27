import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

//att!! assumes that arrayWithValues has already been unified.
//Def => {valuesArrayOfArraysAsKey => [...reusableInstances]}
//Def => {valuesArrayAsKey => [...reusableInstances]}

//Def => values => [...commaLists]
//Def1 => values1 => [[a,a1,a2,a3,a_], [b,b1,b2,b3,b_]]
//then we must also have
//Def1 => values11 => [[a,a1], [b,b1]]
//Def1 => values12 => [[a,a2], [b,b2]]
//Def1 => values13 => [[a,a3], [b,b3]]
//Def1 => values1_ => [[a,a_], [b,b_]]

//and when we use Def1 => values1 and extract [a,a1,a2,a3,a_], then we will at the same time 
//    1. split values1 into values11, values12, values13, values1_
//    2. remove Def1 => values1 => [a,a1]
//    3. remove Def1 => values11 => [a,a1]
//    4. remove Def1 => values12 => [a,a2]
//    5. remove Def1 => values13 => [a,a3]
//    6. remove Def1 => values1_ => [a,a_]
//  * when we remove it, we simply move it into the next reusables map.
//  * we only do this when we have more than two entries in the commaList.

//so, if you have a task that has a Def+values, and this hits such an entry, then we reuse that.
//
class ReuseMap {

  #map = new Map();

  //deep remember. This is a point for optimization.
  remember(a) {
    if (!(a instanceof Task))
      throw new Error("a must be an instance of Task");
    const Def = a.Def;
    const values = a.values;
    this.put(Def, values, a);
    for (let i = 0; i < a.subTasks.length; i++) {
      const instance = a.subTasks[i];
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

class Task {
  start;
  end;
  Def;
  values;
  subTasks;
  static fromRunnables({ start, end, id }, values) {
    if (!values)
      return;
    const task = new Task();
    task.start = start;
    task.end = end;
    task.Def = getDefinition(id);
    task.values = values;
    return task;
  }

  subTaskify() {
    const commas = Array(this.values.length - 1).fill(document.createComment("::,"));
    this.start.after(...commas); //todo here, we can find existing ones in subtasks with reusables.
    const comments = [this.start, ...commas, this.end];
    // this.subTasks = Array(this.values.length);
    return this.values.map((v, i) =>
      ({ start: comments[i], end: comments[i + 1], Def: this.Def, values: v }));
  }
}

function inBetweens(start, end) {
  const res = [];
  for (let n = start.nextSibling; n != end; n = n.nextSibling)
    res.push(n);
  return res;
}

function useInstance(subTask, instance) {
  subTask.start.after(...inBetweens(instance.start, instance.end));
  console.log(instance, subTask);
  return Object.assign(instance, subTask);
}

let reusables = new ReuseMap();
function reuse(todo) {
  const completedTasks = new Set();
  const removeables = [];
  while (todo.length) {
    todo = todo.filter(Boolean);
    if (!todo.length)
      break;
    const topDef = firstDefNotADescendant(todo);
    const nowTasks = todo.filter(({ Def }) => Def === topDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    //1. superExact reusables: identical values and identical .start comment, 
    //   ie. no replacement necessary as the reusable is already in the right place.
    const nowTasks2 = [];
    for (let nowTask of nowTasks) {
      const task = reusables.reuseMatch(topDef, nowTask.values, reTask => reTask.start === nowTask.start);
      //todo we need to update the nowTask here?
      if (!task)
        nowTasks2.push(nowTask);
    }

    //2. exact value match: identical values, but positioned elsewhere in the DOM.
    //   we must move the reusable to the new position.
    const nowTasks3 = [];
    for (let nowTask of nowTasks2) {
      const reuseTask = reusables.reuseAny(topDef, nowTask.values);
      if (reuseTask) {
        //todo we need to update the nowTask here?
        inject(nowTask.start, reuseTask.start.nextSibling, reuseTask.end.previousSibling);
      } else {
        nowTasks3.push(nowTask);
      }
    }

    //3. Reuse run() subTasks
    const subTasks = nowTasks3.flatMap(t => t.subTaskify());

    const subTasks2 = [];
    for (let sub of subTasks) {
      const reusable = reusables.reuseMatch(topDef, sub.values, t => t.start === sub.start);
      if (!reusable)
        subTasks2.push(sub);
    }
    //B. reuse exact run() instance
    const subTasks3 = [];
    for (let sub of subTasks2) {
      const reusable = reusables.reuseAny(topDef, sub.values);
      reusable ?
        useInstance(sub, reusable) :
        subTasks3.push(sub);
    }
    //C. reuse partial or create new
    for (let sub of subTasks3) {
      const reusable = reusables.pop(topDef) ?? getInstance(topDef);
      useInstance(sub, reusable);
      //rehydrate
      for (let k = 0; k < reusable.innerHydras.length; k++) {
        const { Def, node } = reusable.innerHydras[k];
        const innerValue = sub.values[k];
        if (Def && innerValue.length) {
          //todo here we are missing the endNode. This is lost once the reusePartial is filled.
          //i think node is correct, but node.nextSibling is not!
          todo.push(Task.fromRunnables({ id: Def.id, start: node, end: node.nextSibling }, innerValue));
        } else if (innerValue != node.nodeValue) {
          node.nodeValue = innerValue;
        }
      }
    }
    //4. add to reusables the tasks that needed internal handling
    for (let nowTask of nowTasks)
      completedTasks.add(nowTask);
    for (let sub of subTasks)
      completedTasks.add(sub);
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
    tasks.push(Task.fromRunnables(task, renderValues(state, getDefinition(task.id))));
  }

  reuse(tasks);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
