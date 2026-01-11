import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";

function render(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  const newNodes = [];
  DollarDotsDef.hydra(__state, function run() {
    const { root, innerHydras } = getInstance(DollarDotsDef.id);
    for (let { node: n, Def, hydra } of innerHydras)
      Def ?
        render(__state, n, n.nextSibling, Def) :
        n.nodeValue = hydra(__state);
    newNodes.push(...root.childNodes);
  });
  while (start.nextSibling != end)
    start.nextSibling.remove();
  start.after(...newNodes);
}

export function renderUnder(root, state) {
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id));
}