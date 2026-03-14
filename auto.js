import { compile, templateToString } from "./compile.js";

let i = 0;
function compileToScript() {
  const res = document.createElement("script");
  res.type = "module";
  const templates = compile(document.body)
    .reverse()
    .map(t => `globalThis.DollarDots["${t.id}"] = ${templateToString(t)};`)
    .join("\n");
  res.textContent =
    `globalThis.DollarDots ??= Object.create(null);\n\n${templates}\n//# sourceURL=DDDefs${i++}.js`;
  document.body.append(res);
}

compileToScript();