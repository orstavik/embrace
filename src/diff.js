export function levenshteinMinimalShifts(A, B) {
  const H = A.length, W = B.length, H2 = H + 1, W2 = W + 1, L = H2 * W2;
  const edits = new Uint16Array(L);
  const shifts = new Uint16Array(L);
  const state = new Uint8Array(L);  // 0: diagonal (match), 1: left (insert), 2: up (delete), 3: start

  edits[0] = 0; shifts[0] = 0; state[0] = 3;

  for (let x2 = 1; x2 < W2; x2++) {
    edits[x2] = x2;
    shifts[x2] = 1;
    state[x2] = 1;
  }
  for (let y2 = 1, idx = y2 * W2; y2 < H2; y2++, idx = y2 * W2) {
    edits[idx] = y2;
    shifts[idx] = 1;
    state[idx] = 2;
  }

  for (let y1 = 0, y2 = 1; y1 < H; y1++, y2++) {
    for (let x1 = 0, x2 = 1; x1 < W; x1++, x2++) {
      const idx = y2 * W2 + x2;
      const left = y2 * W2 + x1;
      const up = y1 * W2 + x2;
      const upLeft = y1 * W2 + x1;

      const diagEdits = (A[y1] !== B[x1]) ? Infinity : edits[upLeft];
      const leftEdits = edits[left] + 1;
      const upEdits = edits[up] + 1;

      const diagShifts = shifts[upLeft] + (state[upLeft] !== 0);
      const leftShifts = shifts[left] + (state[left] !== 1);
      const upShifts = shifts[up] + (state[up] !== 2);

      let bestEdits = diagEdits;
      let bestShifts = diagShifts;
      let bestState = 0;

      if (leftEdits < bestEdits || (leftEdits === bestEdits && leftShifts < bestShifts)) {
        bestEdits = leftEdits;
        bestShifts = leftShifts;
        bestState = 1;
      }
      if (upEdits < bestEdits || (upEdits === bestEdits && upShifts < bestShifts)) {
        bestEdits = upEdits;
        bestShifts = upShifts;
        bestState = 2;
      }

      edits[idx] = bestEdits;
      shifts[idx] = bestShifts;
      state[idx] = bestState;
    }
  }

  const res = new Uint32Array(L);
  for (let i = 0; i < L; i++) res[i] =
    (edits[i] << 16) | state[i];
  return res;
}

export function backtrace(table, A, B) {
  const W = B.length + 1;
  let n = table.length - 1;
  let res = [], match, ins, del;
  while (n > 0) {
    const y = Math.floor(n / W) - 1;
    const x = (n % W) - 1;
    const a = A[y];
    const b = B[x];
    let type;
    if (y < 0)
      type = "ins";
    else if (x < 0)
      type = "del";
    else {
      const now = table[n];
      const nowDirection = now & 0xF;
      if (!nowDirection) {
        type = "match";
      } else if (nowDirection === 1) {
        type = "ins";
      } else if (nowDirection === 2) {
        type = "del";
      }
    }
    type == "match" ? ins = del = undefined : match = undefined;

    if (type === "match")
      match ? (match.x--, match.y--, match.i++) :
        res.unshift(match = { type, x, y, i: 1 });
    else if (type === "ins")
      ins ? (ins.x--, ins.i++) :
        res.unshift(ins = { type: "ins", x, y, i: 1 });
    else if (type === "del")
      del ? (del.y--, del.i++) :
        res.unshift(del = { type: "del", x, y, i: 1 });

    if (type != "del") n -= 1;
    if (type != "ins") n -= W;
  }
  return res;
}

function hackFix(res) {
  if (res.length !== 3) return;
  if (res[1].a !== res[1].b) return;
  if (!res[0].b.length && !res[2].b.length && JSON.stringify(res[1].a) === JSON.stringify(res[2].a))
    return (res[0].a = res[0].a.concat(res[2].a)), res.slice(0, 2);
  if (!res[0].a.length && !res[2].a.length && JSON.stringify(res[1].b) === JSON.stringify(res[2].b))
    return (res[0].b = res[0].b.concat(res[2].b)), res.slice(0, 2);
}

export function diffRaw(A, B) {
  if (!A.length && !B.length) return [];
  if (!A.length) return [{ type: "ins", x: 0, y: 0, i: B.length, a: A, b: B }];
  if (!B.length) return [{ type: "del", x: 0, y: 0, i: A.length, a: A, b: B }];
  const res = backtrace(levenshteinMinimalShifts(A, B), A, B);
  const empty = A instanceof Array || B instanceof Array ? Object.freeze([]) : "";
  for (let d of res) {
    d.a = d.type === "ins" ? empty : A.slice(d.y, d.y + d.i);
    d.b = d.type === "del" ? empty : B.slice(d.x, d.x + d.i);
  }
  return hackFix(res) ?? res;
}

function secondStep(diffs) {
  return diffs
    .flatMap(p => p.a === p.b || !p.a || !p.b ? p : diffRaw(p.a, p.b))
    .map(p => ({ ...p, a: p.a?.join(""), b: p.b?.join("") }));
}

export function diff(A, B) {
  if (A instanceof Array || B instanceof Array || (A.length * B.length) < 1_000_000)
    return diffRaw(A, B);
  const Aw = A.split(/(\s+)/), Bw = B.split(/(\s+)/);
  Aw[0] === "" && Aw.shift();
  Bw[0] === "" && Bw.shift();
  Aw[Aw.length - 1] === "" && Aw.pop();
  Bw[Bw.length - 1] === "" && Bw.pop();
  if ((Aw.length * Bw.length) < 1_000_000)
    return secondStep(diffRaw(Aw, Bw));
  return secondStep(diffRaw(A.split(/(\r?\n)/), B.split(/(\r?\n)/)));
}