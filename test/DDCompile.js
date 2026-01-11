//assume correct js inside the ${...} and <!--:: ... -->
import POJO from "./POJO.js";
import { register, findDollarDots } from "./DD.js";

const MotherScripts = new WeakSet();
function setupMotherScript(motherScript, path) {
  if (MotherScripts.has(motherScript))
    return motherScript;
  MotherScripts.add(motherScript);
  motherScript.type = "module";
  motherScript.id = "DollarDotsDefinition";
  motherScript.textContent = `import { register } from "${path}";\n\n`;
  return motherScript;
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

//_compileTemplateNode is dirty!
//1. it runs recursively, so innerTemplates are discovered.
//2. each template that is compiled is *both* registered and written to the motherScript.

function _compile({ start, id, end }, motherScript) {
  const path = pathFunction(start);
  if (!end)
    return { path, hydra: Function("return " + "$ => `" + start.nodeValue + "`")() };
  if (id)
    return { path, id };

  const templEl = document.createElement("template");
  while (start.nextSibling != end)
    templEl.content.append(start.nextSibling);

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content))
    innerHydras.push(_compile(inner, motherScript));

  const templateString = templEl.innerHTML;
  const hydra = Function("return " + `($, $$) => {${start.nodeValue.slice(2).trim()} $$();}`)();
  id = "id_" + crypto.randomUUID().replace(/-/g, "");
  start.nodeValue = ":: " + id;

  const res = { path, id, hydra, templateString, innerHydras };
  _updateAndRegisterScript(motherScript, res);
  return res;
}

function _updateAndRegisterScript(motherScript, template) {
  template.innerHydras = template.innerHydras.map(({ id, path, hydra }) => ({ id, path, hydra }));
  register(template);
  motherScript.textContent += `register(${POJO.stringify(template, null, 2, 120)});\n\n`;
}

export function compile(rootNode, motherScript, DollarDotsPath) {
  if (!(rootNode instanceof Node))
    throw new Error("rootNode must be a DOM node");
  if (!(motherScript instanceof HTMLScriptElement))
    throw new Error("motherScript must be a <script> element");
  const script = setupMotherScript(motherScript, DollarDotsPath);
  for (let n of findDollarDots(rootNode))
    if (n.end && !n.id)
      _compile(n, script);
}