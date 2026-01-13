import { getDefinition, findRunnableTemplates, getInstance } from "./DD.js";
import { FocusSelectionRestorer } from "./DDFocusRestorer.js";

//todo this first
//1. we don't put in .after() until cleanup.
//2. we store all the newNodes in a set {start,newNodes, end}.
//3. at cleanup, we iterate this map. I think in reverse()? but i am not sure we need that.
//4. We then start.after(...newNodes); this will run all the register the tasks
//5. then we run from newNodes.last => end. Here, we see if the node has been used elsewhere, if not, we .remove() it.

//todo this second
//6. this means that at cleanup time, we can run through the *newNodes* added, 
// and match them against a much smaller set of oldNodesNotUsed, and then do a more complex replace.
// this replace will a) only focus on elements, b) match elements based on tagName, c) then maybe do a JSON.stringify compare inside here.

class ReusableCtxs {
  #reusables;
  // #reused = new Set();
  #newNodes = [];
  #newTopNodes = [];
  #bob = new Set();
  constructor(oldNodes = []) {
    this.#reusables = oldNodes;
  }

  flip() {
    return new ReusableCtxs(this.#newNodes);
  }

  addNewNodes(start, end, nodes) {
    nodes = nodes.map(n => {
      const reusable = this.#reusables.findIndex(old => old.isEqualNode(n));
      if (reusable >= 0)
        return this.#reusables.splice(reusable, 1)[0];
      this.#newTopNodes.push(n);
      return n;
    });
    this.#newNodes.push(...nodes);
    this.#bob.add({ start, end, nodes });
  }

  cleanUp() {
    const unused = [];
    for (let { start, end, nodes } of this.#bob) {
      start.after(...nodes);
      if (nodes.length)
        for (let n = nodes.at(-1).nextSibling; n != end; n = n.nextSibling)
          if (!this.#newNodes.includes(n))
            unused.push(n);
    }
    //todo we can still reuse the unused more here.
    for (let n of unused)
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
    newNodes.push(...nodes);
  });
  rootCtx.addNewNodes(start, end, newNodes);
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