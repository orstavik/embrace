//assume correct js inside the ${...} and <!--:: ... -->
import POJO from "./POJO.js";

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

function compileTemplateNode({ start, id, end }) {
  const path = pathFunction(start);
  if (!end)
    return { path, hydra: Function("return " + "$ => `" + start.nodeValue + "`")() };
  if (id)
    return { id, path };

  const templEl = document.createElement("template");
  while (start.nextSibling != end)
    templEl.content.append(start.nextSibling);

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content))
    innerHydras.push(compileTemplateNode(inner));

  const templateString = templEl.innerHTML;
  const hydra = Function("return " + `($, $$) => {${start.nodeValue.slice(2).trim()} $$();}`)();
  id = "id_" + crypto.randomUUID().replace(/-/g, "");
  start.nodeValue = ":: " + id;

  return {
    id,
    path,
    hydra,
    templateString,
    innerHydras,
  };
}

function makeTemplateScript(template) {
  const obj = {
    ...template,
    innerHydras: template.innerHydras.map(({ id, path, hydra }) => ({ id, path, hydra })),
  };
  const script = document.createElement('script');
  script.textContent = `"use strict";(window.dollarDots ??= {}).${template.id} = ${POJO.stringify(obj, null, 2, 120)};`;
  return script;
}



function findEndComment(start) {
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

function* findDollarDots(node) {
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

function* newlyCompiledTemplates(template) {
  if (template.id && template.innerHydras) {
    yield template;
    for (let inner of template.innerHydras)
      yield* newlyCompiledTemplates(inner);
  }
}

import { RenderOne } from "./DDRenderOne.js";
function render(state, start, end, DollarDotsDef) {
  return RenderOne(state, start, end, DollarDotsDef);
}

function compile(rootNode) {
  for (let n of findDollarDots(rootNode))
    if (n.end && !n.id)
      for (let template of newlyCompiledTemplates(compileTemplateNode(n)))
        document.body.appendChild(makeTemplateScript(template));
}

function findDollarDots2(root, runnable = true) {
  return [...findDollarDots(root)]
    .map(n => ({ ...n, Def: window.dollarDots[n.id] }))
    .filter(n => runnable ^ !n.id);
}

function* findRunnableTemplates(root) {
  for (let n of findDollarDots(root))
    if (n.id)   //todo here we can check that the id exists in window.dollarDots.
      yield n;
}

function register(template) {
  window.dollarDots[template.id] = template;
}
export default {
  render,
  compile,
  findDollarDots: findDollarDots2,
  findRunnableTemplates,
  register,
};