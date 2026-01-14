import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

function getInstance2(Def) {
  const instance = getInstance(Def);
  instance.nodes = [...instance.nodes];
  return instance;
}

//1. create a DefValuesPath tree for a Def+state
function renderValues(state, Def, intro = "") {
  const $ = Object.assign({}, state);
  const values = [];
  Def.hydra($, function run() {
    for (let { Def: D2, hydra } of Def.innerHydras)
      values.push(D2 ? renderValues($, D2, intro + "|" + Def.id) : hydra($));
  });
  return { Def, values, intro, key: JSON.stringify(values) };
}

function reuse(todo, reusables) {
  const nextReusables = {};
  while (todo.length) {
    //extract the first topLevel task Def, that is a Def that is NEVER inside another Def.
    const topDef = todo.find(task => todo.every(t2 => !t2.intro.includes(task.Def.id))).Def;
    //get all the tasks with this DefType. We run all DefTypes as one.
    const nowTasks = todo.filter(({ Def }) => Def == topDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    const thisDefReusables = reusables[topDef.id] ??= {};
    const nextDefReusables = nextReusables[topDef.id] = {};
    const remainingTasks = [];
    for (let nowTask of nowTasks) {
      const hasReusableNodeList = thisDefReusables[nowTask.key]?.length;
      if (hasReusableNodeList) {
        const reuseTask = thisDefReusables[nowTask.key].shift();
        nowTask.nodes = reuseTask.nodes;
        (nextDefReusables[nowTask.key] ??= []).push(reuseTask);
      } else {
        remainingTasks.push(nowTask);
      }
    }

    const partialAndNewTemplates = Object.values(thisDefReusables).flat();
    while (partialAndNewTemplates.length < remainingTasks.length)
      partialAndNewTemplates.push(getInstance2(topDef));

    for (let i = 0; i < partialAndNewTemplates.length; i++) {
      const partialNew = partialAndNewTemplates[i];
      const nowTask = remainingTasks[i];
      nowTask.nodes = partialNew.nodes;
      nowTask.innerHydras = partialNew.innerHydras.map((nDh, i) => ({ ...nDh, value: nowTask.values[i] }));
      // delete nowTask.values;
      (nextDefReusables[nowTask.key] ??= []).push(nowTask);
      //todo here, we could actually get all the nodes between start and end..
      for (let i = 0; i < nowTask.innerHydras.length; i++) {
        const { node, Def, value } = nowTask.innerHydras[i];
        if (!Def)
          node.nodeValue = value;
        else {
          todo.push({ Def, values: value, intro: nowTask.intro + "|" + Def.id });
        }
      }
    }
  }
  return nextReusables;
}

function attachNewElements(tasks) {
  const used = new Set();
  const maybeRemove = new Set();
  for (let task of tasks) {
    const { start, end, nodes } = task;
    for (let n = start.nextSibling; n != end; n = n.nextSibling)
      if (!nodes.includes(n))
        maybeRemove.add(n);
    for (let n of nodes)
      used.add(n);
    start.after(...nodes);
    //how do i go into inner tasks?
  }
  for (let n of maybeRemove)
    if (!used.has(n))
      n.remove();
}

let reusables = {};
export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  const runnables = [...findRunnableTemplates(root)];
  //1. we run just the data operations, in full. This produces a Tree of Def/values. We are now done with both $state and hydras. They are turned into list of values.
  const defValuesPath = runnables.map(t => renderValues(state, getDefinition(t.id)));
  //todo check if there is no change since last.
  //2. Merge defValuesPath with runnables to link the start/end anchor with the values.
  const defValuesPathWithStartEnd = defValuesPath.map((dvp, i) => ({ ...dvp, ...runnables[i] }));
  reusables = reuse(defValuesPathWithStartEnd, reusables);
  //3. now all the nodes are mapped in the defValuesPathWithStartEnd.
  //   we then update the DOM
  attachNewElements(defValuesPathWithStartEnd);
  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}


// const setDefNodes = (map, defKey, valuesKey, nodes) => 
//   ((map[defKey] ??= {})[valuesKey] ??= []).push(nodes);
// const readAndRemove = (map, defKey, valuesKey) => 
//   map[defKey]?.[valuesKey]?.shift();

