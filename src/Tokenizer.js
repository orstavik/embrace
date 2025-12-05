const loophole = /\b(?:JSON.stringify|Object.values|Object.keys|Object.entries|(?:instanceof\s+(?:[\p{L}\p{N}_$]+)))\b/;
const ignore = /\b(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|implements|import|in|interface|let|new|null|package|private|protected|public|return|static|switch|throw|true|try|typeof|var|void|while|with|yield|async|await|\s+)\b/; //space are ignored
const dotWords = /\.\s*[\p{L}_$][\p{L}\p{N}_$]*(?:\s*\.\s*[\p{L}\p{N}_$]+)*/u;
const words = /#?[\p{L}_$][\p{L}\p{N}_$]*(?:\s*\.\s*[\p{L}\p{N}_$]+)*/u;
const quote1 = /'([^'\\]*(\\.[^'\\]*)*)'/;
const quote2 = /"([^"\\]*(\\.[^"\\]*)*)"/;
const number = /0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?/;
const regex = /\/[^/\\]*(?:\\.[^/\\]*)*\/[gimyu]*/;
const linecomment = /\/\/[^\n]*/;
const starcomment = /\/\*[^]*?\*\//;

//todo so many security problems. Mainly with ["lookup"] and ("something"||[]).dot.lookups

//0. [].constructor. 
//02. []["constructor"] => That will give us the Array object without any dotWords. Only [] lookups.
//1. template strings: `comments ${here can come devils}`. strategy 1) make it throw an error, 2) tokenize ${} inside recursively?..
//2. something["bad"].CAN.HAPPEN.HERE.constructor.__proto__.etc strategy a) make it throw an error? b) make the function work hiddenly?
// const dangerous = /super|window|this|document|globalThis|arguments|Function|eval/;
// These dangerous words are captured, replaced with args[1], and attempted gotten from the context. Thus, they are safe.

const tokens = [loophole, ignore, words, dotWords, quote1, quote2, number, linecomment, starcomment, regex];
const tokenizer = new RegExp(tokens.map(r => `(${r.source})`).join("|"), "gu");

export function extractArgs(txt) {
  return txt.replaceAll(tokenizer, (o, l, i, p) =>
    p ? `args("${p.replace(/\s+/g, "")}")` : o);
}

export function interpretTemplateString(txt) {
  return `\`${txt.split(/{{([^}]+)}}/).map((str, i) =>
    i % 2 ?
      `\${(v = ${extractArgs(str)}) === false || v === undefined ? "": v}` :
      str.replaceAll("`", "\\`")).join("")}\``;
}

const tsts = [[
  `series instanceof Array`,
  `args("series") instanceof Array`
], [
  `//the word are all references. They will *all* be replaced with arg[i]
  const word = / #something.else */u;
  const quote = / name /;
  const number = /n . a . m . e/;
  const regex = /\/[^/\\]*(?:\\.[^/\\]*)*\/[gimyu]*/;
  const starcomment = /\/\*[^]*?\*\//;`,

  `//the word are all references. They will *all* be replaced with arg[i]
  const args("word") = / #something.else */u;
  const args("quote") = / name /;
  const args("number") = /n . a . m . e/;
  const args("regex") = //[^/\\]*(?:\\.[^/\\]*)*/[gimyu]*/;
  const args("starcomment") = //*[^]*?*//;`
], [
  `name hello . sunshine #hello.world bob123 _123`,
  `args("name") args("hello.sunshine") args("#hello.world") args("bob123") args("_123")`
], [
  `name.hello["bob"].sunshine  . bob`,
  `args("name.hello")["bob"].sunshine  . bob`
],
  //todo this last test.. it should actually turn this into args("name.hello.bob.sunshine.bob"), right? We should disallow property names with space in them? " "

];

function test() {
  for (let [before, after] of tsts) {
    const exp = extractArgs(before).trim();
    if (exp !== after)
      console.log(exp);
  }
}

// test();