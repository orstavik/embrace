function _maxWidth(txt, indent, maxWidth) {
  const R = new RegExp(`((\\n(?:${indent})+)[\\s\\S]*?)([\\[{]\\n[\\s\\S]*?\\2[\\]}])`, "g");
  const R2 = new RegExp(`\\n(${indent}*)`, "g");
  let m;
  while (m = R.exec(txt)) {
    const [all, key, , value] = m;
    const endOfKey = m.index + key.length;
    const newTxt = value.replaceAll(R2, " ");
    if (newTxt.length < maxWidth) {
      txt = txt.slice(0, endOfKey) + newTxt + txt.slice(m.index + all.length);
      R.lastIndex = endOfKey + newTxt.length;
    } else {
      R.lastIndex = endOfKey;
    }
  }
  return txt;
}
const SimpleNamesInQuotes = /"([\p{ID_Start}_$][\p{ID_Continue}$]*)":|("(?:\\[\s\S]|[^"\\])*")/gu;
function stringify(obj, replacer, indent, maxWidth) {
  if (replacer && !(replacer instanceof Function))
    throw new TypeError("replacer must be a function");
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  const FUNKY = crypto.randomUUID();
  const FunkyRx = new RegExp(`"${FUNKY}([\\s\\S]*?)${FUNKY}"`, "g");
  const doFunky = replacer ?
    (k, v) => (v = replacer(k, v), v instanceof Function ? FUNKY + v + FUNKY : v) :
    (k, v) => v instanceof Function ? FUNKY + v + FUNKY : v;
  const jsTxt = JSON.stringify(obj, doFunky, indent)
    .replaceAll(FunkyRx, (_, f) => f.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'))
    .replaceAll(SimpleNamesInQuotes, (_, n, q) => q || (n + ":"));
  return _maxWidth(jsTxt, indent, maxWidth);
}

function unsafeParse(txt) {
  return Function("return (" + txt + ")").call(null);
}

var POJO = {
  stringify,
  unsafeParse,
};

function findEndComment(start) {
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

function* findDollarDots(node) {
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

//assume correct js inside the ${...} and <!--:: ... -->

function pathFunction(start) {
  const res = [];
  if (start instanceof Attr) {
    res.push(start.name);
    start = start.ownerElement;
  }
  for (let n = start; !(n instanceof Document || n instanceof DocumentFragment); n = n.parentNode)
    res.unshift([...n.parentNode.childNodes].indexOf(n));
  return res;
}

//runs recursively and discovers innerTemplates
function _compile({ start, id, end }) {
  const res = [];
  const templEl = document.createElement("template");
  templEl.content.append(document.createComment("::,"));
  while (start.nextSibling != end)
    templEl.content.append(start.nextSibling);

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content)) {
    const path = pathFunction(inner.start);
    if (inner.id)
      innerHydras.push({ id: inner.id, path });
    else if (!inner.end)
      innerHydras.push({ path, hydra: Function("return " + "$ => `" + inner.start.nodeValue + "`")() });
    else {
      const innerTemplates = _compile(inner);
      innerHydras.push({ path, ...innerTemplates[0] });
      res.push(...innerTemplates);
    }
  }

  const templateString = templEl.innerHTML;
  const hydra = Function("return " + `($, $$) => {${start.nodeValue.slice(2).trim()} $$();}`)();
  id = "id_" + crypto.randomUUID().replace(/-/g, "");
  start.nodeValue = ":: " + id;   //att!! mutates the start.nodeValue!!!

  return [{ id, hydra, templateString, innerHydras }, ...res];
}

function templateToString(template) {
  return POJO.stringify({
    ...template,
    innerHydras: template.innerHydras.map(({ id, path, hydra }) => ({ id, path, hydra })),
  }, null, 2, 120);
}

function compile(rootNode) {
  if (!(rootNode instanceof Node))
    throw new Error("rootNode must be a DOM node");
  const res = [];
  for (let n of findDollarDots(rootNode))
    if (n.end && !n.id)
      res.push(..._compile(n));
  return res;
}

let scriptCount = 0;
function compileToScript() {
  const res = document.createElement("script");
  res.type = "module";
  const templates = compile(document.body)
    .reverse()
    .map(templateToString)
    .map(str => `register(${str});`)
    .join("\n");
  res.textContent =
    `import { register } from "${new URL("./DD.js", import.meta.url)}";

${templates}
//# sourceURL=DDDefs${scriptCount++}.js`;
  document.body.append(res);
}

compileToScript();
//# sourceMappingURL=DDauto.js.map
