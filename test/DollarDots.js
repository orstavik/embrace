import TOKENIZER from "./DollarDotTokenizer.js";

//assume correct js inside the ${...} and <!--:: ... -->

function pathFunction(start) {
  const res = [];
  if (start instanceof Attr) {
    res.push(start.name);
    start = start.ownerElement;
  }
  for (let n = start; !(n instanceof Document || n instanceof DocumentFragment); n = n.parentNode)
    res.unshift([...n.parentNode.childNodes].indexOf(n));
  return JSON.stringify(res);
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
      const id = TOKENIZER.readID(txt);
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

function compileTemplateNode({ start, id, end }) {
  const path = pathFunction(start);
  if (!end)
    return {
      path,
      stateReferences: `$ => [${TOKENIZER.templateString(start.nodeValue).join(",")}]`,
      hydra: "$ => `" + start.nodeValue + "`",
    };

  if (id)
    return { id, path };

  const templEl = document.createElement("template");
  while (start.nextSibling != end)
    templEl.content.append(start.nextSibling);

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content))
    innerHydras.push(compileTemplateNode(inner));

  const templateString = templEl.innerHTML;
  const hydra = `($, $$) => {${start.nodeValue.slice(2).trim()} $$();}`;
  const stateReferences = `$ => [${TOKENIZER.ifFor(start.nodeValue).join(",")}]`;
  id = "_" + Math.random().toString(36).slice(2);
  start.nodeValue = ":: " + id;

  return {
    id,
    path,
    stateReferences,
    hydra,
    templateString,
    innerHydras,
  };
}

function* newlyCompiledTemplates(template) {
  if (template.id && template.innerHydras) {
    yield template;
    for (let inner of template.innerHydras)
      yield* newlyCompiledTemplates(inner);
  }
}

function makeTemplateScript({ path, hydra, id, stateReferences, innerHydras, templateString }) {
  let inner = innerHydras.map(({ id, path, hydra, stateReferences }) =>
    id ? `{ path: ${path}, id: "${id}" }` :
      `{ path: ${path}, stateReferences: ${stateReferences}, hydra: ${hydra} }`
  );
  inner = inner.length == 1 ? "[" + inner[0] + "]" :
    "[\n    " + inner.join(",\n    ") + "\n  ]";
  const script = document.createElement('script');
  script.textContent = `"use strict";
(window.dollarDots ??= {}).${id} = {
  id: "${id}",
  path: ${path},
  hydra: ${hydra},
  stateReferences: ${stateReferences},
  innerHydras: ${inner},
  templateString: ${JSON.stringify(templateString)}
}`;
  return script;
}

import { RenderOne } from "./DDRenderOne.js";
export class DollarDots {

  static render(state, start, end, DollarDotsDef) {
    return RenderOne(state, start, end, DollarDotsDef);
  }

  static compile(rootNode) {
    for (let n of findDollarDots(rootNode))
      if (n.end && !n.id)
        for (let template of newlyCompiledTemplates(compileTemplateNode(n)))
          document.body.appendChild(makeTemplateScript(template));
  }

  static findDollarDots(root, runnable = true) {
    return [...findDollarDots(root)]
      .map(n => ({ ...n, Def: window.dollarDots[n.id] }))
      .filter(n => runnable ^ !n.id);
  }

  static * findRunnableTemplates(root) {
    for (let n of findDollarDots(root))
      if (n.id)   //todo here we can check that the id exists in window.dollarDots.
        yield n;
  }
}