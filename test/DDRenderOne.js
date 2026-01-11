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
    for (let { path, id, hydra } of DollarDotsDef.innerHydras) {
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