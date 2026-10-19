/* Shared by the background worker, bounded fallback, and reproducible tests. */
'use strict';
function createAI() {
  const directions = ['left', 'up', 'right', 'down'];
  const rows = new Map();
  const corners = [0, 3, 12, 15];
  let anchor = 0, deadline = 0, nodes = 0, cache;
  const timeout = {};
  function lineInfo(a) {
    const key = a.join(',');
    if (rows.has(key)) return rows.get(key);
    let empty = 0, merges = 0, previous = 0, sum = 0, up = 0, down = 0, smooth = 0;
    const packed = a.filter(Boolean), moved = [];
    for (let i = 0; i < 4; i++) {
      const v = a[i];
      if (!v) empty++;
      else { sum += v ** 3.5; if (previous === v) merges++; previous = v; }
      if (i < 3) {
        const delta = v ** 4 - a[i + 1] ** 4;
        up += Math.max(0, delta); down += Math.max(0, -delta);
        if (v && a[i + 1]) smooth += Math.abs(v - a[i + 1]);
      }
    }
    for (let i = 0; i < packed.length; i++) {
      if (packed[i] === packed[i + 1]) { moved.push(packed[i] + 1); i++; }
      else moved.push(packed[i]);
    }
    while (moved.length < 4) moved.push(0);
    const result = { moved, value: empty * 270 + merges * 700 - 47 * Math.min(up, down) - 11 * sum - smooth * 15 };
    // Bound persistent memory, including games beyond 32768.
    if (rows.size >= 70000) rows.clear();
    rows.set(key, result);
    return result;
  }
  const paths = directions.map((_, d) => Array.from({length: 4}, (_, r) =>
    Array.from({length: 4}, (_, c) => d === 0 ? r * 4 + c : d === 2 ? r * 4 + 3 - c : d === 1 ? c * 4 + r : (3 - c) * 4 + r)));
  function move(b, d) {
    const out = b.slice(); let changed = false;
    for (const ids of paths[d]) {
      const result = lineInfo(ids.map(i => b[i])).moved;
      ids.forEach((id, i) => { out[id] = result[i]; if (out[id] !== b[id]) changed = true; });
    }
    return changed ? out : null;
  }
  function quality(b) {
    let value = 0, max = 0, empty = 0, legal = false;
    for (let i = 0; i < 16; i++) {
      max = Math.max(max, b[i]); if (!b[i]) empty++;
      if ((i % 4 < 3 && b[i] === b[i + 1]) || (i < 12 && b[i] === b[i + 4])) legal = true;
    }
    if (!empty && !legal) return -1e9;
    for (let r = 0; r < 4; r++) {
      value += lineInfo(b.slice(r * 4, r * 4 + 4)).value;
      value += lineInfo([b[r], b[r + 4], b[r + 8], b[r + 12]]).value;
    }
    // A soft anchor: escaping the corner is always allowed to avoid death.
    value -= (max ** 3 - b[anchor] ** 3) * 100;
    let snake = -Infinity;
    for (let transpose = 0; transpose < 2; transpose++) {
      let score = 0;
      for (let k = 0; k < 16; k++) {
        let r = k >> 2, c = k % 4; if (r % 2) c = 3 - c;
        if (transpose) [r, c] = [c, r];
        if (anchor >= 12) r = 3 - r; if (anchor % 4 === 3) c = 3 - c;
        score += b[r * 4 + c] ** 3 * (16 - k);
      }
      snake = Math.max(snake, score);
    }
    return value + snake * 2 - (empty < 3 ? (3 - empty) ** 2 * 800 : 0);
  }
  function search(b, depth, chance) {
    if ((++nodes & 127) === 0 && performance.now() >= deadline) throw timeout;
    if (!depth && !chance) return quality(b);
    const key = b.join(',') + ':' + depth + ':' + Number(chance);
    if (cache.has(key)) return cache.get(key);
    let value;
    if (chance) {
      const empty = []; b.forEach((v, i) => { if (!v) empty.push(i); });
      if (!empty.length) return search(b, depth, false);
      value = 0;
      for (const i of empty) {
        const next = b.slice(); next[i] = 1;
        value += .9 * search(next, depth, false);
        next[i] = 2; value += .1 * search(next, depth, false);
      }
      value /= empty.length;
    } else {
      value = -1e9;
      for (let d = 0; d < 4; d++) {
        const next = move(b, d);
        if (next) value = Math.max(value, search(next, depth - 1, true));
      }
    }
    if (cache.size < 60000) cache.set(key, value);
    return value;
  }
  function choose(board, budget = 90) {
    deadline = performance.now() + Math.max(1, Math.min(200, budget)); nodes = 0; cache = new Map();
    const b = board.map(v => v ? Math.log2(v) : 0), max = Math.max(...b);
    if (b[anchor] !== max) {
      const candidate = corners.find(i => b[i] === max);
      if (candidate !== undefined) anchor = candidate;
      else anchor = corners.reduce((a, i) => b[i] > b[a] ? i : a, anchor);
    }
    const moves = [];
    for (let d = 0; d < 4; d++) { const next = move(b, d); if (next) moves.push({d, next, value: quality(next)}); }
    if (!moves.length) return null;
    moves.sort((a, z) => z.value - a.value);
    let answer = moves[0].d;
    const empty = b.filter(v => !v).length, limit = empty >= 8 ? 3 : empty >= 4 ? 4 : 6;
    for (let depth = 1; depth <= limit; depth++) {
      let best = -Infinity, selected = answer;
      try {
        for (const m of moves) {
          const value = search(m.next, depth - 1, true);
          if (value > best) { best = value; selected = m.d; }
        }
      } catch (error) { if (error !== timeout) throw error; break; }
      answer = selected; // Only completed iterations may replace the decision.
      if (performance.now() >= deadline) break;
    }
    cache.clear();
    return directions[answer];
  }
  return {choose, quality, move};
}
if (typeof module !== 'undefined') module.exports = {createAI};
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const ai = createAI();
  self.onmessage = ({data}) => self.postMessage({id: data.id, dir: ai.choose(data.board, data.budget)});
}
