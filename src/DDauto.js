import { compile, templateToString } from "./DDCompile.js";

let scriptCount = 0;
function compileToScript() {
  const res = document.createElement("script");
  res.type = "module";
  const templates = compile(document.body)
    .reverse()
    .map(templateToString)
    .map(str => `register(${str});`)
    .join("\n");
  res.textContent =
    `import { register } from "${new URL("./DD.js", import.meta.url)}";

${templates}
//# sourceURL=DDDefs${scriptCount++}.js`;
  document.body.append(res);
}

compileToScript();