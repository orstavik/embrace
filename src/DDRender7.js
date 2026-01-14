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

function addNodesSmartly(removeables, aStart, aEnd, bStart, bEnd, nodes) {
  if (!bStart) {
    const last = nodes.at(-1);
    aStart.after(...nodes);
    return last.nextSibling != aEnd ? removeables.push([last, aEnd]) : undefined;
  }
  if (aStart === bStart) //&& aEnd === bEnd
    return;
  //1. while the head of the list of nodes are the same, then we just spool
  let a = aStart.nextSibling, b = bStart.nextSibling;
  while (a === b && a != aEnd) {
    a = a.nextSibling;
    b = b.nextSibling;
  }
  //2. lists were identical
  if (a === aEnd && b === bEnd)
    return;
  //3. identical, but b was shorter than a, so we might need to remove nodes.
  if (b === bEnd)
    return removeables.push([a.previousSibling, aEnd]);
  //4. identical, but a was shorter than b, so we add nodes.
  if (a === aEnd) {
    a = a.previousSibling;
    for (; b != bEnd; b = b.nextSibling) {
      a.after(b);
      a = b;
    }
    return;
  }
  //5. there are differences after the head of identicals. we just need to add all the b side nodes.
  let t;
  for (t = a.previousSibling; b != bEnd; b = b.nextSibling, t = b)
    t.after(b);
  return removeables.push([t, aEnd]);
}

function reuse(todo, reusables) {
  const nextReusables = {};
  const removeables = [];
  while (todo.length) {
    //extract the first topLevel task Def, that is a Def that is NEVER inside another Def.
    const topDef = todo.find(task => todo.every(t2 => !t2.intro.includes(task.Def.id))).Def;
    //get all the tasks with this DefType. We run all DefTypes in one go.
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
        debugger
        addNodesSmartly(removeables, nowTask.start, nowTask.end, reuseTask.start, reuseTask.end);
        (nextDefReusables[nowTask.key] ??= []).push(reuseTask);
      } else {
        remainingTasks.push(nowTask);
      }
    }

    const partialAndNewTemplates = Object.values(thisDefReusables).flat();
    while (partialAndNewTemplates.length < remainingTasks.length) {
      //todo here it looks like we can wrap the nodes with a start and end comment instead??
      const instance = getInstance(topDef); 
      instance.nodes = [...instance.nodes];
      partialAndNewTemplates.push(instance);
    }

    for (let i = 0; i < partialAndNewTemplates.length; i++) {
      const partialNew = partialAndNewTemplates[i];
      const nowTask = remainingTasks[i];
      nowTask.nodes = partialNew.nodes;
      addNodesSmartly(removeables, nowTask.start, nowTask.end, partialNew.start, partialNew.end, partialNew.nodes);
      nowTask.innerHydras = partialNew.innerHydras.map((nDh, i) => ({ ...nDh, value: nowTask.value[i] }));
      // delete nowTask.values;
      (nextDefReusables[nowTask.key] ??= []).push(nowTask);
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
  return { nextReusables, removeables };
}

let reusables = {};
export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  const runnables = [...findRunnableTemplates(root)];
  const defValuesPath = runnables.map(t => renderValues(state, getDefinition(t.id)));
  const defValuesPathWithStartEnd = defValuesPath.map((dvp, i) => ({ ...dvp, ...runnables[i] }));
  const { nextReusables, removeables } = reuse(defValuesPathWithStartEnd, reusables);
  for (let [last, end] of removeables)
    for (let next = last.nextSibling; next != end; next = next.nextSibling)
      next.remove();
  reusables = nextReusables;
  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
