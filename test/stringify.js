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

const IllegalPrefix = {};
function prefixProblem(IllegalPrefix, s) {
  if (typeof s == "string" && s.startsWith(IllegalPrefix))
    throw IllegalPrefix;
}

function wrapReplacer(REPLACER, IllegalPrefix) {
  if (REPLACER && !(REPLACER instanceof Function))
    throw new TypeError("replacer must be a function");
  return REPLACER ?
    (k, v) => prefixProblem(IllegalPrefix, v) ?? v instanceof Function ? IllegalPrefix + v + IllegalPrefix : REPLACER(k, v) :
    (k, v) => prefixProblem(IllegalPrefix, v) ?? v instanceof Function ? IllegalPrefix + v + IllegalPrefix : v;
}

function _pojoStringify(obj, replacer, indent, maxWidth, FUNKY) {
  const replacerWrapper = wrapReplacer(replacer, FUNKY);
  const txt = JSON.stringify(obj, replacerWrapper, indent)
    .replaceAll(simpleNamesInQuotes, (_, n) => n + ":")
    .replaceAll(new RegExp(`"${FUNKY}([\\s\\S]*?)${FUNKY}"`, "g"),
      (_, q) => q.replaceAll("\\\\", "\\"));
  return _maxWidth(txt, indent, maxWidth);
}

const simpleNamesInQuotes = /"([\p{ID_Start}_$][\p{ID_Continue}$]*)":/gu;
export function pojoStringify(obj, replacer, indent, maxWidth) {
  if (typeof indent == "number")
    indent = " ".repeat(indent);
  for (let i = 0; i < 10; i++)
    try {
      return _pojoStringify(obj, replacer, indent, maxWidth, "FUNKY" + Math.random().toString(36).slice(2));
    } catch (e) {
      if (e !== IllegalPrefix) throw e;
      //the FUNKY prefix is not unique enough
    }
}