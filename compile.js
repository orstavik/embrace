//assume correct js inside the ${...} and <!--:: ... -->
import POJO from "./src/POJO.js";
import { findDollarDots } from "./src/core.js";

function _compileTemplateString(expr) {
  try {
    return Function("return $ => `" + expr + "`")();
  } catch (e) {
    throw new SyntaxError(`JS templateString error:\n\n   ${expr}\n`);
  }
}

function _compileTemplateHeader(expr) {
  try {
    return Function("return ($, $$) => {" + expr + " $$();}")();
  } catch (e) {
    throw new SyntaxError(`JS syntax error:\n\n   ${expr} cb();\n`);
  }
}

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
      innerHydras.push({ path, hydra: _compileTemplateString(inner.start.nodeValue) })
    else {
      const innerTemplates = _compile(inner);
      innerHydras.push({ path, ...innerTemplates[0] });
      res.push(...innerTemplates);
    }
  }

  const templateString = templEl.innerHTML;
  const hydra = _compileTemplateHeader(start.nodeValue.slice(2).trim());
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

export {
  compile,
  compileString,
  templateToString,
}