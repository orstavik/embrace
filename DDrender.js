import { diffRaw } from 'https://cdn.jsdelivr.net/gh/orstavik/making-a@25.09.12/difference.js';

const dollarDots = {};

function mapInnerDefs(innerHydras) {
  const res = new Map();
  for (let i = 0; i < innerHydras.length; i++) {
    if (innerHydras[i].Def) {
      res.set(innerHydras[i].Def, [[i]]);
      for (let innerInnerDef of innerHydras[i].Def.innerDefs.keys()) {
        const innerInnerDefPositions = res.get(innerInnerDef);
        if (innerInnerDefPositions) {
          const innerInnerDefPositionsFromOuterPointOfView = innerInnerDefPositions.map(pos => [i, ...pos]);
          let myInnerInnerDefPositions = res.get(innerInnerDef);
          myInnerInnerDefPositions ?
            myInnerInnerDefPositions.push(...innerInnerDefPositionsFromOuterPointOfView) :
            res.set(innerInnerDef, innerInnerDefPositionsFromOuterPointOfView);
        }
      }
    }
  }
  return res;
}

function register(template) {
  const el = document.createElement("template");
  el.innerHTML = template.templateString;
  template.docFrag = el.content;
  delete template.templateString;
  template.innerHydras = template.innerHydras.map(({ id, path, hydra }) => ({
    id,
    path,
    hydra,
    Def: getDefinition(id),
  }));
  template.position = Object.keys(dollarDots).length;
  template.innerDefs = mapInnerDefs(template.innerHydras);
  Object.freeze(dollarDots[template.id] = template);
}

function getDefinition(id) {
  return dollarDots[id];
}

function getDefinitions() {
  return { ...dollarDots };
}

const resolvePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

function getInstance(Def) {
  const root = Def.docFrag.cloneNode(true);
  const start = root.firstChild;
  const nodes = Def.innerHydras.map(({ path, Def }) => {
    const start = resolvePath(root, path);
    const end = Def ? start.nextSibling : undefined;
    return { start, end };
  });
  const innerHydras = Def.innerHydras;
  return { start, innerHydras, nodes };
}

