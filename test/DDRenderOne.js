function makeDocFrag(str) {
  const tmp = document.createElement("template");
  tmp.innerHTML = str;
  return tmp.content.cloneNode(true);
}

const reducePath = (root, path) => path.reduce((n, i) =>
  typeof i == "string" ? n.getAttributeNode(i) : n.childNodes[i], root);

export function RenderOne(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  const newNodes = [];
  DollarDotsDef.hydra(__state, function run() {
    const root = makeDocFrag(DollarDotsDef.templateString);
    for (let { path, id, hydra } of DollarDotsDef.innerHydras) {
      const n = reducePath(root, path);
      id ?
        RenderOne(__state, n, n.nextSibling, window.dollarDots[id]) :
        n.nodeValue = hydra(__state);
    }
    newNodes.push(...root.childNodes);
  });
  while (start.nextSibling != end)
    start.nextSibling.remove();
  start.after(...newNodes);
}

export function RenderTwo(state, start, end, DollarDotsDef) {
  const __state = Object.assign({}, state);
  DollarDotsDef.hydra(__state, function run() {
    const root = makeDocFrag(DollarDotsDef.templateString);
    for (let { path, id, hydra } of DollarDotsDef.innerHydras) {
      const n = reducePath(root, path);
      id ?
        RenderTwo(__state, n, n.nextSibling, window.dollarDots[id]) :
        n.nodeValue = hydra(__state);
    }
    while (start.nextSibling != end)
      start.nextSibling.remove();
    start.after(...root.childNodes);
  });
}


// function endRun(__state, nowMap, previousMap) {
//   //4. reuse exact matches (
//   const oldArgsToNodes = cNode.__previousArgumentsToNodes;
//   for (let argsList of newArgsToNodes.keys()) {
//     const nodes = oldArgsToNodes.get(argsList);
//     if (!nodes) continue;
//     newArgsToNodes.set(argsList, reuseNodes);
//     oldArgsToNodes.remove(argsList);
//   }
//   if (newArgsToNodes.values().every(nodes => !!nodes)) {
//     cNode.__previousArgumentsToNodes = newArgsToNodes;
//     return;
//   }
//   //5. we prep hydration function
//   const triplets = window.dollarDots[id].innerTripplets;
//   function hydrate(nodes, state) {
//     for (let trip of triplets) {
//       let node = trip.findPath(nodes);
//       if (trip.ifOrFor) bigMama(state, node);
//       else node.nodeValue = trip.hydrationFunction(state);
//     }
//   }

//   //6. reuse closest matches, then make new nodes
//   for (let argsList of newArgsToNodes.keys()) {
//     let nodes;
//     if (oldArgsToNodes.size) {
//       const [oldArgs, oldNodes] = oldArgsToNodes.entries()[0]; //if the map is special, we can do getNearest()
//       oldArgsToNodes.remove(oldArgs);
//       nodes = oldNodes;
//     } else {
//       const tmp = document.createElement("template");
//       tmp.innerHTML = window.dollarDots[id].templateString;
//       nodes = tmp.content.childNodes;
//     }
//     newArgsToNodes.set(argsList, hydrate(nodes, __state));
//   }
// }

// function render({ start, id, end }, state /*, start, step, end*/) {
//   //1. setup run()
//   start(state, start, end, window.dollarDots[id]);

//   const DollarDots = window.dollarDots[id];
//   const __state = Object.assign({}, state);

//   //2. run outer hydra with __state and run
//   DollarDots.hydra(__state, _ => endRun(__state, nowMap, previousMap));

//   //7. remove all nodes that has not been reused
//   for (let n of oldArgsToNodes.values().flat())
//     n.remove();
//   //8. fix the sequence of the nodes in the dom by re-appending them
//   let x = cNode;
//   for (let n of newArgsToNodes.values().flat()) {
//     x.appendSibling(n);
//     x = n;
//   }
//   //9. update state on the node
//   cNode.__previousArgumentsToNodes = newArgsToNodes;
// }