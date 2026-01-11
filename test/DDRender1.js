import { getDefinition, findRunnableTemplates, resolvePath, makeDocFrag } from "./DD.js";

function render(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  const newNodes = [];
  DollarDotsDef.hydra(__state, function run() {
    //this resolution of templateString and nodes and Definitions of innerHydras should be done in the 
    // getDefition() which should be getInstance()
    const root = makeDocFrag(DollarDotsDef.templateString);
    //path => node
    //id => Definition
    //hydra unchanged
    for (let { path, id, hydra } of DollarDotsDef.innerHydras) {
      const n = resolvePath(root, path);
      id ?
        render(__state, n, n.nextSibling, getDefinition(id)) :
        n.nodeValue = hydra(__state);
    }
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