/* manatane prototype v0.3 - games.js
 * 仕様書セクション 9.6, 10.7
 * 実装: スライドパズル4×4、迷路8×8
 */
'use strict';

(function () {
  // ===== 共通 =====
  const GAME_DURATION_MS = 120000; // 120秒 (9.6.2, 9.6.3)

  let activeGameType = null;
  let isRunning = false;
  let startedAt = 0;
  let endTime = 0;
  let firstMoveAt = 0;
  let timerIntervalId = null;
  let giveUpCount = 0;

  // ----- スライドパズル状態 -----
  let spBoard = null;
  let spInitialOptimal = 0;
  let spMoves = 0;
  let spPieceMoveCount = null;
  let spBacktrackCount = 0;

  // ----- 迷路状態 -----
  let mzCells = null;
  let mzPos = null;
  let mzVisited = null;
  let mzPath = [];
  let mzOptimalPath = 0;
  let mzDeadEndCount = 0;
  let mzBacktrackCells = 0;

  // ===== タイマー =====
  function startTimer() {
    startedAt = Date.now();
    endTime = startedAt + GAME_DURATION_MS;
    firstMoveAt = 0;
    tickTimer();
    timerIntervalId = setInterval(tickTimer, 200);
  }
  function stopTimer() {
    if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
  }
  function tickTimer() {
    const remaining = Math.max(0, endTime - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const text = '残り ' + seconds + '秒';
    if (activeGameType === 'slide_puzzle') {
      const t = document.getElementById('sp-timer'); if (t) t.textContent = text;
    } else if (activeGameType === 'maze') {
      const t = document.getElementById('mz-timer'); if (t) t.textContent = text;
    }
    if (remaining <= 0) endGame(false, false);
  }
  function recordFirstMove() { if (firstMoveAt === 0) firstMoveAt = Date.now(); }

  // ===== スライドパズル =====
  const SP_SHUFFLE_MOVES = 20;

  function spSolved() { return [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]; }
  function spFindEmpty(b) { return b.indexOf(0); }
  function spNeighbors(idx) {
    const r = Math.floor(idx / 4), c = idx % 4;
    const ns = [];
    if (r > 0) ns.push(idx - 4);
    if (r < 3) ns.push(idx + 4);
    if (c > 0) ns.push(idx - 1);
    if (c < 3) ns.push(idx + 1);
    return ns;
  }
  function spShuffle(board, moves) {
    let empty = spFindEmpty(board);
    let prev = -1;
    for (let i = 0; i < moves; i += 1) {
      const ns = spNeighbors(empty).filter(n => n !== prev);
      const swap = ns[Math.floor(Math.random() * ns.length)];
      [board[empty], board[swap]] = [board[swap], board[empty]];
      prev = empty;
      empty = swap;
    }
  }
  function spManhattan(board) {
    let total = 0;
    for (let i = 0; i < 16; i += 1) {
      const v = board[i];
      if (v === 0) continue;
      const goal = v - 1;
      total += Math.abs(Math.floor(goal/4) - Math.floor(i/4)) + Math.abs((goal%4) - (i%4));
    }
    return total;
  }
  function spIsSolved(b) {
    for (let i = 0; i < 15; i += 1) if (b[i] !== i + 1) return false;
    return true;
  }
  function spRender() {
    const grid = document.getElementById('sp-board');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 16; i += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      const v = spBoard[i];
      if (v === 0) {
        cell.className = 'sp-cell sp-cell-empty';
        cell.disabled = true;
      } else {
        cell.className = 'sp-cell';
        cell.textContent = String(v);
        cell.addEventListener('click', () => spTryMove(i));
      }
      grid.appendChild(cell);
    }
    const m = document.getElementById('sp-moves');
    if (m) m.textContent = '手数 ' + spMoves;
  }
  function spTryMove(idx) {
    if (!isRunning) return;
    const empty = spFindEmpty(spBoard);
    if (spNeighbors(empty).indexOf(idx) === -1) return;
    const piece = spBoard[idx];
    [spBoard[empty], spBoard[idx]] = [spBoard[idx], spBoard[empty]];
    spMoves += 1;
    spPieceMoveCount[piece] = (spPieceMoveCount[piece] || 0) + 1;
    if (spPieceMoveCount[piece] >= 2) spBacktrackCount += 1;
    recordFirstMove();
    spRender();
    if (spIsSolved(spBoard)) endGame(true, false);
  }
  function spStart() {
    activeGameType = 'slide_puzzle';
    spBoard = spSolved();
    spShuffle(spBoard, SP_SHUFFLE_MOVES);
    spInitialOptimal = Math.max(1, spManhattan(spBoard));
    spMoves = 0;
    spPieceMoveCount = {};
    spBacktrackCount = 0;
    isRunning = true;
    spRender();
    startTimer();
    setBtn('sp-start', true, true);
    setBtn('sp-reset', false, true);
    setBtn('sp-end', false, true);
  }
  function spReset() {
    if (!isRunning) return;
    giveUpCount += 1;
    spBoard = spSolved();
    spShuffle(spBoard, SP_SHUFFLE_MOVES);
    spInitialOptimal = Math.max(1, spManhattan(spBoard));
    spMoves = 0;
    spPieceMoveCount = {};
    spBacktrackCount = 0;
    firstMoveAt = 0;
    spRender();
  }
  function spStats(completed) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const firstSec = firstMoveAt > 0 ? (firstMoveAt - startedAt) / 1000 : null;
    return {
      moves: spMoves,
      optimal_moves: spInitialOptimal,
      efficiency_ratio: spInitialOptimal > 0 ? spMoves / spInitialOptimal : 0,
      backtrack_count: spBacktrackCount,
      elapsed_seconds: elapsed,
      completed: !!completed,
      give_up_count: giveUpCount,
      first_move_seconds: firstSec,
    };
  }
  // 10.7 軸C・軸D（スライドパズル）
  function spComputeAxes(s) {
    let axisC, axisD;
    if (s.give_up_count >= 1 || !s.completed) axisC = 'C3';
    else if (s.efficiency_ratio < 1.5 && s.backtrack_count < 15) axisC = 'C2';
    else if (s.efficiency_ratio > 2.0) axisC = 'C1';
    else axisC = 'C2';
    if (!s.completed || s.give_up_count >= 2) axisD = 'D1';
    else if (s.elapsed_seconds < 60) axisD = 'D2';
    else axisD = 'D3';
    return { axisC, axisD };
  }
  // 10.7 行動傾向タグ（スライドパズル）
  function spComputeTraits(s) {
    const t = [];
    if (s.efficiency_ratio < 1.3 && s.backtrack_count < 10) t.push('planning');
    if (s.efficiency_ratio > 2.0 && s.elapsed_seconds < 60) t.push('quick_action');
    if (s.efficiency_ratio > 1.5 && s.backtrack_count > 20) t.push('exploration');
    if (s.backtrack_count > 30 && s.elapsed_seconds > 180) t.push('cautious');
    if (s.give_up_count === 0 && s.completed === true) t.push('persistence');
    if (s.give_up_count >= 2) t.push('switching');
    if (s.first_move_seconds !== null && s.first_move_seconds < 3) t.push('intuition');
    return t;
  }

  // ===== 迷路 =====
  const MZ_SIZE = 8;
  const W_TOP = 1, W_RIGHT = 2, W_BOTTOM = 4, W_LEFT = 8;

  function mzGenerate() {
    const cells = Array.from({length: MZ_SIZE}, () =>
      Array.from({length: MZ_SIZE}, () => W_TOP | W_RIGHT | W_BOTTOM | W_LEFT));
    const visited = Array.from({length: MZ_SIZE}, () => Array(MZ_SIZE).fill(false));
    const stack = [[0, 0]];
    visited[0][0] = true;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const dirs = [
        [-1, 0, W_TOP, W_BOTTOM],
        [0, 1, W_RIGHT, W_LEFT],
        [1, 0, W_BOTTOM, W_TOP],
        [0, -1, W_LEFT, W_RIGHT],
      ];
      // shuffle
      for (let i = dirs.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }
      let advanced = false;
      for (const [dr, dc, w1, w2] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= MZ_SIZE || nc < 0 || nc >= MZ_SIZE) continue;
        if (visited[nr][nc]) continue;
        cells[r][c] &= ~w1;
        cells[nr][nc] &= ~w2;
        visited[nr][nc] = true;
        stack.push([nr, nc]);
        advanced = true;
        break;
      }
      if (!advanced) stack.pop();
    }
    return cells;
  }

  function mzBFS(cells, sr, sc, gr, gc) {
    const dist = Array.from({length: MZ_SIZE}, () => Array(MZ_SIZE).fill(-1));
    dist[sr][sc] = 0;
    const queue = [[sr, sc]];
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r === gr && c === gc) return dist[r][c];
      const w = cells[r][c];
      const moves = [];
      if (!(w & W_TOP)    && r > 0)         moves.push([r-1, c]);
      if (!(w & W_RIGHT)  && c < MZ_SIZE-1) moves.push([r, c+1]);
      if (!(w & W_BOTTOM) && r < MZ_SIZE-1) moves.push([r+1, c]);
      if (!(w & W_LEFT)   && c > 0)         moves.push([r, c-1]);
      for (const [nr, nc] of moves) {
        if (dist[nr][nc] === -1) {
          dist[nr][nc] = dist[r][c] + 1;
          queue.push([nr, nc]);
        }
      }
    }
    return -1;
  }

  function mzRender() {
    const grid = document.getElementById('mz-board');
    if (!grid) return;
    grid.innerHTML = '';
    for (let r = 0; r < MZ_SIZE; r += 1) {
      for (let c = 0; c < MZ_SIZE; c += 1) {
        const cell = document.createElement('div');
        cell.className = 'mz-cell';
        const w = mzCells[r][c];
        if (w & W_TOP)    cell.classList.add('w-top');
        if (w & W_RIGHT)  cell.classList.add('w-right');
        if (w & W_BOTTOM) cell.classList.add('w-bottom');
        if (w & W_LEFT)   cell.classList.add('w-left');
        if (r === mzPos[0] && c === mzPos[1]) cell.classList.add('is-player');
        if (r === MZ_SIZE - 1 && c === MZ_SIZE - 1) cell.classList.add('is-goal');
        if (r === 0 && c === 0) cell.classList.add('is-start');
        grid.appendChild(cell);
      }
    }
  }

  function mzCanMove(dir) {
    const [r, c] = mzPos;
    const w = mzCells[r][c];
    if (dir === 'up')    return !(w & W_TOP)    && r > 0;
    if (dir === 'right') return !(w & W_RIGHT)  && c < MZ_SIZE - 1;
    if (dir === 'down')  return !(w & W_BOTTOM) && r < MZ_SIZE - 1;
    if (dir === 'left')  return !(w & W_LEFT)   && c > 0;
    return false;
  }

  function mzMove(dir) {
    if (!isRunning) return;
    if (!mzCanMove(dir)) return;
    let [r, c] = mzPos;
    if (dir === 'up') r -= 1;
    else if (dir === 'down') r += 1;
    else if (dir === 'left') c -= 1;
    else if (dir === 'right') c += 1;
    mzPos = [r, c];
    mzPath.push([r, c]);
    recordFirstMove();
    const key = r + ',' + c;
    if (mzVisited.has(key)) mzBacktrackCells += 1;
    mzVisited.add(key);
    // dead-end: 出口が1つ（=戻り道のみ）かつゴールでない
    const w = mzCells[r][c];
    let exits = 0;
    if (!(w & W_TOP)    && r > 0)            exits += 1;
    if (!(w & W_RIGHT)  && c < MZ_SIZE - 1)  exits += 1;
    if (!(w & W_BOTTOM) && r < MZ_SIZE - 1)  exits += 1;
    if (!(w & W_LEFT)   && c > 0)            exits += 1;
    if (exits === 1 && !(r === MZ_SIZE - 1 && c === MZ_SIZE - 1)) mzDeadEndCount += 1;
    mzRender();
    if (r === MZ_SIZE - 1 && c === MZ_SIZE - 1) endGame(true, false);
  }

  function mzStart() {
    activeGameType = 'maze';
    mzCells = mzGenerate();
    mzPos = [0, 0];
    mzVisited = new Set(['0,0']);
    mzPath = [[0, 0]];
    mzDeadEndCount = 0;
    mzBacktrackCells = 0;
    mzOptimalPath = mzBFS(mzCells, 0, 0, MZ_SIZE - 1, MZ_SIZE - 1);
    isRunning = true;
    mzRender();
    startTimer();
    setBtn('mz-start', true, true);
    setBtn('mz-reset', false, true);
    setBtn('mz-end', false, true);
  }
  function mzReset() {
    if (!isRunning) return;
    giveUpCount += 1;
    mzCells = mzGenerate();
    mzPos = [0, 0];
    mzVisited = new Set(['0,0']);
    mzPath = [[0, 0]];
    mzDeadEndCount = 0;
    mzBacktrackCells = 0;
    mzOptimalPath = mzBFS(mzCells, 0, 0, MZ_SIZE - 1, MZ_SIZE - 1);
    firstMoveAt = 0;
    mzRender();
  }
  function mzStats(completed) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const firstSec = firstMoveAt > 0 ? (firstMoveAt - startedAt) / 1000 : null;
    const pathLen = Math.max(0, mzPath.length - 1);
    const optimal = mzOptimalPath > 0 ? mzOptimalPath : Math.max(1, pathLen);
    return {
      elapsed_seconds: elapsed,
      path_length: pathLen,
      optimal_path_length: optimal,
      detour_ratio: optimal > 0 ? pathLen / optimal : 0,
      dead_end_count: mzDeadEndCount,
      backtrack_cells: mzBacktrackCells,
      completed: !!completed,
      give_up_count: giveUpCount,
      first_move_seconds: firstSec,
    };
  }
  // 10.7 軸C・軸D（迷路）
  function mzComputeAxes(s) {
    let axisC, axisD;
    if (s.give_up_count >= 1 || !s.completed) axisC = 'C3';
    else if (s.detour_ratio < 1.3) axisC = 'C2';
    else if (s.detour_ratio > 1.8) axisC = 'C1';
    else axisC = 'C2';
    if (!s.completed || s.give_up_count >= 2) axisD = 'D1';
    else if (s.elapsed_seconds < 60) axisD = 'D2';
    else axisD = 'D3';
    return { axisC, axisD };
  }
  // 10.7 行動傾向タグ（迷路）
  function mzComputeTraits(s) {
    const t = [];
    if (s.detour_ratio < 1.2) t.push('planning');
    if (s.detour_ratio > 1.8 && s.dead_end_count > 5) t.push('exploration');
    if (s.path_length > 0 && s.backtrack_cells > s.path_length * 0.3) t.push('cautious');
    if (s.elapsed_seconds < 30 && s.detour_ratio > 1.5) t.push('quick_action');
    if (s.give_up_count === 0 && s.completed === true) t.push('persistence');
    if (s.give_up_count >= 2) t.push('switching');
    if (s.first_move_seconds !== null && s.first_move_seconds < 3) t.push('intuition');
    return t;
  }

  // ===== 終了処理 =====
  function endGame(completed, cancelled) {
    if (!isRunning) return;
    isRunning = false;
    stopTimer();
    if (cancelled) {
      activeGameType = null;
      return;
    }
    let stats, axes, traits;
    if (activeGameType === 'slide_puzzle') {
      stats = spStats(completed);
      axes = spComputeAxes(stats);
      traits = spComputeTraits(stats);
    } else if (activeGameType === 'maze') {
      stats = mzStats(completed);
      axes = mzComputeAxes(stats);
      traits = mzComputeTraits(stats);
    } else {
      return;
    }
    const gtype = activeGameType;
    activeGameType = null;
    if (window.manatane && typeof window.manatane.completeGame === 'function') {
      window.manatane.completeGame({
        game_type: gtype,
        completed: stats.completed,
        stats: stats,
        axis_c: axes.axisC,
        axis_d: axes.axisD,
        behavior_traits: traits,
      });
    }
  }

  function endByUser() { if (isRunning) endGame(false, false); }

  // ===== UI ユーティリティ =====
  function setBtn(id, hidden, exists) {
    const el = document.getElementById(id);
    if (el) el.hidden = !!hidden;
  }

  // ===== 外部API =====
  function startGame(gameType) {
    if (isRunning) return;
    giveUpCount = 0;
    if (gameType === 'slide_puzzle') spStart();
    else if (gameType === 'maze') mzStart();
  }
  function resetGame(gameType) {
    if (!isRunning) return;
    if (gameType === 'slide_puzzle') spReset();
    else if (gameType === 'maze') mzReset();
  }
  function stopGame() { endGame(false, true); }

  function resetGameUI(gameType) {
    if (gameType === 'slide_puzzle') {
      const b = document.getElementById('sp-board'); if (b) b.innerHTML = '';
      const t = document.getElementById('sp-timer'); if (t) t.textContent = '残り 120秒';
      setBtn('sp-start', false, true);
      setBtn('sp-reset', true, true);
      setBtn('sp-end', true, true);
      const m = document.getElementById('sp-moves'); if (m) m.textContent = '手数 0';
    } else if (gameType === 'maze') {
      const b = document.getElementById('mz-board'); if (b) b.innerHTML = '';
      const t = document.getElementById('mz-timer'); if (t) t.textContent = '残り 120秒';
      setBtn('mz-start', false, true);
      setBtn('mz-reset', true, true);
      setBtn('mz-end', true, true);
    }
  }

  // 方向ボタンと「結果を見る」を捕捉
  document.addEventListener('click', e => {
    const dirBtn = e.target.closest('[data-mz-dir]');
    if (dirBtn) {
      e.preventDefault();
      mzMove(dirBtn.getAttribute('data-mz-dir'));
      return;
    }
    const endBtn = e.target.closest('[data-game-end]');
    if (endBtn) {
      e.preventDefault();
      endByUser();
      return;
    }
  });

  window.manatane = window.manatane || {};
  window.manatane.startGame = startGame;
  window.manatane.resetGame = resetGame;
  window.manatane.stopGame = stopGame;
  window.manatane.resetGameUI = resetGameUI;
  // テスト用に公開（内部関数）
  window.manatane._gameInternals = {
    spComputeAxes, spComputeTraits, mzComputeAxes, mzComputeTraits, mzBFS, mzGenerate,
  };
})();
