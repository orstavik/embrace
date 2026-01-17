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

class Pair {
  #start;
  #end;
  #first;
  #value = [];
  #nodes = [];
  static make(start, end, firstNode) {
    const n = new Pair();
    n.#start = start;
    n.#end = end;
    n.#first = firstNode;
    return n;
  }
}

class Group {
  #values = [];
  #newValues;
  #Def;
  #nodes;
  #commas;
  static make(Def, commas) {
    const n = new Group();
    n.#Def = Def;
    n.#commas = commas;
    return n;
  }
}

//finds all the nodes with the outermost Def (ie. Def added the latest to the Def registry)
function extractTopDefNodes(nodes) {
  const Def = nodes.map(({ Def }) => Def).reduce((a, b) => a.position > b.position ? a : b);
  const topNodes = [], otherNodes = [];
  for (let n of nodes)
    n.Def === Def ? topNodes.push(n) : otherNodes.push(n);
  return { Def, topNodes, otherNodes };
}

function injectComma(first, position, value, newValue) {
  const before = first.commas[position - 1];
  const after = first.commas[position];
  const c = document.createComment("::,");
  c.first = first;
  c.value = value;
  c.newValue = newValue;
  c.end = after;
  before.end = c;
  after.before(c);
  first.commas.splice(position, 0, c);
  return c;
}

// if the values for the list i the same, we do nothing.
// we handle special cases for empty arrays, because we need to see the first comma as void.
// otherwise, we do a diff, so that we get to reuse as much as possible.
function reuseListLevel(firstNodes) {
  const toBeAdded = new Set();
  const toBeReused = new Set();
  for (let first of firstNodes) {
    const { commas, values, newValues } = first;
    if (values == newValues)
      continue;

    if (!values.length) {            //special case, for empty values
      first.newValue = newValues[0];
      toBeAdded.add(first);
      for (let i = 1; i < newValues.length; i++)
        toBeAdded.add(injectComma(first, i, [], newValues[i]));
    } else if (!newValues.length) {  //special case, for empty newValues
      commas.slice(0, -1).forEach(c => toBeReused.add(c));
    } else {
      debugger
      const diffs = diff(values, newValues);
      for (let i = 0; i < diffs.length; i++) {
        const { type, x, y } = diffs[i];
        const oldV = values[x];
        const newV = newValues[y];
        if (type == "match");//do nothing
        else if (type == "ins") toBeAdded.add(injectComma(first, i, oldV, newV));
        else if (type == "del") toBeReused.add(commas[i]);
      }
    }
  }
  return { toBeAdded, toBeReused };
}

function moveNodesWithSameValues(toBeAdded, toBeReused) {
  main: for (let newN of toBeAdded) {
    for (let oldN of toBeReused) {
      if (newN.newValue == oldN.value) {
        moveContent(newN, oldN); //must update the values.
        toBeReused.delete(oldN);
        toBeAdded.delete(newN);
        continue main;
      }
    }
  }
  return { toBeAdded, toBeReused };
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
      innerNode.Def = innerDef;
      //todo here we are making a 
      newInnerFirstNodes.push(innerNode);
    } else {
      innerNode.nodeValue = newValue;
    }
  }
  return newInnerFirstNodes;
}

function StartNode(start, Def, end) {
  start.small = Pair.make(Def, [start, end]);
  start.values = [];
  start.value = [];
  start.commas = [start, end];
  start.commas.forEach(n => n.first = start);
  start.Def = Def;
  return start;
}

function getInstance2(Def) {
  const instance = getInstance(Def);
  const { start, end, innerHydras } = instance;
  start.nodes = innerHydras.map(({ node }) => node);
  //what about commas??
  start.values = [];
  start.value = [];
  start.end = end;
  start.Def = Def;
  return start;
}

function moveContent(targetStart, sourceStart) {
  const body = [];
  for (let n = sourceStart; n != sourceStart.end; n = n.nextSibling)
    body.push(n);
  targetStart.after(...body);
  targetStart.nodes = sourceStart.nodes;
}

function reuseNodesOrCreateNewInstancesUsingHydration(Def, nodes, reusableNodes) {
  const innerFirstNodes = [];
  const reusables = [...reusableNodes];
  //todo we can match reusables with nodes much better. If the reusables are equal on the Def only, 
  //todo then we should use that match, and only do the update on the textNode level.
  let i = 0;
  for (let n of nodes) {
    debugger
    const oldN = reusables[i++] ?? getInstance2(Def);
    moveContent(n, oldN);
    const newInnerFirstNodes = hydrate(n, Def);
    innerFirstNodes.push(...newInnerFirstNodes);
    n.value = n.newValue;
  }
  return { innerFirstNodes, reusables: reusables.slice(nodes.size) };
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
  let allNotUsed = new Set();
  const extras = []; //todo here we can keep track of extra nodes that we might reuse later if we want.
  while (firstNodes.length) {
    //1. all the topNodes will be handled one level in this round.
    let { Def: nowDef, topNodes: nowTopNodes, otherNodes } = extractTopDefNodes(firstNodes);
    firstNodes = otherNodes;

    //2. reuse list level
    const { toBeAdded, toBeReused } = reuseListLevel(nowTopNodes);

    //3. template stamp level
    const nowDefExtras = extras.filter(n => n.Def == nowDef);
    const toBeReusedWithExtras = toBeReused.union(new Set(nowDefExtras));
    moveNodesWithSameValues(toBeAdded, toBeReusedWithExtras);

    //4. try to just move as many of the individual instances as possible.
    const { innerFirstNodes, reusables } =
      reuseNodesOrCreateNewInstancesUsingHydration(nowDef, toBeAdded, toBeReusedWithExtras);

    const extraInnerFirstNodes = extractAllInnerDefNodes(nowDef, reusables);
    allNotUsed = allNotUsed.union(toBeReusedWithExtras);
    extras.push(...extraInnerFirstNodes);

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
    for (let { start, id, end } of findRunnableTemplates(root))
      rootInstance.push(StartNode(start, getDefinition(id), end));
    rootInstances.set(root, rootInstance);
  }
  const firstNodes = rootInstance.map(n =>
    Object.assign(n, { newValues: renderDefValues(state, n.Def) }));

  reuse(firstNodes);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
}
