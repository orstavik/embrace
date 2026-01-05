function makeDocFrag(str) {
  const tmp = document.createElement("template");
  tmp.innerHTML = str;
  return tmp.content.cloneNode(true);
}

function resolvePath(root, path) {
  return path.reduce((n, i) =>
    typeof i == "string" ? n.getAttributeNode(i) :
      n.childNodes[i],
    root);
}

export function RenderOne(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  while (start.nextSibling != end)
    start.nextSibling.remove();
  DollarDotsDef.hydra(__state, function run() {
    const root = makeDocFrag(DollarDotsDef.templateString);
    for (let { path, id, hydra, stateReferences } of DollarDotsDef.innerHydras) {
      const n = resolvePath(root, path);
      id ?
        RenderOne(__state, n, n.nextSibling, window.dollarDots[id]) :
        n.nodeValue = hydra(__state);
    }
    start.after(...root.childNodes);
  });
}