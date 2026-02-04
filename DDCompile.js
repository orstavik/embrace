//making release
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

const dollarDots = {};

function mapInnerDefs(innerHydras) {
  const res = new Map();
  for (let i = 0; i < innerHydras.length; i++) {
    if (innerHydras[i].Def) {
      res.set(innerHydras[i].Def, [[i]]);
      for (let innerInnerDef of innerHydras[i].Def.innerDefs.keys()) {
        const innerInnerDefPositions = res.get(innerInnerDef);
        if (innerInnerDefPositions) {
          const innerInnerDefPositionsFromOuterPointOfView = innerInnerDefPositions.map(pos => [i, ...pos]);
          let myInnerInnerDefPositions = res.get(innerInnerDef);
          myInnerInnerDefPositions ?
            myInnerInnerDefPositions.push(...innerInnerDefPositionsFromOuterPointOfView) :
            res.set(innerInnerDef, innerInnerDefPositionsFromOuterPointOfView);
        }
      }
    }
  }
  return res;
}

function register(template) {
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
  template.innerDefs = mapInnerDefs(template.innerHydras);
}

function getDefinition(id) {
  return dollarDots[id];
}

const resolvePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

function getInstance(Def) {
  const root = Def.docFrag.cloneNode(true);
  const start = root.firstChild;
  const nodes = Def.innerHydras.map(({ path, Def }) => {
    const start = resolvePath(root, path);
    const end = Def ? start.nextSibling : undefined;
    return { start, end };
  });
  const innerHydras = Def.innerHydras;
  return { start, innerHydras, nodes };
}

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

function* findRunnableTemplates(root) {
  for (let n of findDollarDots(root))
    if (n.id)   //todo we need to retry not yet available templates
      yield n;
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

function compileString(txt) {
  const tmpl = document.createElement("template");
  tmpl.innerHTML = txt;
  return compile(tmpl.content);
}

(function autoCompile() {
  const id = "DollarDotsDefinition";
  if (document.getElementById(id))
    return; //we have already setup the motherScript, then we don't autocompile
  const hash = new URL(import.meta.url).hash?.slice(1);
  if (!hash)
    return;
  const sp = Object.fromEntries(new URLSearchParams(hash));
  const motherScript = document.getElementById(sp.id ?? "DollarDotsCompile");
  if (!motherScript) //if there is no script to compile anymore, then we assume we have already run.
    return;
  if (!(motherScript instanceof HTMLScriptElement))
    throw new Error("compileScript must be a <script> element");
  motherScript.type = "module";
  motherScript.id = id;
  const path = sp.dd ?? new URL("./DD6.js", import.meta.url);
  motherScript.textContent = `import { register } from "${path}";\n\n`;
  const root = document.querySelector(sp.qs ?? "body");
  const templates = compile(root);
  for (let template of templates.reverse()) {
    register(template);
    motherScript.textContent += `register(${templateToString(template)});\n`;
  }
})();

export { compile, compileString };
//# sourceMappingURL=DDCompile.js.map
