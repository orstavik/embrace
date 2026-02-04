import { LoopCube } from "./LoopCube.js";
import { extractArgs, interpretTemplateString } from "./Tokenizer.js";

//Template engine
function dotScope(data, superior, cache = {}) {
  const me = function scope(path) {
    return path.constructor === Object ? dotScope(data, me, path) :
      path === "$" ? data : cache[path] ??=
        path.split('.').reduce((o, p) => o?.[p], cache) ??
        superior?.(path) ??
        path.split('.').reduce((o, p) => o?.[p], data);
  };
  return me;
}

class EmbraceRoot {
  constructor(name, docFrag, nodes, expressions) {
    this.name = name;
    this.template = docFrag;
    this.nodes = nodes;
    this.topNodes = [...docFrag.childNodes];
    this.expressions = expressions;
    this.todos = [];
    for (let i = 0; i < expressions.length; i++)
      if (expressions[i])
        this.todos.push({ exp: expressions[i], node: nodes[i] });
  }

  clone() {
    const docFrag = this.template.cloneNode(true);
    const nodes = [...flatDomNodesAll(docFrag)];
    return new EmbraceRoot(this.name, docFrag, nodes, this.expressions);
  }

  run(scope, _, ancestor) {
    for (let { exp, node } of this.todos)
      if (ancestor.contains(node.ownerElement ?? node))
        exp.run(scope, node, ancestor);
  }

  prep(funcs) {
    for (let { exp } of this.todos) {
      exp.cb = funcs[exp.name];
      exp.innerRoot?.prep(funcs);
    }
  }

  runFirst(el, dataObject, funcs) {
    this.prep(funcs);
    el.prepend(...this.topNodes);
    this.run(dotScope(dataObject), 0, el);
  }
}

class EmbraceTextNode {
  constructor(name, exp) {
    this.name = name;
    this.exp = exp;
  }

  run(scope, node) {
    node.textContent = this.cb(scope);
  }
}

class EmbraceCommentFor {
  constructor(name, innerRoot, varName, exp) {
    this.name = name;
    this.innerRoot = innerRoot;
    this.varName = varName;
    this.exp = exp;
    this.cb;
    this.iName = `#${varName}`;
    this.dName = `$${varName}`;
  }

  run(scope, node, ancestor) {
    let list = this.cb(scope) ?? [];
    const inMode = !(Symbol.iterator in list);
    const cube = node.__cube ??=
      new LoopCube(this.innerRoot, inMode ? (a, b) => JSON.stringify(a) === JSON.stringify(b) : undefined);
    const now = inMode ? Object.entries(list) : list;
    const { embraces, removes, changed } = cube.step(now);
    for (let em of removes)
      for (let n of em.topNodes)
        n.remove();
    for (let em of embraces)
      node.before(...em.topNodes);
    for (let i of changed) {
      const subScope = { [this.iName]: i };
      if (inMode) {
        subScope[this.varName] = now[i][1];
        subScope[this.dName] = now[i][0];
      } else {
        subScope[this.varName] = now[i];
      }
      embraces[i].run(scope(subScope), undefined, ancestor);
    }
  }
}

class EmbraceCommentIf {
  constructor(name, emRoot, exp) {
    this.name = name;
    this.innerRoot = emRoot;
    this.exp = exp;
  }

  run(argsDict, node, ancestor) {
    const em = node.__ifEmbrace ??= this.innerRoot.clone();
    const test = !!this.cb(argsDict);
    //we are adding state to the em object. instead of the node.
    if (test && !em.state)
      node.before(...em.topNodes);
    else if (!test && em.state)
      node.append(...em.topNodes);
    if (test)
      em.run(argsDict({}), undefined, ancestor);
    em.state = test;
  }
}

//PARSER
function* flatDomNodesAll(docFrag) {
  const it = document.createNodeIterator(docFrag, NodeFilter.SHOW_ALL);
  for (let n = it.nextNode(); n = it.nextNode();) {
    yield n;
    if (n instanceof Element) yield* n.attributes;
  }
}

function parseTemplate(template, name = "embrace") {
  const nodes = [...flatDomNodesAll(template.content)];
  const expressions = nodes.map((n, i) => parseNode(n, name + "_" + i));
  return new EmbraceRoot(name, template.content, nodes, expressions);
}

function parseNode(n, name) {
  if (n instanceof Text || n instanceof Attr || n instanceof Comment) {
    if (n.textContent.match(/{{([^}]+)}}/))
      return new EmbraceTextNode(name, n.textContent);
  } else if (n instanceof HTMLTemplateElement) {
    const emTempl = parseTemplate(n, name);
    let res;
    if (res = n.getAttribute("for")) {
      const ctrlFor = res.match(/^\s*([^\s]+)\s+(?:of)\s+(.+)\s*$/);
      if (!ctrlFor)
        throw new SyntaxError("embrace for error: " + res);
      const [, varName, exp] = ctrlFor;
      return new EmbraceCommentFor(name, emTempl, varName, exp);
    }
    if (res = n.getAttribute("if"))
      return new EmbraceCommentIf(name, emTempl, res);
    return emTempl;
  }
}

function extractFuncs(root, res = {}) {
  for (let { exp } of root.todos) {
    const code =
      exp instanceof EmbraceTextNode ? interpretTemplateString(exp.exp) :
        exp instanceof EmbraceCommentFor ? extractArgs(exp.exp) :
          exp instanceof EmbraceCommentIf ? extractArgs(exp.exp) :
            undefined;
    res[exp.name] = `(args, v) => ${code}`;
    if (exp.innerRoot)
      extractFuncs(exp.innerRoot, res);
  }
  return res;
}

//TUTORIAL

function hashDebug(script, id) {
  return `Add the following script in the <head> element:

<script embrace="${id}">
  (window.Embrace ??= {})["${id}"] = ${script};
</script>`;
}

// :embrace
export function embrace(dataObject) {
  let em = this.ownerElement.__embrace;
  if (em)
    return em.run(dotScope(dataObject), 0, this.ownerElement);
  const id = this.ownerElement.id || "embrace";
  const templ = this.ownerElement.firstElementChild;
  if (!(templ instanceof HTMLTemplateElement))
    throw new Error("This first element child of :embrace ownerElement must be a template");
  em = this.ownerElement.__embrace = parseTemplate(templ, id);
  if (window.Embrace?.[id])
    return em.runFirst(this.ownerElement, dataObject, window.Embrace[id]);
  const funcs = extractFuncs(em);
  const script = "{\n" + Object.entries(funcs).map(([k, v]) => `${k}: ${v}`).join(',\n') + "\n}";
  DoubleDots.importBasedEval(script).then(funcs => {
    DoubleDots.log?.(":embrace production", hashDebug(script, id));
    (window.Embrace ??= {})[id] = funcs;
    em.runFirst(this.ownerElement, dataObject, funcs);
  });
}