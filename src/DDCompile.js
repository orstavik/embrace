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

//_compileTemplateNode is dirty!
//1. it runs recursively, so innerTemplates are discovered.
//2. each template that is compiled is *both* registered and written to the motherScript.

function _compile({ start, id, end }, motherScript) {
  const templEl = document.createElement("template");
  templEl.content.append(document.createComment("::,"));
  while (start.nextSibling != end)
    templEl.content.append(start.nextSibling);

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content)) {
    const path = pathFunction(inner.start);
    const innerT =
      inner.id ? { path, id } :
        !inner.end ? { path, hydra: Function("return " + "$ => `" + inner.start.nodeValue + "`")() } :
          { path, ..._compile(inner, motherScript) };
    innerHydras.push(innerT);
  }

  const templateString = templEl.innerHTML;
  const hydra = Function("return " + `($, $$) => {${start.nodeValue.slice(2).trim()} $$();}`)();
  id = "id_" + crypto.randomUUID().replace(/-/g, "");
  start.nodeValue = ":: " + id;

  const res = { id, hydra, templateString, innerHydras };
  _updateAndRegisterScript(motherScript, res);
  return res;
}

function _updateAndRegisterScript(motherScript, template) {
  template.innerHydras = template.innerHydras.map(({ id, path, hydra }) => ({ id, path, hydra }));
  motherScript.textContent += `register(${POJO.stringify(template, null, 2, 120)});\n\n`;
  register(template);
}

export function compile(rootNode, motherScript) {
  if (!(rootNode instanceof Node))
    throw new Error("rootNode must be a DOM node");
  if (!(motherScript instanceof HTMLScriptElement))
    throw new Error("motherScript must be a <script> element");
  const res = [];
  for (let n of findDollarDots(rootNode))
    if (n.end && !n.id)
      res.push(_compile(n, motherScript));
  return res;
}
export function compileString(txt, motherScript) {
  if (!txt.startsWith("<!--:: "))
    txt = `<!--:: ; -->${txt}<!--::-->`;
  const tmpl = document.createElement("template");
  tmpl.innerHTML = txt;
  return compile(tmpl.content, motherScript)[0];
}

(function autoCompile() {
  const id = "DollarDotsDefinition";
  if (document.getElementById(id))
    return; //we have already setup the motherScript, then we don't autocompile
  const hash = new URL(import.meta.url).hash?.slice(1);
  if (!hash)
    return;
  const sp = Object.fromEntries(new URLSearchParams(hash));
  const compileScript = document.getElementById(sp.id ?? "DollarDotsCompile");
  if (!compileScript) //if there is no script to compile anymore, then we assume we have already run.
    return;
  compileScript.type = "module";
  compileScript.id = id;
  const path = sp.dd ?? new URL("./DD6.js", import.meta.url);
  compileScript.textContent = `import { register } from "${path}";\n\n`;
  const root = document.querySelector(sp.qs ?? "body");
  compile(root, compileScript);
})();