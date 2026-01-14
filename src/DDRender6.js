import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

function renderValues(state, Def, intro = "") {
  const $ = Object.assign({}, state);
  const value = [];
  Def.hydra($, function run() {
    for (let { Def: D2, hydra } of Def.innerHydras)
      value.push(D2 ? renderValues($, D2, intro + "|" + Def.id) : hydra($));
  });
  return { Def, value, intro, key: JSON.stringify(value) };
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
    while (partialAndNewTemplates.length < remainingTasks.length) {
      const instance = getInstance(topDef);
      instance.nodes = [...instance.nodes];
      partialAndNewTemplates.push(instance);
    }

    for (let i = 0; i < partialAndNewTemplates.length; i++) {
      const partialNew = partialAndNewTemplates[i];
      const nowTask = remainingTasks[i];
      nowTask.nodes = partialNew.nodes;
      nowTask.innerHydras = partialNew.innerHydras.map((nDh, i) => ({ ...nDh, value: nowTask.value[i] }));
      // delete nowTask.values;
      (nextDefReusables[nowTask.key] ??= []).push(nowTask);
      //todo here, we could actually get all the nodes between start and end..
      for (let i = 0; i < nowTask.innerHydras.length; i++) {
        const innerTask = nowTask.innerHydras[i];
        if (!innerTask.Def)
          innerTask.node.nodeValue = innerTask.value;
        else {
          todo.push({ ...innerTask, intro: nowTask.intro + "|" + nowTask.Def.id, key: JSON.stringify(innerTask.value) });
        }
      }
    }
  }
  return nextReusables;
}

function addAndRemoveNodes(tasks) {
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
  const defValuesPath = runnables.map(t => renderValues(state, getDefinition(t.id)));
  const defValuesPathWithStartEnd = defValuesPath.map((dvp, i) => ({ ...dvp, ...runnables[i] }));
  reusables = reuse(defValuesPathWithStartEnd, reusables);
  addAndRemoveNodes(defValuesPathWithStartEnd);
  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
