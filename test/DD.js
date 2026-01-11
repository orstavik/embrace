window.dollarDots = {};

const resolvePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

export function register(template) {
  window.dollarDots[template.id] = template;
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
}

export function getDefinition(id) {
  return window.dollarDots[id];
}

export function getInstance(Def) {
  const root = Def.docFrag.cloneNode(true);
  const innerHydras = Def.innerHydras.map(({ Def, path, hydra }) =>
    ({ Def, hydra, node: resolvePath(root, path) }));
  return { nodes: root.childNodes, innerHydras };
}

export function findEndComment(start) {
  for (let end = start.nextSibling, depth = 0; end; end = end.nextSibling)
    if (end.nodeType === Node.COMMENT_NODE) {
      const endTxt = end.nodeValue.trim();
      if (!depth && endTxt == "::")
        return end;
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
      const end = findEndComment(node);
      if (!end) { //implicit close at endOf siblings
        end = document.createComment("::");
        node.parentNode.append(end);
      }
      const templ = { start: node, end, id };
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