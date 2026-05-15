/* manatane prototype - games.js
 * Step 10: ミニゲーム「うっかりチェック」
 * 仕様書セクション 9.6, 9.6.1
 */
'use strict';

(function () {
  // 9.6.1: 制限時間30秒
  const GAME_DURATION_MS = 30000;
  const SPAWN_INTERVAL_MS = 650;
  const SHAPE_LIFETIME_MS = 1300;
  const SHAPE_SIZE = 56;

  // 9.6.1: 青い丸だけタップする。赤い丸、青い三角、黄色い丸はタップしない。
  const SHAPE_TYPES = [
    { kind: 'blue-circle',    isTarget: true,  weight: 4 },
    { kind: 'red-circle',     isTarget: false, weight: 2 },
    { kind: 'blue-triangle',  isTarget: false, weight: 2 },
    { kind: 'yellow-circle',  isTarget: false, weight: 2 },
  ];

  let running = false;
  let endTime = 0;
  let timerIntervalId = null;
  let spawnIntervalId = null;
  let stats = null;
  let activeShapes = [];
  let areaEl = null;
  let timerEl = null;
  let startBtnEl = null;

  function resetStats() {
    stats = {
      correctTapCount: 0,
      wrongTapCount: 0,
      missCount: 0,
      totalTapCount: 0,
    };
  }

  function pickShapeType() {
    const total = SHAPE_TYPES.reduce(function (s, t) { return s + t.weight; }, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SHAPE_TYPES.length; i += 1) {
      r -= SHAPE_TYPES[i].weight;
      if (r <= 0) return SHAPE_TYPES[i];
    }
    return SHAPE_TYPES[0];
  }

  function clearAllShapes() {
    activeShapes.forEach(function (s) {
      if (s.timeoutId) clearTimeout(s.timeoutId);
      if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
    });
    activeShapes = [];
  }

  function spawnShape() {
    if (!running || !areaEl) return;
    const t = pickShapeType();
    const el = document.createElement('div');
    el.className = 'game-shape game-shape-' + t.kind;
    el.setAttribute('aria-label', t.isTarget ? '青い丸' : t.kind);

    const rect = areaEl.getBoundingClientRect();
    const maxX = Math.max(0, Math.floor(rect.width  - SHAPE_SIZE));
    const maxY = Math.max(0, Math.floor(rect.height - SHAPE_SIZE));
    el.style.left = Math.floor(Math.random() * (maxX + 1)) + 'px';
    el.style.top  = Math.floor(Math.random() * (maxY + 1)) + 'px';

    const entry = { el: el, timeoutId: null, consumed: false, isTarget: t.isTarget };

    function onTap(e) {
      e.preventDefault();
      if (!running || entry.consumed) return;
      entry.consumed = true;
      stats.totalTapCount += 1;
      if (entry.isTarget) {
        stats.correctTapCount += 1;
      } else {
        stats.wrongTapCount += 1;
      }
      removeShape(entry, false);
    }
    el.addEventListener('click', onTap);

    entry.timeoutId = setTimeout(function () {
      if (entry.consumed) return;
      entry.consumed = true;
      // 9.6.1: missCount は「青い丸を時間内にタップできなかった数」
      if (entry.isTarget) {
        stats.missCount += 1;
      }
      removeShape(entry, true);
    }, SHAPE_LIFETIME_MS);

    areaEl.appendChild(el);
    activeShapes.push(entry);
  }

  function removeShape(entry, expired) {
    if (entry.timeoutId && !expired) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
    if (entry.el && entry.el.parentNode) {
      entry.el.parentNode.removeChild(entry.el);
    }
    const i = activeShapes.indexOf(entry);
    if (i !== -1) activeShapes.splice(i, 1);
  }

  function tickTimer() {
    const remaining = Math.max(0, endTime - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    if (timerEl) timerEl.textContent = '残り ' + seconds + '秒';
    if (remaining <= 0) {
      endGame(false);
    }
  }

  // 9.6.1 結果変換ルール（優先順位通り評価）
  function computeGameResult(s) {
    if (!s) return 'free_explore';
    if (s.wrongTapCount <= 3 && s.correctTapCount >= 15) return 'first_try';
    if (s.wrongTapCount <= 3 && s.correctTapCount <  15) return 'deep_understanding';
    if (s.totalTapCount  <= 10)                          return 'free_explore';
    return 'step_by_step';
  }

  function startGame() {
    if (running) return;
    areaEl = document.getElementById('game-area');
    timerEl = document.getElementById('game-timer');
    startBtnEl = document.getElementById('game-start');
    if (!areaEl || !timerEl) return;

    resetStats();
    clearAllShapes();
    if (areaEl) areaEl.innerHTML = '';
    if (startBtnEl) startBtnEl.hidden = true;
    if (timerEl) timerEl.classList.add('is-running');

    running = true;
    endTime = Date.now() + GAME_DURATION_MS;
    tickTimer();
    timerIntervalId = setInterval(tickTimer, 200);
    spawnIntervalId = setInterval(spawnShape, SPAWN_INTERVAL_MS);
    spawnShape();
  }

  function endGame(cancelled) {
    if (!running) return;
    running = false;
    if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
    if (spawnIntervalId) { clearInterval(spawnIntervalId); spawnIntervalId = null; }
    clearAllShapes();
    if (startBtnEl) startBtnEl.hidden = false;
    if (timerEl) {
      timerEl.classList.remove('is-running');
      timerEl.textContent = '残り 0秒';
    }
    if (cancelled) return;

    const resultId = computeGameResult(stats);
    if (window.manatane && typeof window.manatane.completeGame === 'function') {
      window.manatane.completeGame({
        stats: {
          correctTapCount: stats.correctTapCount,
          wrongTapCount:   stats.wrongTapCount,
          missCount:       stats.missCount,
          totalTapCount:   stats.totalTapCount,
        },
        result_id: resultId,
      });
    }
  }

  function stopGame() {
    // 画面遷移など外部要因で中断するためのキャンセル
    endGame(true);
    if (timerEl) timerEl.textContent = '残り 30秒';
  }

  function resetGameUI() {
    if (running) {
      stopGame();
    }
    const t = document.getElementById('game-timer');
    if (t) t.textContent = '残り 30秒';
    const sb = document.getElementById('game-start');
    if (sb) sb.hidden = false;
    const a = document.getElementById('game-area');
    if (a) a.innerHTML = '';
  }

  window.manatane = window.manatane || {};
  window.manatane.startGame = startGame;
  window.manatane.stopGame = stopGame;
  window.manatane.resetGameUI = resetGameUI;
  window.manatane.computeGameResult = computeGameResult;
})();
