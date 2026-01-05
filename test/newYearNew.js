import HASH from "./hash.js";

//assume correct structures
//assume that we don't assign to #something.with.a.dot

function pathFunction(start) {
  let res = [];
  for (let n = start; !(n instanceof Document || n instanceof DocumentFragment); n = n.parentNode)
    res.unshift([...n.parentNode.childNodes].indexOf(n));
  if (start instanceof Attr) res[res.length - 1] = start.name;
  return res;
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

function* findSquareDots(nodes) {
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
  const stateReferences = new Set();
  const exprBody = HashFunction(txt, h => {
    const $h = "$." + h.slice(1).replaceAll(/\s+/g, "");
    stateReferences.add($h);
    return $h;
  });
  const hydra = Function("$", "run", exprBody);
  return { hydra, stateReferences };
}

function compileTemplateNode({ start, id, end }) {
  const path = pathFunction(start);
  if (!end)
    return { path, ...hydraStateReferences('`' + start.nodeValue + '`', HASH.templateString) };

  const body = extractNodesBetween(start, end);
  if (id)
    return { id, path };

  const templateEl = document.createElement("template");
  templateEl.content.append(...body);
  const templateString = templateEl.innerHTML;

  const innerHydras = [];
  for (let inner of findSquareDots(body))
    innerHydras.push(compileTemplateNode(inner));

  return {
    id: makeId(start),
    path,
    ...hydraStateReferences(start.nodeValue.slice(2), HASH.ifFor),
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

function printTemplateScript(template) {
  const json = JSON.stringify(template, (k, v) =>
    (typeof v === 'function') ? v.toString() : v, 2);
  return `window.squareDots[${template.id}] = ${json};`
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
    getArgsFunc ??= window.squareDots[id].referenceListFunction;
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
  const triplets = window.squareDots[id].innerTripplets;
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
      tmp.innerHTML = window.squareDots[id].templateString;
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

export class SquareDots {

  static * findSquareDots(root) { yield* findSquareDots(root.childNodes); }

  static render(state, commentNode) { return render(state, commentNode); }

  static compile(rootNode) {
    for (let n of this.findSquareDots(rootNode))
      if (n.end && !n.id)
        for (let template of newlyCompiledTemplates(compileTemplateNode(n))) {
          debugger
          document.body.insertAdjacentHTML("beforeend",
            `<script>${printTemplateScript(template)}</script>`);
        }
  }

  static * findRunnableTemplates(root) {
    for (let n of this.findSquareDots(root))
      if (n.id)   //todo here we can check that the id exists in window.squareDots.
        yield n;
  }
}