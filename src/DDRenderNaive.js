import { getDefinition, findRunnableTemplates, getInstance } from "./DD6.js";

function replaceNodesBetween(start, end, ...nodes) {
  while (start.nextSibling != end)
    start.nextSibling.remove();
  const newNodes = [];
  for (let n of nodes)
    for (; n; n = n.nextSibling)
      newNodes.push(n);
  start.after(...newNodes);
}

function render(state, start, end, Def) {
  const $ = Object.assign(Array.isArray(state) ? [] : {}, state);
  const starts = [];
  Def.hydra($, function run() {
    const { start, nodes, innerHydras } = getInstance(Def);
    for (let { node, hydra, Def } of innerHydras)
      Def ?
        render($, node, node.nextSibling, Def) :
        node.nodeValue = hydra($);
    start.nodeValue = "::,";
    starts.push(start);
  });
  replaceNodesBetween(start, end, ...starts);
}

export function renderUnder(root, state) {
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id));
}