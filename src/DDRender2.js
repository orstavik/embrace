import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";

class ReusableCtxs {
  constructor(oldNodes = []) {
    this.oldNodes = oldNodes;
    this.newNodes = [];
    this.removables = [];
  }

  flip() {
    return new ReusableCtxs(this.newNodes);
  }

  tryToReuse(node) {
    const reusable = this.oldNodes.findIndex(old => old.isEqualNode(node));
    return reusable < 0 ? undefined : this.oldNodes.splice(reusable, 1)[0];
  }

  mightBeUnused(...nodes) {
    this.removables.push(...nodes);
  }

  addNewNodes(nodes) {
    this.newNodes.push(...nodes);
  }

  cleanUp() {
    for (let n of this.removables)
      if (!this.newNodes.includes(n))
        n.remove();
  }
}

function render(state, start, end, Def, rootCtx) {
  const $ = Object.assign({}, state);
  const newNodes = [];
  Def.hydra($, function run() {
    const { nodes, innerHydras } = getInstance(Def);
    for (let { node, hydra, Def } of innerHydras)
      Def ?
        render($, node, node.nextSibling, Def, rootCtx) :
        node.nodeValue = hydra($);
    for (let n of nodes)
      newNodes.push(rootCtx.tryToReuse(n) ?? n);
  });
  rootCtx.addNewNodes(newNodes);
  start.after(...newNodes);
  if (newNodes.length)
    for (let n = newNodes.at(-1).nextSibling; n != end; n = n.nextSibling)
      rootCtx.mightBeUnused(n);
}

const rootToCtx = new WeakMap();
function startUp(root) {
  const ctx = rootToCtx.get(root)?.flip() ?? new ReusableCtxs();
  rootToCtx.set(root, ctx);
  return ctx;
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

export function renderUnder(root, state) {
  const focusRestorer = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  const rootCtx = startUp(root);
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id), rootCtx);
  rootCtx.cleanUp();
  !root.contains(document.activeElement) && focusRestorer?.();
}