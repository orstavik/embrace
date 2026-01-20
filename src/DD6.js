const dollarDots = {};

export function register(template) {
  dollarDots[template.id] = template;
  const el = document.createElement("template");
  el.innerHTML = template.templateString;
  template.docFrag = el.content;
  delete template.templateString;
  template.innerHydras = template.innerHydras.map(({ id, path, hydra }) => ({
    id,
    path,
    hydra,
    Def: getDefinition(id),
  }));
  template.position = Object.keys(dollarDots).length;
  template.innerDefs = new Map();
  for (let i = 0; i < template.innerHydras.length; i++) {
    if (template.innerHydras[i].Def) {
      template.innerDefs.set(template.innerHydras[i].Def, [[i]]);
      for (let innerInnerDef of template.innerHydras[i].Def.innerDefs.keys()) {
        const innerInnerDefPositions = template.innerDefs.get(innerInnerDef);
        if (innerInnerDefPositions) {
          const innerInnerDefPositionsFromOuterPointOfView = innerInnerDefPositions.map(pos => [i, ...pos]);
          let myInnerInnerDefPositions = template.innerDefs.get(innerInnerDef);
          myInnerInnerDefPositions ?
            myInnerInnerDefPositions.push(...innerInnerDefPositionsFromOuterPointOfView) :
            template.innerDefs.set(innerInnerDef, innerInnerDefPositionsFromOuterPointOfView);
        }
      }
    }
  }
}

export function getDefinition(id) {
  return dollarDots[id];
}

const resolvePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

export function getInstance(Def) {
  const root = Def.docFrag.cloneNode(true);
  const innerHydras = Def.innerHydras.map(({ Def, path, hydra }) =>
    ({ Def, hydra, node: resolvePath(root, path) }));
  return {
    start: root.firstChild, last: root.lastChild.previousSibling, innerHydras, nodes:
      innerHydras.map(({ Def, hydra, node }) => ({ start: node, end: Def ? node.nextSibling : undefined }))
  };
}

export function findEndComment(start) {
  const commas = [];
  for (let end = start.nextSibling, depth = 0; end; end = end.nextSibling)
    if (end.nodeType === Node.COMMENT_NODE) {
      const endTxt = end.nodeValue.trim();
      if (!depth && endTxt == "::")
        return { end, commas: [start, ...commas, end] };
      if (!depth && endTxt == "::,")
        commas.push(end);
      if (endTxt == "::")
        depth--;
      else if (endTxt.startsWith(":: "))
        depth++;
    }
}

export function* findDollarDots(node) {
  const traverser = document.createTreeWalker(node, NodeFilter.SHOW_ALL, null, false);
  for (let node; node = traverser.nextNode();) {
    const txt = node.nodeValue?.trim();
    if (node.nodeType === Node.COMMENT_NODE && txt.startsWith(":: ")) {
      const id = txt.match(/^::\s+(id_[0-9a-f]{32})\s*$/i)?.[1];
      let { end, commas } = findEndComment(node) ?? {};
      if (!end) { //implicit close at endOf siblings
        end = document.createComment("::");
        node.parentNode.append(end);
      }
      const templ = { start: node, end, commas, id };
      traverser.currentNode = templ.end;
      yield templ;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (let attr of node.attributes)
        if (attr.value.indexOf("${") >= 0)
          yield { start: attr };
    } else if (txt.indexOf("${") >= 0)
      yield { start: node };
  }
}

export function* findRunnableTemplates(root) {
  for (let n of findDollarDots(root))
    if (n.id)   //todo we need to retry not yet available templates
      yield n;
}