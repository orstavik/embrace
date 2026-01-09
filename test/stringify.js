function _maxWidth(txt, indent, maxWidth) {
  // const R = new RegExp(`((\\n(?:${indent})+)(?:"(?:(?:[^"\\\\]|\\\\.)*)":\\s)?)([\\[{][\\s\\S]*?\\2[\\]}])`, "g");
  const R = new RegExp(`((\\n(?:${indent})+)[\\s\\S]*?)([\\[{]\\n[\\s\\S]*?\\2[\\]}])`, "g");
  const R2 = new RegExp(`\\n(${indent}*)`, "g");
  let m;
  while (m = R.exec(txt)) {
    const [all, key, , value] = m;
    const endOfKey = m.index + key.length;
    const newTxt = value.replaceAll(R2, " ");
    if (newTxt.length < maxWidth) {
      txt = txt.slice(0, endOfKey) + newTxt + txt.slice(m.index + all.length);
      R.lastIndex = endOfKey + newTxt.length;
    } else {
      R.lastIndex = endOfKey;
    }
  }
  return txt;
}

export function stringifyMaxWidth(obj, replacer, indent, maxWidth = 120) {
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  const txt = JSON.stringify(obj, replacer, indent);
  return _maxWidth(txt, indent, maxWidth);
}

export function stringifyPlus(obj, replacer, indent, indentLevels) {
  if (!(indentLevels > 0)) throw new SyntaxError("indentLevels must be a number > 0");
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  const res = JSON.stringify(obj, replacer, indent);
  indentLevels = indent.repeat(indentLevels);
  const RX = new RegExp(`\\n${indentLevels}((${indent})+|(?=[}\\]]))`, "g");
  return res.replace(RX, "");
}

const wrapReplacer = (REPLACER, Prefix) => {
  if (REPLACER && !(REPLACER instanceof Function))
    throw new TypeError("replacer must be a function");
  function prefixProblem(s) {
    if (typeof s == "string" && s.startsWith(Prefix))
      throw "try again with a different prefix.";
  }
  return REPLACER ?
    (k, v) => prefixProblem(v) ?? v instanceof Function ? Prefix + v + Prefix : REPLACER(k, v) :
    (k, v) => prefixProblem(v) ?? v instanceof Function ? Prefix + v + Prefix : v;
}

const doubleQuote = /"((?:[^"\\]|\\.)*)"(:)?/g;
const doubleQuote2 = /"([a-zA-Z_][a-zA-Z0-9_]*)":/g;
export function pojoStringify(obj, replacer, indent, maxWidth) {
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  for (let i = 0; i < 10; i++) {
    try {
      const FUNKY = "FUNKY" + Math.random().toString(36).slice(2);
      const replacerWrapper = wrapReplacer(replacer, FUNKY);
      const txt = JSON.stringify(obj, replacerWrapper, indent);
      // const one = txt.replaceAll(doubleQuote2, (all, q) => q + ":");
      const res2 = txt.replaceAll(doubleQuote, (all, q, c) => {
        return c ? q + c :
          !q.startsWith(FUNKY) ? all :
            q.slice(FUNKY.length, -FUNKY.length).replaceAll("\\\\", "\\");
      });
      return _maxWidth(res2, indent, maxWidth);
    } catch (e) {
    }
  }
}