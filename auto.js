import { compile, templateToString } from "./src/compile.js";

let i = 0;
function compileToScript() {
  const res = document.createElement("script");
  res.type = "module";
  const templates = compile(document.body)
    .reverse()
    .map(templateToString)
    .map(str => `register(${str});`)
    .join("\n");
  res.textContent =
    `import { register } from "DollarDots";\n\n${templates}\n//# sourceURL=DDDefs${i++}.js`;
  document.body.append(res);
}

compileToScript();