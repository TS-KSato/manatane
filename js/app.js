/* manatane prototype - app.js
 * Step 2: screen transitions (仕様書 8, 9, 15)
 * Step 3: JSON データ読み込み (仕様書 5, 13, 17.1)
 * Step 4: 占い風診断 (仕様書 9.5, 13.1)
 */
'use strict';

(function () {
  const DATA_FILES = {
    questions: 'data/questions.json',
    quizzes: 'data/quizzes.json',
    results: 'data/results.json',
    guides: 'data/guides.json',
    routes: 'data/routes.json',
  };

  const SCREENS = [
    'home',
    'purpose',
    'diagnosis-type',
    'quiz',
    'mood',
    'game',
    'result',
    'guide',
    'routes',
    'save',
    'error',
  ];

  const screenElements = {};
  const history = [];
  let currentScreen = 'home';
  let hasResult = false;

  // 診断セッションの状態
  const STATE = {
    purpose: null,
    diagnosisType: null,
    moodAnswers: [],
    quizAnswers: [],
    gameResult: null,
    resultId: null,
  };

  function resetSession() {
    STATE.purpose = null;
    STATE.diagnosisType = null;
    STATE.moodAnswers = [];
    STATE.quizAnswers = [];
    STATE.gameResult = null;
    STATE.resultId = null;
    hasResult = false;
  }

  // 占い風診断 (9.5)
  let moodSession = [];
  let moodIndex = 0;

  function cacheScreens() {
    SCREENS.forEach(function (name) {
      screenElements[name] = document.getElementById('screen-' + name);
    });
  }

  function showScreen(name, options) {
    options = options || {};
    if (!screenElements[name]) {
      return;
    }
    if (!options.replace && currentScreen && currentScreen !== name) {
      history.push(currentScreen);
    }
    SCREENS.forEach(function (key) {
      const el = screenElements[key];
      if (!el) {
        return;
      }
      if (key === name) {
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    currentScreen = name;
    updateNavState(name);
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (history.length === 0) {
      showScreen('home', { replace: true });
      return;
    }
    const prev = history.pop();
    showScreen(prev, { replace: true });
  }

  function updateNavState(name) {
    const buttons = document.querySelectorAll('.bottom-nav .nav-btn');
    buttons.forEach(function (btn) {
      const target = btn.getAttribute('data-nav');
      let active = false;
      if (target === 'home' && name === 'home') active = true;
      if (target === 'diagnosis' && (name === 'purpose' || name === 'diagnosis-type' || name === 'quiz' || name === 'mood' || name === 'game' || name === 'result')) active = true;
      if (target === 'routes' && (name === 'routes' || name === 'guide')) active = true;
      if (target === 'save' && name === 'save') active = true;
      if (active) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  function handleAction(action) {
    switch (action) {
      case 'start':
        showScreen('purpose');
        break;
      case 'back':
        goBack();
        break;
      case 'reload':
        window.location.reload();
        break;
    }
  }

  function handleGo(target) {
    switch (target) {
      case 'home':
        history.length = 0;
        showScreen('home', { replace: true });
        break;
      case 'purpose':
        showScreen('purpose');
        break;
      case 'guide':
        showScreen('guide');
        break;
      case 'routes':
        showScreen('routes');
        break;
      case 'result':
        showScreen('result');
        break;
      case 'save':
        showScreen('save');
        break;
    }
  }

  function handleNav(nav) {
    switch (nav) {
      case 'home':
        history.length = 0;
        showScreen('home', { replace: true });
        break;
      case 'diagnosis':
        showScreen('purpose');
        break;
      case 'routes':
        // 15.1: 結果未確定なら目的選択画面へ
        if (hasResult) {
          showScreen('routes');
        } else {
          showScreen('purpose');
        }
        break;
      case 'save':
        showScreen('save');
        break;
    }
  }

  function handlePurposeSelect(purposeId) {
    // 新しい診断セッションの開始: 既存の回答を全てクリア
    resetSession();
    STATE.purpose = purposeId;
    showScreen('diagnosis-type');
  }

  function handleDiagnosisSelect(diagnosisType) {
    STATE.diagnosisType = diagnosisType;
    switch (diagnosisType) {
      case 'quiz':
        showScreen('quiz');
        break;
      case 'mood':
        startMoodSession();
        showScreen('mood');
        break;
      case 'game':
        showScreen('game');
        break;
    }
  }

  // ===== 占い風診断 (9.5, 13.1) =====

  function startMoodSession() {
    const all = (window.manatane.data && window.manatane.data.questions) || [];
    moodSession = all.slice();
    moodIndex = 0;
    STATE.moodAnswers = [];
    renderMoodQuestion();
  }

  function renderMoodQuestion() {
    const q = moodSession[moodIndex];
    if (!q) {
      finishDiagnosis();
      return;
    }
    const total = moodSession.length;
    const progressEl = document.getElementById('mood-progress');
    if (progressEl) {
      progressEl.textContent = '質問 ' + (moodIndex + 1) + ' / ' + total;
    }
    const qText = document.querySelector('#mood-question .quiz-question-text');
    if (qText) {
      qText.textContent = q.question;
    }
    const ansEl = document.getElementById('mood-answers');
    if (!ansEl) return;
    ansEl.innerHTML = '';
    q.answers.forEach(function (a) {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        handleMoodAnswer(q, a);
      });
      ansEl.appendChild(btn);
    });
  }

  function handleMoodAnswer(question, answer) {
    STATE.moodAnswers.push({
      question_id: question.question_id,
      answer_id: answer.answer_id,
      scores: answer.scores || {},
    });
    moodIndex += 1;
    if (moodIndex >= moodSession.length) {
      finishDiagnosis();
    } else {
      renderMoodQuestion();
    }
  }

  // 診断完了時の処理。Step 6 で結果算出・描画を追加する。
  function finishDiagnosis() {
    showScreen('result', { replace: true });
  }

  function attachListeners() {
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action], [data-go], [data-nav], [data-purpose], [data-diagnosis]');
      if (!target) {
        return;
      }
      if (target.hasAttribute('data-action')) {
        handleAction(target.getAttribute('data-action'));
        return;
      }
      if (target.hasAttribute('data-go')) {
        handleGo(target.getAttribute('data-go'));
        return;
      }
      if (target.hasAttribute('data-nav')) {
        handleNav(target.getAttribute('data-nav'));
        return;
      }
      if (target.hasAttribute('data-purpose')) {
        handlePurposeSelect(target.getAttribute('data-purpose'));
        return;
      }
      if (target.hasAttribute('data-diagnosis')) {
        handleDiagnosisSelect(target.getAttribute('data-diagnosis'));
        return;
      }
    });
  }

  function showError(message) {
    const errorMsgEl = document.getElementById('error-message');
    if (errorMsgEl && message) {
      errorMsgEl.textContent = message;
    }
    SCREENS.forEach(function (key) {
      const el = screenElements[key];
      if (!el) return;
      el.hidden = (key !== 'error');
    });
    currentScreen = 'error';
  }

  function loadJson(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' for ' + path);
      }
      return res.json();
    });
  }

  function loadAllData() {
    const keys = Object.keys(DATA_FILES);
    const promises = keys.map(function (key) { return loadJson(DATA_FILES[key]); });
    return Promise.all(promises).then(function (values) {
      const data = {};
      keys.forEach(function (key, i) {
        data[key] = values[i];
      });
      return data;
    });
  }

  function init() {
    cacheScreens();
    attachListeners();
    showScreen('home', { replace: true });

    loadAllData().then(function (data) {
      window.manatane.data = data;
      // 後続ステップ（4以降）はここで読み込んだデータを使用する。
    }).catch(function (err) {
      console.error('[manatane] data load failed:', err);
      showError('データを読み込めませんでした。ページを再読み込みしてください。');
    });
  }

  // 後続ステップから利用するための公開API
  window.manatane = window.manatane || {};
  window.manatane.setHasResult = function (value) {
    hasResult = !!value;
  };
  window.manatane.showScreen = showScreen;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
