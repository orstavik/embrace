import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";

function replaceNodesBetween(start, end, ...nodes) {
  while (start.nextSibling != end)
    start.nextSibling.remove();
  start.after(...nodes);
}

function render(state, start, end, Def) {
  const $ = Object.assign({}, state);
  const newNodes = [];
  Def.hydra($, function run() {
    const { root, innerHydras } = getInstance(Def);
    for (let { node, hydra, Def } of innerHydras)
      Def ?
        render($, node, node.nextSibling, Def) :
        node.nodeValue = hydra($);
    newNodes.push(...root.childNodes);
  });
  replaceNodesBetween(start, end, ...newNodes);
}

export function renderUnder(root, state) {
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id));
}