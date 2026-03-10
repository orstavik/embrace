import { compile, templateToString } from "./compile.js";

let i = 0;
function compileToScript() {
  const res = document.createElement("script");
  const templates = compile(document.body)
    .reverse()
    .map(templateToString)
    .join(",\n");
  if (templates) {
    res.textContent =
      `(globalThis.DollarDots ??= Object.create(null)).push?.(\n${templates}\n) ?? Object.assign(globalThis.DollarDots, Object.fromEntries([\n${templates}\n].map(t => [t.id, t])));\n//# sourceURL=DDDefs${i++}.js`;
    document.body.append(res);
  }
}

compileToScript();