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
// function useInstance(task, { start, end, innerHydras }) {
//   task.innerHydras = innerHydras;
//   const res = [];
//   let n;
//   for (n = start.nextSibling; n != end; n = n.nextSibling)
//     res.push(n);
//   task.start.after(...res);
// }

//finds all the nodes with the outermost Def (ie. Def added the latest to the Def registry)
function extractTopDefNodes(nodes) {
  const Def = nodes.map(({ Def }) => Def).reduce((a, b) => a.position > b.position ? a : b);
  const topNodes = [], otherNodes = [];
  for (let n of nodes)
    n.Def === Def ? topNodes.push(n) : otherNodes.push(n);
  return { Def, topNodes, otherNodes };
}

function reuseInCurrentListPosition(firstNodes) {
  const toBeAdded = [];
  const maybeReusedOrDeleted = [];
  for (let n of firstNodes) {
    const { commas, values, newValues } = n;
    if (values == newValues)
      continue;
    debugger
    const diffs = diff(values, newValues);
    const newCommas = [];
    for (let i = 0, oldI = 0; i < diffs.length; i++) {
      const diff = diffs[i];
      if (diff.type == "match") {
        newCommas.push(commas[oldI]);
        oldI++;
      } else if (diff.type == "ins") {
        const c = document.createComment("::,");
        newCommas.push(c);
        toBeAdded.push(diff.values);
      } else if (diff.type == "del") {
        maybeReusedOrDeleted.push(n);
        oldI++;
      }
    }
  }
  return { toBeAdded, maybeReusedOrDeleted };
}

function moveNodesIfSameValue(toBeAdded, maybeReusedOrDeleted) {
  const notYetDone = [], notYetReused = new Set(maybeReusedOrDeleted);
  for (let newN of toBeAdded) {
    const match = maybeReusedOrDeleted.find(n => n.value == newN.value);
    if (!match) {
      notYetDone.push(newN);
    } else {
      moveContent(newN, match);
      notYetReused.delete(match);
    }
    //moves the nodes from after match to after newN
    //updates the .end value of the old match
  }
  return { notYetDone, notYetReused };
}

function hydrate(node, Def) {
  const newInnerFirstNodes = [];
  for (let i = 0; i < node.newValue.length; i++) {
    const newValue = node.newValue[i];
    const oldValue = node.value[i];
    if (newValue == oldValue) continue; //we don't hydrate if the value is unchanged.
    const innerNode = node.nodes[i];
    const { hydra, Def: innerDef } = Def.innerHydras[i];
    if (innerDef) {
      innerNode.newValue = newValue;
      newInnerFirstNodes.push(innerNode);
    } else {
      innerNode.nodeValue = newValue;
    }
  }
  return newInnerFirstNodes;
}

function reuseNodesOrCreateNewInstancesUsingHydration(Def, nodes, reusableNodes, extras) {
  const innerFirstNodes = [];
  const notUsed = renderDefValues.slice(nodes.length);

  //todo this first part can be done way more efficiently by finding the reusableNodes/extras that *most* resemble the other nodes.
  let i;
  for (i = 0; i <= nodes.length && i <= reusableNodes.length + extras.length; i++) {
    const n = nodes[i];
    const oldN = reusableNodes[i] ?? extras.pop();
    moveContent(n, oldN);
    const newInnerFirstNodes = hydrate(n, Def);
    innerFirstNodes.push(...newInnerFirstNodes);
  }
  for (let i = reusableNodes.length; i < nodes.length; i++) {
    const n = nodes[i];
    const freshInstance = getInstance(Def);
    moveContent(n, freshInstance.start);
    const newInnerFirstNodes = hydrate(n, Def);
    innerFirstNodes.push(...newInnerFirstNodes);
  }
  return { allIsDone: true, innerFirstNodes, notUsed };
}

function extractAllInnerDefNodes(Def, nodes) {
  const extras = [];
  for (let n of nodes) {
    for (let i = 0; i < n.innerHydras.length; i++) {
      const { Def: innerDef } = n.innerHydras[i];
      const innerNode = n.nodes[i];
      if (innerDef)
        extras.push(innerNode);
    }
  }
  return extras;
}

function reuse(firstNodes) {
  const extras = []; //todo here we can keep track of extra nodes that we might reuse later if we want.
  while (firstNodes.length) {
    //1. all the topNodes will be handled one level in this round.
    let { Def: nowDef, topNodes: nowTopNodes, otherNodes } = extractTopDefNodes(firstNodes);
    firstNodes = otherNodes;

    //2. match on list level.if the values for a firstStartNode is unchanged, then we skip that series.
    //   leave as many nodes as possible in a series of nodes unchanged.
    const { toBeAdded, maybeReusedOrDeleted } = reuseInCurrentListPosition(nowTopNodes);

    const nowDefExtras = extras.filter(n => n.Def == nowDef);
    const reusables = [...maybeReusedOrDeleted, ...nowDefExtras];
    const { notYetDone, notYetReused } = moveNodesIfSameValue(toBeAdded, reusables);

    ///   INDIVIDUAL TEMPLATE STAMP   ///

    //4. try to just move as many of the individual instances as possible.
    const { allIsDone, notUsed, innerFirstNodes } = reuseNodesOrCreateNewInstancesUsingHydration(nowDef, notYetDone, notYetReused);

    const extraInnerFirstNodes = extractAllInnerDefNodes(notUsed);
    extras.push(...extraInnerFirstNodes);
    //5. notUsed might contain lots of useable nodes.
    //   to find them, we need to dissolve them, then take only the 
    firstNodes.push(...innerFirstNodes);
  } //redo while firstNodes has tasks

  for (let { start, end } of removeables) {
    const res = [];
    for (; start != end; start = start.nextSibling)
      res.push(start);
    res.push(end);
    res.forEach(n => n.remove());
  }

  reusables = nextReusables;
}

let rootInstances = new WeakMap();
export function renderUnder(root, state) {

  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  let rootInstance = rootInstances.get(root);
  if (!rootInstance) {
    rootInstance = [];
    for (let { start, id, end } of findRunnableTemplates(root)) {
      start.Def = getDefinition(id);
      start.values = [];
      start.commas = [start, end];
      rootInstance.push(start);
    }
    rootInstances.set(root, rootInstance);
  }
  const firstNodes = rootInstance.map(n =>
    Object.assign(n, { newValues: renderDefValues(state, n.Def) }));

  reuse(firstNodes);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
