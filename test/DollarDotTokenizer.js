const RX = [
  /(["'`])(?:\\.|(?!\2)[\s\S])*\2/,//QUOTE, _Q1
  /\/\*[\s\S]*?\*\//,              //STAR_COMMENT,
  /\/\/[^\n\r]*/,                  //LINE_COMMENT,
  /(?<![\p{ID_Continue}$]|\.\s*)\$(?:(?:\s*\.\s*)[\p{ID_Continue}$]+)*(?![\p{ID_Continue}$])/u, //DOLLAR_DOT
].map(r => `(${r.source})`).join("|");

function indexOfRegexEnd(str, regex, start, _) {
  return (_ = str.slice(start).match(regex)) ? _.index + start + _[0].length : -1;
}

function dollarDotReader(KEY, END) {
  const START = END == "}" ? "{" : "(";
  const Rx = new RegExp(RX + `|(\\${START})|(\\${END})`, "gu");

  return function dollarDots(txt) {
    const res = new Set();
    main: for (let i = 0; (i = indexOfRegexEnd(txt, KEY, i)) >= 0;) {
      let depth = 0;
      for (let m of txt.slice(i).matchAll(Rx)) {
        const [ALL, Q, _Q1, C, C2, DOLLAR_DOT, START, END] = m;
        if (DOLLAR_DOT)
          res.add(DOLLAR_DOT.replace(/\s+/g, ""));
        else if (START)
          depth++;
        else if (END && depth)
          depth--;
        else if (END) {
          i += m.index + 1;
          continue main;
        }
      }
      throw new SyntaxError(`Too many ${START}'s in: ${KEY + txt.slice(i)}`);
    }
    return [...res];
  }
}

export default {
  ifFor: dollarDotReader(/(if|for)\s*\(/, ")"),
  templateString: dollarDotReader(/\$\{/, "}"),
  ID: txt => txt.match(/^::\s+(_[a-z0-9]+)\s*$/u)?.[1],
};