export class LoopCube {
  static compareSmall(compare, old, now) {
    const exact = new Array(now.length);
    const unused = [];
    if (!old?.length)
      return { exact, unused };
    main: for (let o = 0; o < old.length; o++) {
      for (let n = 0; n < now.length; n++) {
        if (!exact[n] && compare(old[o], now[n])) {
          exact[n] = o;
          continue main;
        }
      }
      unused.push(o);
    }
    return { exact, unused };
  }

  constructor(embrace, compare = (a, b) => a === b) {
    this.embrace = embrace;
    this.now = [];
    this.nowEmbraces = [];
    this.comparator = LoopCube.compareSmall.bind(null, compare);
  }

  step(now = []) {
    const old = this.now;
    const oldEmbraces = this.nowEmbraces;
    this.now = now;
    const { exact, unused } = this.comparator(old, now);
    const embraces = new Array(now.length);
    const changed = [];
    for (let n = 0; n < exact.length; n++) {
      const o = exact[n];
      if (o != null) {
        embraces[n] = oldEmbraces[o];
      } else {
        changed.push(n);
        embraces[n] = unused.length ? oldEmbraces[unused.shift()] : this.embrace.clone();
      }
    }
    this.nowEmbraces = embraces;
    const removes = unused.map(o => oldEmbraces[o]);
    return { embraces, removes, changed };
  }
}