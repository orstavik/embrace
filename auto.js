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
      `(globalThis.DollarDots ??= []).push(\n${templates}\n);\n//# sourceURL=DDDefs${i++}.js`;
    document.body.append(res);
  }
}

compileToScript();