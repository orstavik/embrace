import TOKENIZER from "./DollarDotTokenizer.js";

//assume correct js inside the ${...} and <!--:: ... -->

function pathFunction(start) {
  let res = [];
  for (let n = start; !(n instanceof Document || n instanceof DocumentFragment); n = n.parentNode)
    res.unshift([...n.parentNode.childNodes].indexOf(n));
  if (start instanceof Attr) res[res.length - 1] = start.name;
  return `[${res.join(",")}]`;
}

function parsePossibleTemplateNode(start) {
  if (start.nodeType === Node.COMMENT_NODE && start.nodeValue.trim().startsWith(":: ")) {
    const parent = start.parentNode;
    let end = parent.childNodes[parent.childNodes.length - 1];
    while (end.nodeType !== Node.COMMENT_NODE || end.nodeValue.trim() != "::")
      end = end.previousSibling;
    const id = start.nodeValue.match(/run\("([\w\d]+)"\)\s*;?\s*$/, "gu")?.[1];
    return { start, end, id };
  } else if (start.nodeValue.indexOf("${") >= 0) {
    return { start };
  }
}

function* findDollarDots(nodes) {
  for (let node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      const startEnd = parsePossibleTemplateNode(node);
      if (startEnd) {
        yield startEnd;
        continue;
      }
    }
    const traverser = document.createTreeWalker(node, NodeFilter.SHOW_ALL, null, false);
    while (traverser.nextNode()) {
      const startEnd = parsePossibleTemplateNode(traverser.currentNode);
      if (startEnd)
        yield startEnd;
      if (startEnd?.end)
        traverser.currentNode = startEnd.end;
    }
  }
}

function extractNodesBetween(start, end) {
  const res = [];
  while (start.nextSibling != end) {
    res.push(start.nextSibling);
    start.nextSibling.remove();
  }
  return res;
}

function makeId(node) {
  const id = "_" + Math.random().toString(36).slice(2);
  node.nodeValue += ` run("${id}");`;
  return id;
}

function hydraStateReferences(txt, HashFunction) {
  // let dollars = new Set();
  // let dollars = ;
  // , h => {
  //   const $h = "$." + h.slice(1).replaceAll(/\s+/g, "");
  //   dollars.add($h);
  //   return $h;
  // }).trim();
  txt = txt.trim();
  const hydra = txt.match(/^(if|for)\s*\(/, "gu") ? `($, run) => {${txt}}` : "$ => " + txt;
  return { hydra, stateReferences: `$ => [${HashFunction(txt).join(",")}]` };
}

function compileTemplateNode({ start, id, end }) {
  const path = pathFunction(start);
  if (!end)
    return { path, ...hydraStateReferences('`' + start.nodeValue + '`', TOKENIZER.templateString) };

  const body = extractNodesBetween(start, end);
  if (id)
    return { id, path };

  const templateEl = document.createElement("template");
  templateEl.content.append(...body);
  const templateString = templateEl.innerHTML;

  const innerHydras = [];
  for (let inner of findDollarDots(body))
    innerHydras.push(compileTemplateNode(inner));

  return {
    id: makeId(start),
    path,
    ...hydraStateReferences(start.nodeValue.slice(2), TOKENIZER.ifFor),
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

function render(state, commentNode) {
  //1. memoize outside
  if (commentNode.__previousInputState === state)
    return;
  commentNode.__previousInputState = state;

  //2. prep run function
  let getArgsFunc;
  const newArgsToNodes = new Map();
  const __state = Object.assign({}, inputState);
  function run(id) {
    getArgsFunc ??= window.dollarDots[id].referenceListFunction;
    newArgsToNodes.set(getArgsFunc(__state), null);
  };

  //3. run the loop and produce listOfArgsOnly
  for (__state.hello of __state.sunshine)    //direct from html
    run("_1234abcd");                       //direct from html

  //4. reuse exact matches (
  const oldArgsToNodes = commentNode.__previousArgumentsToNodes;
  for (let argsList of newArgsToNodes.keys()) {
    const nodes = oldArgsToNodes.get(argsList);
    if (!nodes) continue;
    newArgsToNodes.set(argsList, reuseNodes);
    oldArgsToNodes.remove(argsList);
  }
  if (newArgsToNodes.values().every(nodes => !!nodes)) {
    commentNode.__previousArgumentsToNodes = newArgsToNodes;
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
  //7. remove all nodes that has not been reused
  for (let n of oldArgsToNodes.values().flat())
    n.remove();
  //8. fix the sequence of the nodes in the dom by re-appending them
  let x = commentNode;
  for (let n of newArgsToNodes.values().flat()) {
    x.appendSibling(n);
    x = n;
  }
  //9. update state on the node
  commentNode.__previousArgumentsToNodes = newArgsToNodes;
}

export class DollarDots {

  static * findDollarDots(root) { yield* findDollarDots(root.childNodes); }

  static render(state, commentNode) { return render(state, commentNode); }

  static compile(rootNode) {
    for (let n of this.findDollarDots(rootNode))
      if (n.end && !n.id)
        for (let template of newlyCompiledTemplates(compileTemplateNode(n)))
          document.body.appendChild(makeTemplateScript(template));
  }

  static * findRunnableTemplates(root) {
    for (let n of this.findDollarDots(root))
      if (n.id)   //todo here we can check that the id exists in window.dollarDots.
        yield n;
  }
}