import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

//att!! assumes that arrayWithValues has already been unified.
class ReuseMap {

  //Def => {valuesArrayOfArraysAsKey => [...reusableInstances]}
  //Def => {valuesArrayAsKey => [...reusableInstances]}
  #prevMap = new Map();
  #nextMap = new Map();

  flip() {
    this.#prevMap = this.#nextMap;
    this.#nextMap = new Map();
  }

  put(a, b, v) {
    let group = this.#nextMap.get(a);
    if (!group)
      this.#nextMap.set(a, group = new Map());
    let set = group.get(b);
    if (!set)
      group.set(b, set = new Set());
    set.add(v);
  }

  reuseMatch(a, b, matcher) {
    const set = this.#prevMap.get(a)?.get(b);
    if (set)
      for (let v of set)
        if (matcher(v)) {
          set.delete(v);
          this.put(a, b, v);
          return v;
        }
  }

  reuseAny(a, b) {
    const set = this.#prevMap.get(a)?.get(b);
    if (!set)
      return;
    set.delete(b);
    this.put(a, b, set);
    return set;
  }

  pop(a) {
    const topMap = this.#prevMap.get(a);
    if (!topMap)
      return;
    const next = topMap.entries().next();
    if (next.done)
      return;
    const [k, v] = next.value;
    topMap.delete(k);
    return v;
  }

  breakUpValuesIntoPieces(a) {
    const topMap = this.#prevMap.get(a);
    if (!topMap)
      return;
    debugger
    const values = topMap.values();
    // const allTheGroupsSet = new Set([...topMap.values()]);
    //1.  
  }
}

const tupleMap = {};
const tuplify = (obj) => tupleMap[JSON.stringify(obj)] ??= obj;

function renderValues(state, Def, intro = "") {
  const $ = Object.assign(state instanceof Array ? [] : {}, state);
  const values = [];
  Def.hydra($, function run() {
    const innerValues = Def.innerHydras.map(({ Def: D2, hydra }) =>
      D2 ? renderValues($, D2, intro + "|" + Def.id) : hydra($));
    values.push(tuplify(innerValues));
  });
  return { values: tuplify(values), intro };
  //todo if i can get the intro out in a separate channel, then we are much better positioned.
}

function reuse(todo, reusables) {
  const removeables = [];
  while (todo.length) {
    //extract the first topLevel task Def, that is a Def that is NEVER inside another Def.
    const topDef = todo.find(task => todo.every(t2 => !t2.intro.includes(task.Def.id))).Def;
    //get all the tasks with this DefType. We run all DefTypes in one go.
    const nowTasks = todo.filter(({ Def }) => Def === topDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    debugger
    //1. superExact reusables: identical values and identical .start comment, 
    //   ie. no replacement necessary as the reusable is already in the right place.
    const nowTasks2 = nowTasks.filter(nowTask =>
      !reusables.reuseMatch(topDef, nowTask.values, reTask => reTask.start === nowTask.start));

    //2. exact value match: identical values, but positioned elsewhere in the DOM.
    //   we must move the reusable to the new position.
    const nowTasks3 = [];
    for (let nowTask of nowTasks2) {
      const reuseTask = reusables.reuseAny(topDef, nowTask.values);
      reuseTask ?
        inject(nowTask.start, reuseTask.start.nextSibling, reuseTask.end.previousSibling) :
        nowTasks3.push(nowTask);
    }

    //3. we can do a partial reuse. Here we need to break up the values array into 
    //   this is a specialized operation. We need to take the values array and break it up into chunks.
    //   this essentially needs to spool the childNodes and find the `::,` comments.
    //   
    reusables.breakUpValuesIntoPieces(topDef);

    //1. prep nowTask comments and instances arrays
    for (let nowTask of nowTasks3) {
      nowTask.comments = [
        nowTask.start,
        ...Array(nowTask.values.length - 1).fill(document.createComment("::,")),
        nowTask.end
      ];
      nowTask.instances = Array(nowTask.values.length);
    }

    //2. reuse exact
    debugger
    for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        const value = nowTask.values[i];
        const reuseExact = reusables.reuseAny(topDef, value);
        if (reuseExact) {
          const start = nowTask.comments[i];
          const end = nowTask.comments[i + 1];
          nowTask.instances[i] = reuseExact;
          start.after(reuseExact.start.nextSibling);
          end.before(reuseExact.end.previousSibling);
          reuseExact.start = start;
          reuseExact.end = end;
          //todo It feels unsafe to have the reuseExact remember the new task. 
          //     I think it should be different.
          //     It feels like the nowTask should be added to the reusables.
        }
      }
    }

    //3. reuse partial
    main: for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        if (nowTask.instances[i]) continue;
        const value = nowTask.values[i];
        const reusePartial = reusables.pop(topDef); //this is an instance, so i should have access to nodes here
        if (!reusePartial) {
          break main;
        }
        nowTask.instances[i] = reusePartial;
        nowTask.comments[i].after(reusePartial.start.nextSibling);
        nowTask.comments[i + 1].before(reusePartial.end.previousSibling);
        for (let k = 0; k < reusePartial.nodes.length; k++) {
          const { Def, node } = reusePartial.nodes[k];
          const innerValue = value[k];
          if (Def) {
            todo.push({ Def, value: innerValue, start: nowTask.comments[i], end: nowTask.comments[i + 1] });
          } else if (innerValue != node.nodeValue) {
            node.nodeValue = innerValue;
          }
        }
      }
    }

    //4. create new
    for (let nowTask of nowTasks3) {
      for (let i = 0; i < nowTask.values.length; i++) {
        if (nowTask.instances[i]) continue;
        const start = nowTask.comments[i];
        const end = nowTask.comments[i + 1];
        const newInstance = getInstance(topDef);
        nowTask.instances[i] = newInstance;
        start.after(newInstance.start.nextSibling);
        end.before(newInstance.end.previousSibling);
        newInstance.start = start;
        newInstance.end = end;
        for (let k = 0; k < newInstance.innerHydras.length; k++) {
          const { Def, node } = newInstance.innerHydras[k];
          const innerValue = nowTask.values[i][k];
          if (Def) {
            todo.push({ Def, values: innerValue.values, start, end });
          } else {
            node.nodeValue = innerValue;
          }
        }
      }
    }
  }
  return removeables;
}

const reusables = new ReuseMap();
export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);

  const valueInstances = [];
  for (let t of findRunnableTemplates(root)) {
    t.Def = getDefinition(t.id);
    const dvp = renderValues(state, t.Def);
    Object.assign(dvp, t);
    valueInstances.push(dvp);
  }

  reusables.flip();
  const removeables = reuse(valueInstances, reusables);
  for (let [last, end] of removeables)
    for (let next = last.nextSibling; next != end; next = next.nextSibling)
      next.remove();

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
