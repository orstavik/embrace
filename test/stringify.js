function _maxWidth(txt, indent, maxWidth) {
  const R = new RegExp(`((\\n(?:${indent})+)(?:"(?:(?:[^"\\\\]|\\\\.)*)":\\s)?)([\\[{][\\s\\S]*?\\2[\\]}])`, "g");
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

const wrapReplacer = (REPLACER, randomKey) => {
  if (REPLACER && !(REPLACER instanceof Function))
    throw new TypeError("replacer must be a function");
  return REPLACER ?
    (k, v) => v instanceof Function ? randomKey + v + randomKey : REPLACER(k, v) :
    (k, v) => v instanceof Function ? randomKey + v + randomKey : v;
}

const doubleQuote = /"((?:[^"\\]|\\.)*)"(:)?/g;
export function pojoStringify(obj, replacer, indent, maxWidth) {
  const KEY = "__funcyBis__";
  const replacerWrapper = wrapReplacer(replacer, KEY);
  const res = stringifyMaxWidth(obj, replacerWrapper, indent, maxWidth);
  const res2 = res.replaceAll(doubleQuote, (all, q, c) => {
    return c ? q + c :
      !q.startsWith(KEY) ? all :
        q.slice(KEY.length, -KEY.length).replaceAll("\\\\", "\\");
  });
  return res2;
  // const res3 = _maxWidth(res2, indent, maxWidth);
}