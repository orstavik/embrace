function makeDocFrag(str) {
  const tmp = document.createElement("template");
  tmp.innerHTML = str;
  return tmp.content.cloneNode(true);
}

const reducePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

export function RenderOne(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  const newNodes = [];
  DollarDotsDef.hydra(__state, function run() {
    const root = makeDocFrag(DollarDotsDef.templateString);
    for (let { path, id, hydra, stateReferences } of DollarDotsDef.innerHydras) {
      const n = reducePath(root, path);
      id ?
        RenderOne(__state, n, n.nextSibling, window.dollarDots[id]) :
        n.nodeValue = hydra(__state);
    }
    newNodes.push(...root.childNodes);
  });
  while (start.nextSibling != end)
    start.nextSibling.remove();
  start.after(...newNodes);
}

export function RenderTwo(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  DollarDotsDef.hydra(__state, function run() {
    const root = makeDocFrag(DollarDotsDef.templateString);
    for (let { path, id, hydra, stateReferences } of DollarDotsDef.innerHydras) {
      const n = reducePath(root, path);
      id ?
        RenderTwo(__state, n, n.nextSibling, window.dollarDots[id]) :
        n.nodeValue = hydra(__state);
    }
    while (start.nextSibling != end)
      start.nextSibling.remove();
    start.after(...root.childNodes);
  });
}

