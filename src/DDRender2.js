import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

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

export function renderUnder(root, state) {
  const restoreFocus = root.contains(document.activeElement) && FocusSelectionRestorer(root);
  const rootCtx = startUp(root);
  for (let { start, id, end } of findRunnableTemplates(root))
    render(state, start, end, getDefinition(id), rootCtx);
  rootCtx.cleanUp();
  !root.contains(document.activeElement) && restoreFocus && restoreFocus();
}