import { getDefinition, findRunnableTemplates, getInstance } from "./DD7.js";
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

function addNodesSmartly(removeables, aStart, aEnd, bStart, bEnd) {
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
    for (let t = a.previousSibling, next = b, nextNext; next != bEnd; next = nextNext) {
      nextNext = next.nextSibling;
      t.after(next);
      t = next;
    }
    return;
  }
  //5. there are differences after the head of identicals. we just need to add all the b side nodes.
  let t;
  for (t = a.previousSibling, next = b, nextNext; next != bEnd; next = nextNext) {
    nextNext = next.nextSibling;
    t.after(next);
    t = next;
  }
  return removeables.push([t, aEnd]);
}

function swapStartEnd(reuseTask, nowTask) {
  reuseTask.start.nextSibling.before(nowTask.start);
  reuseTask.end.previousSibling.after(nowTask.end);
  reuseTask.start = nowTask.start;
  reuseTask.end = nowTask.end;
}

function reuse(todo, reusables) {
  const nextReusables = {};
  const removeables = [];
  while (todo.length) {
    //extract the first topLevel task Def, that is a Def that is NEVER inside another Def.
    const topDef = todo.find(task => todo.every(t2 => !t2.intro.includes(task.Def.id))).Def;
    //get all the tasks with this DefType. We run all DefTypes in one go.
    const nowTasks = todo.filter(({ Def }) => Def === topDef);
    todo = todo.filter(t => !nowTasks.includes(t));

    const thisDefReusables = reusables[topDef.id] ??= {};
    const nextDefReusables = nextReusables[topDef.id] = {};
    //1. do the superExact reusables where the .start and .key are both the same.
    const remainingTasks2 = [];
    for (let nowTask of nowTasks) {
      const superExactReusables = thisDefReusables[nowTask.key];
      const i = superExactReusables?.findIndex(reTask => reTask.start === nowTask.start);
      if (i >= 0) {
        (nextDefReusables[nowTask.key] ??= []).push(superExactReusables.splice(i, 1)[i]);
      } else {
        remainingTasks2.push(nowTask);
      }
    }
    const remainingTasks = [];
    //2. do the exact reusables where the content is the same, but the .start is different.
    for (let nowTask of remainingTasks2) {
      const exactReusables = thisDefReusables[nowTask.key];
      if (!exactReusables?.length) {
        remainingTasks.push(nowTask);
      } else {
        const reuseTask = exactReusables.pop();
        swapStartEnd(reuseTask, nowTask);
        (nextDefReusables[nowTask.key] ??= []).push(reuseTask);
      }
    }

    const partialAndNewTemplates = Object.values(thisDefReusables).flat();
    // todo, here we are reusing a partial. 
    // That means that potentially have a lot of innerTemplates that we would like to reuse.
    // we only care about the innerTemplates that are Defs.
    for (let partial of partialAndNewTemplates) {
      for (let i = 0; i < partial.value.length; i++) {
        const value = partial.value[i];
        const h = i % partial.innerHydras.length;
        const inner = partial.innerHydras[h];
        if (inner.Def) {
          const key = JSON.stringify(inner.value);
          reusables[inner.Def.id] ??= {};
          reusables[inner.Def.id][key] ??= [];
          reusables[inner.Def.id][key].push(inner);
        }
      }
    }
    while (partialAndNewTemplates.length < remainingTasks.length)
      partialAndNewTemplates.push(getInstance(topDef));

    for (let i = 0; i < partialAndNewTemplates.length; i++) {
      const partialNew = partialAndNewTemplates[i];
      const nowTask = remainingTasks[i];
      addNodesSmartly(removeables, nowTask.start, nowTask.end, partialNew.start, partialNew.end);
      nowTask.innerHydras = partialNew.innerHydras;
      (nextDefReusables[nowTask.key] ??= []).push(nowTask);
      for (let i = 0; i < nowTask.innerHydras.length; i++) {
        const value = nowTask.value[i];
        const innerTask = nowTask.innerHydras[i];
        if (!innerTask.Def) {
          if (innerTask.node.nodeValue !== value)
            innerTask.node.nodeValue = value;
        } else
          //todo i think that this is correct.
          todo.push({ Def: innerTask.Def, value, intro: nowTask.intro + "|" + nowTask.Def.id, key: JSON.stringify(value) })
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
