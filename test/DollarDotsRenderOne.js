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
  const templateString = templEl.innerHTML;

  const innerHydras = [];
  for (let inner of findDollarDots(templEl.content))
    innerHydras.push(compileTemplateNode(inner));

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

function endRun(__state, nowMap, previousMap) {
  //4. reuse exact matches (
  const oldArgsToNodes = cNode.__previousArgumentsToNodes;
  for (let argsList of newArgsToNodes.keys()) {
    const nodes = oldArgsToNodes.get(argsList);
    if (!nodes) continue;
    newArgsToNodes.set(argsList, reuseNodes);
    oldArgsToNodes.remove(argsList);
  }
  if (newArgsToNodes.values().every(nodes => !!nodes)) {
    cNode.__previousArgumentsToNodes = newArgsToNodes;
    return;
  }
  //5. we prep hydration function
  const triplets = window.dollarDots[id].innerTripplets;
  function hydrate(nodes, state) {
    for (let trip of triplets) {
      let node = trip.findPath(nodes);
      if (trip.ifOrFor) bigMama(state, node);
      else node.nodeValue = trip.hydrationFunction(state);
    }
  }

  //6. reuse closest matches, then make new nodes
  for (let argsList of newArgsToNodes.keys()) {
    let nodes;
    if (oldArgsToNodes.size) {
      const [oldArgs, oldNodes] = oldArgsToNodes.entries()[0]; //if the map is special, we can do getNearest()
      oldArgsToNodes.remove(oldArgs);
      nodes = oldNodes;
    } else {
      const tmp = document.createElement("template");
      tmp.innerHTML = window.dollarDots[id].templateString;
      nodes = tmp.content.childNodes;
    }
    newArgsToNodes.set(argsList, hydrate(nodes, __state));
  }
}

export const RenderOne = function renderer(state, start, end, DollarDots){
 //1. setup run()
  start(state, start, end, window.dollarDots[id]);

  const DollarDots = window.dollarDots[id];
  const __state = Object.assign({}, state);

  //2. run outer hydra with __state and run
  DollarDots.hydra(__state, _ => endRun(__state, nowMap, previousMap));

  //7. remove all nodes that has not been reused
  for (let n of oldArgsToNodes.values().flat())
    n.remove();
  //8. fix the sequence of the nodes in the dom by re-appending them
  let x = cNode;
  for (let n of newArgsToNodes.values().flat()) {
    x.appendSibling(n);
    x = n;
  }
  //9. update state on the node
  cNode.__previousArgumentsToNodes = newArgsToNodes;
}