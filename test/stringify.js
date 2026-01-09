function _maxWidth(txt, indent, maxWidth) {
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
const SimpleNamesInQuotes = /"([\p{ID_Start}_$][\p{ID_Continue}$]*)":|("(?:\\[\s\S]|[^"\\])*")/gu;
function stringify(obj, replacer, indent, maxWidth) {
  if (replacer && !(replacer instanceof Function))
    throw new TypeError("replacer must be a function");
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  const FUNKY = crypto.randomUUID();
  const FunkyRx = new RegExp(`"${FUNKY}([\\s\\S]*?)${FUNKY}"`, "g");
  const doFunky = replacer ?
    (k, v) => (v = replacer(k, v), v instanceof Function ? FUNKY + v + FUNKY : v) :
    (k, v) => v instanceof Function ? FUNKY + v + FUNKY : v;
  const jsTxt = JSON.stringify(obj, doFunky, indent)
    .replaceAll(FunkyRx, (_, f) => f.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'))
    .replaceAll(SimpleNamesInQuotes, (_, n, q) => q || (n + ":"));
  return _maxWidth(jsTxt, indent, maxWidth);
}

function unsafeParse(txt) {
  return Function("return (" + txt + ")").call(null);
}

export default {
  stringify,
  unsafeParse,
}