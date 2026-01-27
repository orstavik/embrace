//assume correct js inside the ${...} and <!--:: ... -->
import POJO from "./POJO.js";
import { register, findDollarDots } from "./DD.js";

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
      innerHydras.push({ path, hydra: Function("return " + "$ => `" + inner.start.nodeValue + "`")() })
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

export {
  compile,
  compileString,
}