function findEndComment(start) {
  const commas = [];
  for (let end = start.nextSibling, depth = 0; end; end = end.nextSibling)
    if (end.nodeType === Node.COMMENT_NODE) {
      const endTxt = end.nodeValue.trim();
      if (!depth && endTxt == "::")
        return { end, commas: [start, ...commas, end] };
      if (!depth && endTxt == "::,")
        commas.push(end);
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
      let { end, commas } = findEndComment(node) ?? {};
      if (!end) { //implicit close at endOf siblings
        end = document.createComment("::");
        node.parentNode.append(end);
      }
      const templ = { start: node, end, commas, id };
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

function* findRunnableTemplates(root) {
  for (let n of findDollarDots(root))
    if (n.id)   //todo we need to retry not yet available templates
      yield n;
}

function SelectionRestorer(active) {
  const okInputTypes = /text|search|password|tel|url|email/i;
  if (active.tagName == "TEXTAREA" || (active.tagName == "INPUT" && okInputTypes.test(active.type))) {
    const { selectionStart, selectionEnd, selectionDirection } = active;
    if (selectionStart != null)
      return active => active.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  }
}

function FocusSelectionRestorer(root) {
  const { id, tagName, type, name, value } = document.activeElement;
  const selection = SelectionRestorer(document.activeElement);

  if (id)
    return () => {
      const active = root.querySelector(`#${CSS.escape(id)}`);
      if (!active)
        return;
      active.focus();
      selection?.(active);
    };

  let q = tagName;
  if (/input|textarea|select/i.test(tagName)) {
    if (name) q += `[name="${CSS.escape(name)}"]`;
    if (type) q += `[type="${CSS.escape(type)}"]`;
  } else {
    const contenteditable = document.activeElement.getAttribute("contenteditable");
    const tabindex = document.activeElement.getAttribute("tabindex");
    if (contenteditable) q += `[contenteditable="${CSS.escape(contenteditable)}"]`;
    if (tabindex) q += `[tabindex="${CSS.escape(tabindex)}"]`;
  }

  const equalInputs = [...root.querySelectorAll(q)]
    .filter(n => n.value === value)
    .indexOf(document.activeElement);

  return function () {
    const active = [...root.querySelectorAll(q)].filter(n => n.value === value)[equalInputs];
    if (!active)
      return;
    active.focus();
    selection?.(active);
  };
}

function moveNodes(first, last, target) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, target.after(n), (target = n);
  last && target.after(last);
}

function removeNodes(first, last) {
  for (let n = first, next; n != last; n = next)
    next = n.nextSibling, n.remove();
  last.remove();
}

const tupleMap = {};
const tuplify = obj => (!obj || typeof obj !== 'object') ? obj : (tupleMap[JSON.stringify(obj)] ??= obj);

function* extractMatch(set1, set2, test) {
  for (let fillable of set1)
    for (let reusable of set2)
      if (!test || test(fillable, reusable)) {
        set1.delete(fillable), set2.delete(reusable);
        yield { fillable, reusable };
        break;
      }
}

function renderDefValues(state, Def) {
  const $ = Object.assign(state instanceof Array ? [] : {}, state);
  const values = [];
  Def.hydra($, function run() {
    const innerValues = Def.innerHydras.map(inner =>
      inner.Def ? renderDefValues($, inner.Def) : inner.hydra($));
    values.push(tuplify(innerValues.map(tuplify)));
  });
  return values;
}

class Stamp {
  #start;
  #value;
  #nodes;

  constructor(start, value) {
    this.#start = start;
    this.#value = value;
  }

  get start() { return this.#start; }
  get value() { return this.#value; }
  get nodes() { return this.#nodes; }

  hydrate(Def, prevValue) {
    const res = [];
    for (let i = 0; i < this.#nodes.length; i++) {
      const { Def: insideDef, hydra } = Def.innerHydras[i];
      const { start, end } = this.#nodes[i];
      const value = this.#value?.[i];
      const oldValue = prevValue?.[i];
      if (oldValue != value) {
        if (insideDef) {
          start.stampGroup ??= StampGroup.make(insideDef, start, end);
          const change = start.stampGroup.update(value);
          change && res.push(change);
        } else
          start.nodeValue = value;
      }
    }
    return res;
  }

  fill({ start, last, nodes }) {
    if (this.#nodes)
      throw new Error("Stamp can only be filled once");
    this.#nodes = nodes;
    moveNodes(start.nextSibling, last, this.#start);
    start.remove();  //it doesn't matter if the start is connected or not..
    return this;
  }
}

class StampGroup {
  #Def;
  #start;
  #end;
  #values;
  #stamps = [];
  get Def() { return this.#Def; }
  get stamps() { return this.#stamps; }

  static make(Def, start, end) {
    const n = new StampGroup();
    n.#Def = Def;
    n.#end = end;
    n.#start = start;
    n.#start.stampGroup = n; //todo this is spaghettish..
    return n;
  }

  update(newValues) {
    if (!newValues?.length)
      newValues = undefined;
    if (this.#values == newValues)
      return;
    const fillables = [], reusables = [], newStamps = [];
    const diffs = diffRaw(this.#values ?? [], newValues ?? []);
    for (let { a, b } of diffs) {
      if (b.length == a.length) {
        newStamps.push(...this.#stamps.splice(0, a.length));
      } else if (b.length) {
        const cs = b.map(_ => document.createComment("::,"));
        const stamps = cs.map((c, i) => new Stamp(c, b[i]));
        (this.#stamps[0]?.start ?? this.#end).before(...cs);
        newStamps.push(...stamps);
        fillables.push(...stamps);
      } else if (a.length) {
        //makes Stamps reusable by adding .last= "last content node of the stamp"
        for (let i = 0; i < a.length; i++)
          this.#stamps[i].last = (this.#stamps[i + 1]?.start ?? this.#end).previousSibling;
        reusables.push(...this.#stamps.splice(0, a.length));
      }
    }
    this.#values = newValues;
    this.#stamps = newStamps;
    return { fillables, reusables, Def: this.#Def };
  }
}

class UnusedStampsMap {
  #map = new Map();
  add(Def, reusables) { this.#map.set(Def, reusables); }

  static resolveNestedStamps(nodePositions, i, stamp, result) {
    for (let nodeIs of nodePositions[i]) {
      for (let nodeI of nodeIs) {
        const groupNode = stamp.nodes[nodeI];
        const stampGroup = groupNode.stampGroup;
        if (nodeIs.length === 1)
          result.push(...stampGroup.stamps);
        else
          for (let innerStamp of stampGroup.stamps)
            UnusedStampsMap.resolveNestedStamps(nodePositions, i + 1, innerStamp, result);
      }
    }
  }

  extractUnusedInnerReusables(targetDef) {
    const res = [];
    for (let [outerDef, stamps] of this.#map.entries()) {
      const nodePositions = outerDef.innerDefs.get(targetDef);
      if (nodePositions != null)
        for (let stamp of stamps)
          UnusedStampsMap.resolveNestedStamps(nodePositions, 0, stamp, res);
    }
    return res;
  }

  * all() {
    for (let reusables of this.#map.values())
      for (let reusable of reusables)
        if (reusable.start.isConnected)
          yield reusable;
  }
}

class StampMap {
  #fillables = new Map();
  #reusables = new Map();

  add(todo) {
    const { Def, fillables, reusables } = todo;
    let fs, rs;
    fs = this.#fillables.get(Def);
    rs = this.#reusables.get(Def);
    if (!fs) {
      this.#fillables.set(Def, fs = []);
      this.#reusables.set(Def, rs = []);
    }
    fs.push(...fillables);
    rs.push(...reusables);
  }

  addAll(todos) {
    for (let todo of todos)
      todo && this.add(todo);
  }

  extractOutermostDefGroup() {
    if (!this.#fillables.size)
      return;
    const Def = this.#fillables.keys().reduce((a, b) => a.position > b.position ? a : b);
    const fillables = new Set(this.#fillables.get(Def));
    const reusables = new Set(this.#reusables.get(Def));
    this.#fillables.delete(Def);
    this.#reusables.delete(Def);
    return { Def, fillables, reusables };
  }
}

const IdenticalValues = (f, r) => f.value === r.value;
const IdenticalInnerArrays = (f, r) => f.value.every((v, i) => typeof v === 'string' || v === r.value[i]);

function reuseAndInstantiateIndividualStamps(todos) {
  let globalNotUsed = new UnusedStampsMap();
  let todo;
  while (todo = todos.extractOutermostDefGroup()) {
    const { Def, fillables, reusables } = todo;

    //2b. here we can dig inside globalNotUsed for stamps with the current Def. 
    if (fillables.size > reusables.size) {
      const innerReusables = globalNotUsed.extractUnusedInnerReusables(Def);
      for (let r of innerReusables)
        reusables.add(r);
    }

    //2. fill stamps with reusables with the exact same value.
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalValues))
      fillable.fill(reusable);

    //3. ligthWeight matches all with identical inner arrays. These matches will only change (text, comments, attribute).nodeValue
    for (let { fillable, reusable } of extractMatch(fillables, reusables, IdenticalInnerArrays))
      fillable.fill(reusable).hydrate(Def, reusable.value);

    //4. heavyWeight. reuse and hydrate complex mismatches
    for (let { fillable, reusable } of extractMatch(fillables, reusables))
      todos.addAll(fillable.fill(reusable).hydrate(Def, reusable.value));

    //5. create new stamp instance and hydrate for the rest
    for (let fillable of fillables)
      todos.addAll(fillable.fill(getInstance(Def)).hydrate(Def));

    globalNotUsed.add(Def, reusables);
  }

  for (let { start, last } of globalNotUsed.all())
    removeNodes(start, last);
}

let rootStampGroups = new WeakMap();
function renderUnder(root, state) {

  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  let stampGroups = rootStampGroups.get(root);
  if (!stampGroups) {
    stampGroups = [];
    for (let { start, id, end, Def = getDefinition(id) } of findRunnableTemplates(root))
      stampGroups.push(StampGroup.make(Def, start, end));
    rootStampGroups.set(root, stampGroups);
  }
  const todos = new StampMap();
  todos.addAll(stampGroups.map(g => g.update(renderDefValues(state, g.Def))));

  reuseAndInstantiateIndividualStamps(todos);

  restoreFocus && !root.contains(document.activeElement) && restoreFocus();
  return todos.length;
}

export { getDefinitions, renderUnder };
//# sourceMappingURL=DDrender.js.map
