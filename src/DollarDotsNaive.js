import { getDefinition, findRunnableTemplates, getInstance, getDefinitions } from "./core.js";

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
    for (let [i, { hydra, Def }] of innerHydras.entries())
      Def ?
        render($, nodes[i].start, nodes[i].end, Def) :
        nodes[i].start.nodeValue = hydra($);
    start.nodeValue = "::,";
    starts.push(start);
  });
  replaceNodesBetween(start, end, ...starts);
}

function renderUnder(root, state) {
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id));
}

export {
  renderUnder,
  getDefinitions,
};