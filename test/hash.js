const RX = [
  /(["'`])(?:\\.|(?!\2)[\s\S])*\2/,//QUOTE, _Q1
  /\/\*[\s\S]*?\*\//,              //STAR_COMMENT,
  /\/\/[^\n\r]*/,                  //LINE_COMMENT,
  /#(?:(?:\s*\.\s*)?\w+)*/,        //HASH_PROP,
].map(r => `(${r.source})`).join("|");

function spliceString(str, index, length, insert) {
  return str.slice(0, index) + insert + str.slice(index + length);
}

function indexOfRegexEnd(str, regex, start, _) {
  return (_ = str.slice(start).match(regex)) ? _.index + start + _[0].length : -1;
}

function hashReplacer(KEY, END) {
  const START = END == "}" ? "{" : "(";
  const Rx = new RegExp(RX + `|(\\${START})|(\\${END})`, "gu");

  return function (txt, cb) {
    let res = txt;
    main: for (let i = 0; (i = indexOfRegexEnd(txt, KEY, i)) >= 0;) {
      let depth = 0;
      for (let m of txt.slice(i).matchAll(Rx)) {
        const [ALL, Q, _Q1, C, C2, HASH, START, END] = m;
        if (START)
          depth++;
        else if (END && depth)
          depth--;
        else if (END) {
          i += m.index + 1;
          continue main;
        }
        else if (HASH)
          res = spliceString(
            res,
            i + m.index + (res.length - txt.length),
            HASH.length,
            cb(HASH)
          );
      }
      throw new SyntaxError(`Too many ${START}'s in: ${KEY + txt.slice(i)}`);
    }
    return res;
  }
}

export default {
  ifFor: hashReplacer(/(if|for)\s*\(/, ")"),
  templateString: hashReplacer(/\$\{/, "}")
};