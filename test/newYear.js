import HASH from "./hash.js";

function pathFunction(node) {
  const attr = node instanceof Attr ? node.name : null;
  if(attr) node = node.parentNode;
  let indexes = [];
  for (; !(node instanceof DocumentFragment); node = node.parentNode)
    indexes.unshift([...node.parentNode.childNodes].indexOf(node));
  attr && indexes.push(attr);
  return indexes;
}

function* parseSquareDots(nodes) {
  for (let root of nodes) {
    const traverser = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ATTRIBUTE, null, false);
    while (traverser.nextNode()) {
      const start = traverser.currentNode;
      if (start.nodeType === Node.COMMENT_NODE && start.nodeValue.startsWith(":: ")) {
        const parent = start.parentNode;
        let end = parent.childNodes[parent.childNodes.length - 1];
        while (end.nodeType !== Node.COMMENT_NODE || end.nodeValue != "::")
          end = end.previousSibling;
        traverser.currentNode = end;
        yield { start, end };
      } else if (start.nodeValue.indexOf("${") >= 0) {
        yield { start };
      }
    }
  }
}

function makeHydrationFunction(hashIndexes, txt) {
  const referenceToState = hashIndexes.map(({ hash }) => hash);
  for (let { hash, index, lengthOG } of hashIndexes.reverse())
    txt = spliceString(txt, index, lengthOG, `__state.${hash}`);
  const hydrationFunction = Function("__state", "return `" + txt + "`;");
  return { hydrationFunction, referenceToState };
}

function extractNodesBetween(start, end) {
  const res = [];
  while (start.nextSibling != end) {
    res.push(start.nextSibling);
    start.nextSibling.remove();
  }
  return res;
}

function parseSquareDotsIfFor(text) {
  const m = text.match(/^::\s*(if|for)\s*\(\s*/);
  if (!m)
    return;
  const type = m[1];
  let textWithCondition = text.slice(m.index + m[0].length);
  let variableName;
  const middleMan = type == "for" ? RxHashPropOf : RxHashPropEquals;
  const m2 = textWithCondition.match(middleMan);
  if (m2) {
    variableName = m2[1];
    textWithCondition = textWithCondition.slice(m2.index + m2[0].length);
  }
  if (type === "for" && !variableName)
    throw new SyntaxError("Invalid squareDots for-comment: " + text);
  const { hashes, end, expr: condition } = hashProps(textWithCondition);
  if (end !== ")")
    throw new SyntaxError("Invalid squareDots " + type + "-comment expression: " + text);
  return { type, variableName, condition, hashes };
}

async function makeCommentTemplateClass(start, end) {

  const body = extractNodesBetween(start, end);
  const { type, variableName, condition, hashes } = parseSquareDotsIfFor(start.nodeValue);
  const { hydrationFunction, referenceToState } = makeHydrationFunction(hashes, condition);

  const templateEl = document.createElement("template");
  templateEl.content.append(...body);
  const templateString = templateEl.innerHTML;

  const innerHydrations = await Promise.all([...parseSquareDots(body)].map(async ({ start, end }) => {
    const path = pathFunction(start);
    if (end)
      return { path, ...(await makeCommentTemplateClass(start, end)) };
    //text with ${...}
    const hashIndexes = [...hashProps(start.nodeValue)];
    const { hydrationFunction, referenceToState } = makeHydrationFunction(hashIndexes, start.nodeValue);
    return { path, referenceToState, hydrationFunction };
  }));
  let id = new Uint8Array(await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(variableName + condition + templateString)))
  id = "_" + Array.from(id).map(b => b.toString(16)).join("");
  return {
    id,
    type,
    templateString,
    hydrationFunction,
    referenceToState,
    variableName,
    innerHydrations,
  };
}

function printTemplateScript(template) {
  const json = JSON.stringify(template, (key, value) => {
    return (typeof value === 'function') ?
      value.toString() :
      value;
  }, 2);
  return `window.squareDots[${template.id}] = ${json};`
}

export class SquareDots {
  static async compile(root) {
    const templateTargets = root.getRootNode().childNodes;
    for (let { start, end } of parseSquareDots(templateTargets)) {
      console.log(start, end);
      if (end) {
        const template = await makeCommentTemplateClass(start, end);
        start.nodeValue = `:: id="${template.id}"`;
        document.body.insertAdjacentHTML("beforeend", `<script>${printTemplateScript(template)}</script>`);
      }
      else
        console.warn("ignoring ${} in node outside of <!--::...--> comment structure", start);
    }
  }

  static render(state, root) {

  }

  static instantiateFromScratch(state) {
    //iterate all comment nodes that starts with :: id="
    const commentNodes = [...document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT, null, false)]
      .filter(n => n.nodeValue.startsWith(":: id="));
    for (let node of commentNodes) {
      const id = node.nodeValue.match(/^::\s*id="([^"]+)"/);
      if (!id) continue;
      const template = window.squareDots[id[1]];
      //instanciate a elements in between the start and end tag. and register these elements as belonging to the comment.
      //we then run the pathFinder functions and map them to the hydration functions.
      //and then we set up the previous memoized state as a list of undefineds.
      //and then we run the hydration Function first checking the values from the state to see if they are changed (which will be true in the first run).
    }
  }

  static instantiateFromServerSideRender(state) {

  }
}