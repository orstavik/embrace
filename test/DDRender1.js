import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";

function replaceNodesBetween(start, end, ...nodes) {
  while (start.nextSibling != end)
    start.nextSibling.remove();
  start.after(...nodes);
}

function render(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  const newNodes = [];
  DollarDotsDef.hydra(__state, function run() {
    const { root, innerHydras } = getInstance(DollarDotsDef.id);
    for (let { node, hydra, Def } of innerHydras)
      Def ?
        render(__state, node, node.nextSibling, Def) :
        node.nodeValue = hydra(__state);
    newNodes.push(...root.childNodes);
  });
  replaceNodesBetween(start, end, ...newNodes);
}

export function renderUnder(root, state) {
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id));
}