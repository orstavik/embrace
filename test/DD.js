window.dollarDots = {};

export function register(template) {
  window.dollarDots[template.id] = template;
  // window.dollarDots[template.id].template = makeDocFrag(template.templateString);
}

export function makeDocFrag(str) {
  const tmp = document.createElement("template");
  tmp.innerHTML = str;
  return tmp.content.cloneNode(true);
}

export function getDefinition(id) {
  return window.dollarDots[id];
}

export const resolvePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);


// export function getInstance(id) {
//   return { ...window.dollarDots[id], template: window.dollarDots[id].template.cloneNode(true) };
// }

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