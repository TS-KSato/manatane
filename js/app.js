/* manatane prototype - app.js
 * Step 2: screen transitions (仕様書 8, 9, 15)
 * Step 3: JSON データ読み込み (仕様書 5, 13, 17.1)
 * Step 4: 占い風診断 (仕様書 9.5, 13.1)
 * Step 5: クイズ診断 (仕様書 9.4, 13.2)
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

  // クイズ診断 (9.4)
  let quizSession = [];
  let quizIndex = 0;
  let quizPhase = 'answer'; // 'answer' | 'confidence'
  let quizCurrentAnswer = null;

  // 仕様書 9.4「今日の目的に近いジャンル」を解釈するためのマッピング。
  // データに該当ジャンルが3問なければランダムに3問取得する（9.4）。
  const PURPOSE_TO_GENRE = {
    life: 'life',
    curiosity: 'ai_it',
    hobby: 'creative',
    sidejob: 'money',
    weakness: 'writing',
    browse: null,
  };

  const CONFIDENCE_LABELS = {
    high: 'かなりある',
    medium: 'たぶんある',
    low: 'あまりない',
    guess: '勘',
  };

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
        startQuizSession();
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

  // ===== クイズ診断 (9.4, 13.2) =====

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function pickQuizzes(purposeId) {
    const all = (window.manatane.data && window.manatane.data.quizzes) || [];
    const wanted = PURPOSE_TO_GENRE[purposeId];
    let pool = [];
    if (wanted) {
      pool = all.filter(function (q) { return q.genre_id === wanted; });
    }
    if (pool.length < 3) {
      // 9.4: 該当ジャンルがない場合はランダムに3問取得する
      pool = all.slice();
    } else {
      pool = pool.slice();
    }
    shuffleInPlace(pool);
    return pool.slice(0, 3);
  }

  function startQuizSession() {
    quizSession = pickQuizzes(STATE.purpose);
    quizIndex = 0;
    STATE.quizAnswers = [];
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const q = quizSession[quizIndex];
    if (!q) {
      finishDiagnosis();
      return;
    }
    quizPhase = 'answer';
    quizCurrentAnswer = null;

    const total = quizSession.length;
    const progressEl = document.getElementById('quiz-progress');
    if (progressEl) {
      progressEl.textContent = '問題 ' + (quizIndex + 1) + ' / ' + total;
    }
    const qText = document.querySelector('#quiz-question .quiz-question-text');
    if (qText) {
      qText.textContent = q.question;
    }
    const ansEl = document.getElementById('quiz-answers');
    if (ansEl) {
      ansEl.innerHTML = '';
      q.answers.forEach(function (a) {
        const btn = document.createElement('button');
        btn.className = 'card-btn';
        btn.type = 'button';
        btn.textContent = a.label;
        btn.addEventListener('click', function () {
          handleQuizAnswer(q, a, btn);
        });
        ansEl.appendChild(btn);
      });
    }
    setHidden('quiz-feedback', true);
    setHidden('quiz-confidence', true);
  }

  function setHidden(id, hidden) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !!hidden;
  }

  function handleQuizAnswer(question, answer, btn) {
    if (quizPhase !== 'answer') return;
    quizPhase = 'confidence';
    quizCurrentAnswer = answer;

    // 9.4: 正誤を表示する。全選択肢を無効化し、正解と選んだ選択肢を視覚的に区別する。
    const ansEl = document.getElementById('quiz-answers');
    if (ansEl) {
      const buttons = ansEl.querySelectorAll('button');
      buttons.forEach(function (b) {
        b.disabled = true;
      });
      question.answers.forEach(function (a, i) {
        const b = buttons[i];
        if (!b) return;
        if (a.is_correct) {
          b.classList.add('is-correct');
        }
      });
      if (btn) {
        btn.classList.add(answer.is_correct ? 'is-correct' : 'is-wrong');
        btn.classList.add('is-selected');
      }
    }

    const fbText = document.getElementById('quiz-feedback-text');
    if (fbText) {
      fbText.textContent = answer.is_correct ? '正解です。' : '不正解です。';
      fbText.classList.remove('is-correct', 'is-wrong');
      fbText.classList.add(answer.is_correct ? 'is-correct' : 'is-wrong');
    }
    const expEl = document.getElementById('quiz-explanation');
    if (expEl) {
      expEl.textContent = question.explanation || '';
    }
    setHidden('quiz-feedback', false);
    setHidden('quiz-confidence', false);
  }

  function handleQuizConfidence(confidence) {
    if (quizPhase !== 'confidence') return;
    const q = quizSession[quizIndex];
    const a = quizCurrentAnswer;
    if (!q || !a) return;

    // 9.4: quiz_id / selected_answer_id / is_correct / confidence を保存
    // 9.4スコア算出ルール: 不正解の選択肢も含めて scores を加算（is_correct に関わらず）
    STATE.quizAnswers.push({
      quiz_id: q.quiz_id,
      selected_answer_id: a.answer_id,
      is_correct: !!a.is_correct,
      confidence: confidence,
      scores: a.scores || {},
    });

    quizIndex += 1;
    if (quizIndex >= quizSession.length) {
      finishDiagnosis();
    } else {
      renderQuizQuestion();
    }
  }

  // 診断完了時の処理。Step 6 で結果算出・描画を追加する。
  function finishDiagnosis() {
    showScreen('result', { replace: true });
  }

  function attachListeners() {
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action], [data-go], [data-nav], [data-purpose], [data-diagnosis], [data-confidence]');
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
      if (target.hasAttribute('data-confidence')) {
        handleQuizConfidence(target.getAttribute('data-confidence'));
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
