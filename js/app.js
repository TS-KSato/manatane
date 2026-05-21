/* manatane prototype v0.3 - app.js
 * 仕様書セクション 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 23
 */
'use strict';

(function () {

  // ===== 定数 =====
  const STORAGE_KEY = 'manatane_state'; // 14.1
  const HISTORY_LIMIT = 10; // 14.4
  const DEFAULT_RESULT_ID = 'A1B2C1D1'; // 17.2
  const DEFAULT_GUIDE_IDS = [
    'socrates_dialogue',
    'confucius_learning',
    'leibniz_monad',
    'goethe_synthesis',
    'fukuzawa_independence',
  ]; // 12.5
  // 23.4 上位選出の優先順位
  const BEHAVIOR_TAG_PRIORITY = [
    'planning', 'exploration', 'quick_action', 'cautious',
    'persistence', 'switching', 'intuition', 'dialogue',
  ];

  const SCREENS = [
    'home', 'purpose', 'diagnosis-type',
    'quiz', 'mood', 'topic', 'path',
    'game-select', 'slide-puzzle', 'maze',
    'result', 'guide', 'routes', 'save',
    'error',
  ];

  // 10.6: purpose_id -> 軸A / 軸B
  const PURPOSE_AXIS_AB = {
    life:      { A: 'A1', B: 'B1' },
    curiosity: { A: 'A1', B: 'B2' },
    hobby:     { A: 'A2', B: 'B3' },
    sidejob:   { A: 'A2', B: 'B3' },
    weakness:  { A: 'A1', B: 'B3' },
    browse:    { A: 'A1', B: 'B1' },
  };

  // 9.4: クイズ診断の軸三択フレーム。各組は知識設問1問＋軸の三択1つで構成し、
  // 軸の三択のみが result_id 合成に用いられる。問いかけ文の {topic} に
  // quizzes.json の topic_label を流し込む。
  const QUIZ_AXIS_FRAMES = [
    {
      axis: 'A',
      questionTpl: '{topic}にもう少し触れるなら、どれが近い?',
      answers: [
        { label: 'ひとりで読んで考えたい', value: 'A1' },
        { label: '手を動かして試したい',   value: 'A2' },
        { label: '誰かと話しながら学びたい', value: 'A3' },
      ],
    },
    {
      axis: 'B',
      questionTpl: '{topic}を入口にするなら、どんな方向が気になる?',
      answers: [
        { label: '自分自身に関わること', value: 'B1' },
        { label: '世の中に関わること',   value: 'B2' },
        { label: '分野や仕組みそのもの', value: 'B3' },
      ],
    },
    {
      axis: 'C',
      questionTpl: '{topic}の先で、どんな手応えがあるといい?',
      answers: [
        { label: 'ものの見方が変わる',     value: 'C1' },
        { label: 'できることが増える',     value: 'C2' },
        { label: '暮らしや気持ちが整う',   value: 'C3' },
      ],
    },
    {
      axis: 'D',
      questionTpl: '{topic}、どのくらいの時間で触れてみる?',
      answers: [
        { label: '今日のすき間時間で軽く',   value: 'D1' },
        { label: 'しばらく続けて少しずつ',   value: 'D2' },
        { label: 'じっくり腰を据えて深く',   value: 'D3' },
      ],
    },
  ];

  const PURPOSE_LABELS = {
    life: '生活に役立てたい',
    curiosity: '知的好奇心を満たしたい',
    hobby: '趣味を深めたい',
    sidejob: '副業の種を探したい',
    weakness: '苦手を減らしたい',
    browse: '今日は眺めるだけ',
  };
  const DIAGNOSIS_LABELS = {
    quiz: 'クイズ診断',
    mood: '気分から見つける',
    topic: '気になることから探す',
    path: 'これまでの学びから探す',
    game: 'ミニゲーム診断',
  };

  // 9.11: 気になることから探す (diagnosis_type=topic, 4問×4軸構成)
  // 各問が1軸に対応。3選択肢で軸の3値に1対1対応 → result_id 81通りに到達可能。
  const TOPIC_QUESTIONS = [
    {
      axis: 'A',
      question: '最近、楽しいと感じるのはどんな時間？',
      answers: [
        { label: '本や記事をじっくり読む時間', value: 'A1' },
        { label: '何かを作ったり手を動かす時間', value: 'A2' },
        { label: '人と話したり聞いたりする時間', value: 'A3' },
      ],
    },
    {
      axis: 'B',
      question: '最近、気になっているのはどんなこと？',
      answers: [
        { label: '自分の気持ちや内面のこと', value: 'B1' },
        { label: '世の中の出来事や歴史', value: 'B2' },
        { label: '専門分野や仕組みのこと', value: 'B3' },
      ],
    },
    {
      axis: 'C',
      question: '最近、変えてみたいと感じるのはどれ？',
      answers: [
        { label: '物事の見方や考え方', value: 'C1' },
        { label: 'できることや使える技', value: 'C2' },
        { label: '日々の暮らしや習慣', value: 'C3' },
      ],
    },
    {
      axis: 'D',
      question: '今、それにどのくらい時間をかけられそう？',
      answers: [
        { label: '今日、少しだけ', value: 'D1' },
        { label: '数週間くらい続けて', value: 'D2' },
        { label: '年単位でじっくり', value: 'D3' },
      ],
    },
  ];

  // 9.12: これまでの学びから探す (diagnosis_type=path, 4問×4軸構成)
  // 各問が1軸に対応。3選択肢で軸の3値に1対1対応 → result_id 81通りに到達可能。
  const PATH_QUESTIONS = [
    {
      axis: 'A',
      question: 'これまで、どんなふうに学ぶことが多かった？',
      answers: [
        { label: '本や資料を読んで学ぶ', value: 'A1' },
        { label: '実際に手を動かして覚える', value: 'A2' },
        { label: '人と話したり教わったりして学ぶ', value: 'A3' },
      ],
    },
    {
      axis: 'B',
      question: 'これまで、よく触れてきたのはどれ？',
      answers: [
        { label: '自分の経験や感じ方', value: 'B1' },
        { label: '社会や歴史のこと', value: 'B2' },
        { label: '仕事や専門分野のこと', value: 'B3' },
      ],
    },
    {
      axis: 'C',
      question: 'これまでの学びで、変わってきたと感じるのはどれ？',
      answers: [
        { label: 'ものの見方や視点', value: 'C1' },
        { label: 'できることや得意なこと', value: 'C2' },
        { label: '生活のスタイルや習慣', value: 'C3' },
      ],
    },
    {
      axis: 'D',
      question: 'これまで、ひとつのテーマにどのくらい関わってきた？',
      answers: [
        { label: '短く触れることが多い', value: 'D1' },
        { label: '数週間〜数ヶ月単位', value: 'D2' },
        { label: '年単位で続けてきた', value: 'D3' },
      ],
    },
  ];
  const GAME_TYPE_LABELS = {
    slide_puzzle: 'スライドパズル4×4',
    maze: '迷路8×8',
  };

  const DATA_FILES = {
    questions: 'data/questions.json',
    quizzes: 'data/quizzes.json',
    results: 'data/results.json',
    guides: 'data/guides.json',
    routes: 'data/routes.json',
  };

  // ===== セッション状態 =====
  const screenElements = {};
  const history = [];
  let currentScreen = 'home';
  let hasResult = false;

  const STATE = {
    purpose: null,
    diagnosisType: null,
    gameType: null,
    moodAnswers: [],
    quizAnswers: [],
    gameResult: null,
    topicAnswers: [],
    pathAnswers: [],
    behaviorTraits: [],
    resultId: null,
    guideId: null,
  };

  function resetSession() {
    STATE.purpose = null;
    STATE.diagnosisType = null;
    STATE.gameType = null;
    STATE.moodAnswers = [];
    STATE.quizAnswers = [];
    STATE.gameResult = null;
    STATE.topicAnswers = [];
    STATE.pathAnswers = [];
    STATE.behaviorTraits = [];
    STATE.resultId = null;
    STATE.guideId = null;
    hasResult = false;
  }

  // ===== localStorage (14, 17.3) =====
  let storageAvailable = false;

  function detectStorage() {
    try {
      const probe = '__manatane_probe__';
      window.localStorage.setItem(probe, probe);
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  function defaultStored() {
    return {
      lastPurpose: null,
      lastDiagnosisType: null,
      lastResultId: null,
      lastGuideId: null,
      lastBehaviorTraits: [],
      history: [],
    };
  }

  function loadStored() {
    if (!storageAvailable) return defaultStored();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStored();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return defaultStored();
      if (!Array.isArray(p.history)) p.history = [];
      if (!Array.isArray(p.lastBehaviorTraits)) p.lastBehaviorTraits = [];
      return p;
    } catch (e) { return defaultStored(); }
  }

  function saveStored(s) {
    if (!storageAvailable) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function updateStored(patch) {
    if (!storageAvailable) return;
    const cur = loadStored();
    Object.keys(patch).forEach(k => { cur[k] = patch[k]; });
    saveStored(cur);
  }

  function appendHistoryEntry(entry) {
    if (!storageAvailable) return;
    const cur = loadStored();
    cur.history.push(entry);
    while (cur.history.length > HISTORY_LIMIT) cur.history.shift();
    saveStored(cur);
  }

  function todayDateISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function applyStorageAvailability() {
    if (storageAvailable) return;
    document.querySelectorAll('[data-storage-notice]').forEach(el => { el.hidden = false; });
  }

  // ===== 画面遷移 =====
  function cacheScreens() {
    SCREENS.forEach(name => {
      screenElements[name] = document.getElementById('screen-' + name);
    });
  }

  function isGameScreen(s) {
    return s === 'slide-puzzle' || s === 'maze';
  }

  function showScreen(name, options) {
    options = options || {};
    if (!screenElements[name]) return;
    // ゲーム画面を離れる際は進行中のゲームを停止 (9.6)
    if (isGameScreen(currentScreen) && !isGameScreen(name)) {
      if (window.manatane && window.manatane.stopGame) window.manatane.stopGame();
    }
    if (!options.replace && currentScreen && currentScreen !== name) {
      history.push(currentScreen);
    }
    SCREENS.forEach(k => {
      const el = screenElements[k];
      if (el) el.hidden = (k !== name);
    });
    currentScreen = name;
    updateNavState(name);
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (history.length === 0) { showScreen('home', { replace: true }); return; }
    const prev = history.pop();
    showScreen(prev, { replace: true });
  }

  function updateNavState(name) {
    const buttons = document.querySelectorAll('.bottom-nav .nav-btn');
    const diagnosisGroup = ['purpose','diagnosis-type','quiz','mood','topic','path','game-select','slide-puzzle','maze','result'];
    buttons.forEach(btn => {
      const t = btn.getAttribute('data-nav');
      let active = false;
      if (t === 'home' && name === 'home') active = true;
      if (t === 'diagnosis' && diagnosisGroup.indexOf(name) !== -1) active = true;
      if (t === 'routes' && (name === 'routes' || name === 'guide')) active = true;
      if (t === 'save' && name === 'save') active = true;
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  // ===== アクションハンドラ =====
  function handleAction(action) {
    switch (action) {
      case 'start': showScreen('purpose'); break;
      case 'back': goBack(); break;
      case 'reload': window.location.reload(); break;
      case 'game-start':
        if (window.manatane && window.manatane.startGame) window.manatane.startGame(STATE.gameType);
        break;
      case 'game-reset':
        if (window.manatane && window.manatane.resetGame) window.manatane.resetGame(STATE.gameType);
        break;
    }
  }

  function handleGo(target) {
    switch (target) {
      case 'home': history.length = 0; showScreen('home', { replace: true }); break;
      case 'purpose': showScreen('purpose'); break;
      case 'guide': renderGuideScreen(); showScreen('guide'); break;
      case 'routes': renderRoutesScreen(); showScreen('routes'); break;
      case 'result': showScreen('result'); break;
      case 'save': showScreen('save'); break;
    }
  }

  function handleNav(nav) {
    switch (nav) {
      case 'home': history.length = 0; showScreen('home', { replace: true }); break;
      case 'diagnosis': showScreen('purpose'); break;
      case 'routes':
        if (hasResult) { renderRoutesScreen(); showScreen('routes'); }
        else { showScreen('purpose'); }
        break;
      case 'save': showScreen('save'); break;
    }
  }

  function handlePurposeSelect(purposeId) {
    resetSession();
    STATE.purpose = purposeId;
    updateStored({ lastPurpose: purposeId }); // 14.3
    showScreen('diagnosis-type');
  }

  function handleDiagnosisSelect(diagnosisType) {
    STATE.diagnosisType = diagnosisType;
    updateStored({ lastDiagnosisType: diagnosisType }); // 14.3
    switch (diagnosisType) {
      case 'quiz': startQuizSession(); showScreen('quiz'); break;
      case 'mood': startMoodSession(); showScreen('mood'); break;
      case 'topic': startTopicSession(); showScreen('topic'); break;
      case 'path': startPathSession(); showScreen('path'); break;
      case 'game': showScreen('game-select'); break;
    }
  }

  function handleGameSelect(gameType) {
    STATE.gameType = gameType;
    if (window.manatane && window.manatane.resetGameUI) window.manatane.resetGameUI(gameType);
    if (gameType === 'slide_puzzle') showScreen('slide-puzzle');
    else if (gameType === 'maze') showScreen('maze');
  }

  function attachListeners() {
    document.addEventListener('click', e => {
      const t = e.target.closest(
        '[data-action], [data-go], [data-nav], [data-purpose], [data-diagnosis], [data-game]'
      );
      if (!t) return;
      if (t.hasAttribute('data-action'))    { handleAction(t.getAttribute('data-action')); return; }
      if (t.hasAttribute('data-go'))        { handleGo(t.getAttribute('data-go')); return; }
      if (t.hasAttribute('data-nav'))       { handleNav(t.getAttribute('data-nav')); return; }
      if (t.hasAttribute('data-purpose'))   { handlePurposeSelect(t.getAttribute('data-purpose')); return; }
      if (t.hasAttribute('data-diagnosis')) { handleDiagnosisSelect(t.getAttribute('data-diagnosis')); return; }
      if (t.hasAttribute('data-game'))      { handleGameSelect(t.getAttribute('data-game')); return; }
    });
  }

  // ===== 気分から見つける（diagnosis_type=mood, 9.5）=====
  let moodSession = [];
  let moodIndex = 0;

  function startMoodSession() {
    const all = (window.manatane.data && window.manatane.data.questions) || [];
    moodSession = all.slice();
    moodIndex = 0;
    STATE.moodAnswers = [];
    renderMoodQuestion();
  }

  function renderMoodQuestion() {
    const q = moodSession[moodIndex];
    if (!q) { finishDiagnosis(); return; }
    const total = moodSession.length;
    const pe = document.getElementById('mood-progress');
    if (pe) pe.textContent = '質問 ' + (moodIndex + 1) + ' / ' + total;
    const qt = document.querySelector('#mood-question .quiz-question-text');
    if (qt) qt.textContent = q.question;
    // 9.5: 短い問いと選択肢の間に補足文を表示（mood 固有要素）
    const noteEl = document.getElementById('mood-question-note');
    if (noteEl) {
      noteEl.textContent = q.note || '';
      noteEl.hidden = !q.note;
    }
    const ae = document.getElementById('mood-answers');
    if (!ae) return;
    ae.innerHTML = '';
    q.answers.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', () => handleMoodAnswer(q, a));
      ae.appendChild(btn);
    });
  }

  function handleMoodAnswer(question, answer) {
    // 9.5: 各問は1軸を決定的に決める三択。{axis, value} を直接記録（旧 axis_scores 方式は廃止）。
    STATE.moodAnswers.push({
      question_id: question.question_id,
      answer_id: answer.answer_id,
      axis: question.axis,
      value: answer.value,
      label: answer.label,
    });
    moodIndex += 1;
    if (moodIndex >= moodSession.length) finishDiagnosis();
    else renderMoodQuestion();
  }

  // ===== 気になることから探す (9.11, diagnosis_type=topic) =====
  // 4問構成：各問が1軸（A/B/C/D）に対応。3選択肢で軸の3値に1対1対応。
  // 4問完了で4軸が確定し result_id は81通りのいずれかに到達。
  let topicIndex = 0;

  function startTopicSession() {
    STATE.topicAnswers = [];
    topicIndex = 0;
    renderTopicQuestion();
  }

  function renderTopicQuestion() {
    const q = TOPIC_QUESTIONS[topicIndex];
    if (!q) { finishDiagnosis(); return; }
    const pe = document.getElementById('topic-progress');
    if (pe) pe.textContent = '質問 ' + (topicIndex + 1) + ' / ' + TOPIC_QUESTIONS.length;
    const qt = document.getElementById('topic-question-text');
    if (qt) qt.textContent = q.question;
    const ae = document.getElementById('topic-answers');
    if (!ae) return;
    ae.innerHTML = '';
    q.answers.forEach(function (a) {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', function () { handleTopicAnswer(q, a); });
      ae.appendChild(btn);
    });
  }

  function handleTopicAnswer(question, answer) {
    STATE.topicAnswers.push({ axis: question.axis, value: answer.value, label: answer.label });
    topicIndex += 1;
    if (topicIndex >= TOPIC_QUESTIONS.length) finishDiagnosis();
    else renderTopicQuestion();
  }

  // ===== これまでの学びから探す (9.12, diagnosis_type=path) =====
  // 4問構成：各問が1軸（A/B/C/D）に対応。3選択肢で軸の3値に1対1対応。
  // 4問完了で4軸が確定し result_id は81通りのいずれかに到達。
  let pathIndex = 0;

  function startPathSession() {
    STATE.pathAnswers = [];
    pathIndex = 0;
    renderPathQuestion();
  }

  function renderPathQuestion() {
    const q = PATH_QUESTIONS[pathIndex];
    if (!q) { finishDiagnosis(); return; }
    const pe = document.getElementById('path-progress');
    if (pe) pe.textContent = '質問 ' + (pathIndex + 1) + ' / ' + PATH_QUESTIONS.length;
    const qt = document.getElementById('path-question-text');
    if (qt) qt.textContent = q.question;
    const ae = document.getElementById('path-answers');
    if (!ae) return;
    ae.innerHTML = '';
    q.answers.forEach(function (a) {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', function () { handlePathAnswer(q, a); });
      ae.appendChild(btn);
    });
  }

  function handlePathAnswer(question, answer) {
    STATE.pathAnswers.push({ axis: question.axis, value: answer.value, label: answer.label });
    pathIndex += 1;
    if (pathIndex >= PATH_QUESTIONS.length) finishDiagnosis();
    else renderPathQuestion();
  }

  // 4問分の回答配列から { A, B, C, D } の軸値を取り出して result_id を合成。
  // 4軸すべて選択済みでない場合は null を返す（呼び出し側で扱う）。
  function composeResultIdFromAnswers(answers) {
    if (!Array.isArray(answers) || answers.length < 4) return null;
    const map = {};
    answers.forEach(function (a) { map[a.axis] = a.value; });
    if (!map.A || !map.B || !map.C || !map.D) return null;
    return map.A + map.B + map.C + map.D;
  }

  // ===== クイズ診断 (9.4) =====
  // 各 purpose_id に対して複数の genre_id を対応させる。クイズ出題時は対応するジャンル群の
  // 問題をひとまとめにし、そこから4問を引く。1セッションの4問が複数ジャンルにまたがってよい。
  // 該当ジャンル群に4問未満しかない場合のみ全ジャンルから補う。
  const PURPOSE_TO_GENRES = {
    life:      ['life', 'health', 'nature'],
    curiosity: ['nature', 'learning', 'creative'],
    hobby:     ['creative', 'nature', 'health'],
    sidejob:   ['money', 'writing', 'work'],
    weakness:  ['communication', 'writing', 'work'],
    browse:    ['money', 'writing', 'life', 'creative', 'health', 'communication', 'learning', 'work', 'nature'],
  };

  // クイズ診断は「知識設問1問 + 軸の三択1つ」を1組とし、4組（軸A→B→C→D）繰り返す。
  // result_id は軸の三択4つだけから合成され、知識設問の回答は result_id に影響しない。
  let quizSession = [];         // 4問の知識設問
  let quizIndex = 0;            // 現在の組（0..3）
  let quizPhase = 'knowledge';  // 'knowledge' | 'axis'
  let quizCurrentKnowledge = null; // 現在の組の知識設問の回答記録

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function pickQuizzes(purposeId) {
    const all = (window.manatane.data && window.manatane.data.quizzes) || [];
    const wanted = PURPOSE_TO_GENRES[purposeId];
    let pool = [];
    if (Array.isArray(wanted) && wanted.length > 0) {
      const wantedSet = new Set(wanted);
      pool = all.filter(q => wantedSet.has(q.genre_id));
    }
    if (pool.length < 4) pool = all.slice();
    else pool = pool.slice();
    shuffleInPlace(pool);
    return pool.slice(0, 4);
  }

  function startQuizSession() {
    quizSession = pickQuizzes(STATE.purpose);
    quizIndex = 0;
    STATE.quizAnswers = [];
    renderQuizQuestion();
  }

  function setHidden(id, h) {
    const el = document.getElementById(id);
    if (el) el.hidden = !!h;
  }

  function renderQuizQuestion() {
    const q = quizSession[quizIndex];
    if (!q) { finishDiagnosis(); return; }
    quizPhase = 'knowledge';
    quizCurrentKnowledge = null;

    const total = quizSession.length;
    const pe = document.getElementById('quiz-progress');
    if (pe) pe.textContent = '問題 ' + (quizIndex + 1) + ' / ' + total;
    const qt = document.querySelector('#quiz-question .quiz-question-text');
    if (qt) qt.textContent = q.question;
    const ae = document.getElementById('quiz-answers');
    if (ae) {
      ae.innerHTML = '';
      q.answers.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'card-btn';
        btn.type = 'button';
        btn.textContent = a.label;
        btn.addEventListener('click', () => handleQuizAnswer(q, a, btn));
        ae.appendChild(btn);
      });
    }
    setHidden('quiz-feedback', true);
    setHidden('quiz-axis-block', true);
  }

  function handleQuizAnswer(question, answer, btn) {
    if (quizPhase !== 'knowledge') return;
    quizPhase = 'axis';
    quizCurrentKnowledge = {
      quiz_id: question.quiz_id,
      knowledge_answer_id: answer.answer_id,
      is_correct: !!answer.is_correct,
    };

    // 正誤表示と選択肢の無効化
    const ae = document.getElementById('quiz-answers');
    if (ae) {
      const buttons = ae.querySelectorAll('button');
      buttons.forEach(b => { b.disabled = true; });
      question.answers.forEach((a, i) => {
        const b = buttons[i];
        if (!b) return;
        if (a.is_correct) b.classList.add('is-correct');
      });
      if (btn) {
        btn.classList.add(answer.is_correct ? 'is-correct' : 'is-wrong');
        btn.classList.add('is-selected');
      }
    }
    const ft = document.getElementById('quiz-feedback-text');
    if (ft) {
      ft.textContent = answer.is_correct ? '正解です。' : '不正解です。';
      ft.classList.remove('is-correct', 'is-wrong');
      ft.classList.add(answer.is_correct ? 'is-correct' : 'is-wrong');
    }
    const ee = document.getElementById('quiz-explanation');
    if (ee) ee.textContent = question.explanation || '';
    setHidden('quiz-feedback', false);

    renderQuizAxisQuestion(question);
  }

  function renderQuizAxisQuestion(quizQuestion) {
    const frame = QUIZ_AXIS_FRAMES[quizIndex];
    if (!frame) return;
    const topic = quizQuestion.topic_label || '';
    const qtext = frame.questionTpl.replace('{topic}', topic);
    const qel = document.getElementById('quiz-axis-question');
    if (qel) qel.textContent = qtext;
    const aEl = document.getElementById('quiz-axis-answers');
    if (aEl) {
      aEl.innerHTML = '';
      frame.answers.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'card-btn';
        btn.type = 'button';
        btn.textContent = a.label;
        btn.addEventListener('click', () => handleQuizAxisChoice(frame, a));
        aEl.appendChild(btn);
      });
    }
    setHidden('quiz-axis-block', false);
  }

  function handleQuizAxisChoice(frame, axisAnswer) {
    if (quizPhase !== 'axis') return;
    const know = quizCurrentKnowledge || {};
    STATE.quizAnswers.push({
      quiz_id: know.quiz_id || null,
      knowledge_answer_id: know.knowledge_answer_id || null,
      is_correct: !!know.is_correct,
      axis: frame.axis,
      value: axisAnswer.value,
      label: axisAnswer.label,
    });
    quizIndex += 1;
    if (quizIndex >= quizSession.length) finishDiagnosis();
    else renderQuizQuestion();
  }

  // ===== 行動傾向タグ集計 (12.3, 23.4) =====
  // mood / topic / path / quiz は behavior_tag を付与しない。
  // タグの付与経路は game のみ（10.7 のゲーム指標 → タグ変換）。
  function aggregateBehaviorTraits() {
    const counts = {};
    function inc(tag) { if (!tag) return; counts[tag] = (counts[tag] || 0) + 1; }

    if (STATE.gameResult && Array.isArray(STATE.gameResult.behavior_traits)) {
      STATE.gameResult.behavior_traits.forEach(inc);
    }

    const entries = Object.entries(counts);
    entries.sort((x, y) => {
      if (y[1] !== x[1]) return y[1] - x[1];
      return BEHAVIOR_TAG_PRIORITY.indexOf(x[0]) - BEHAVIOR_TAG_PRIORITY.indexOf(y[0]);
    });
    return entries.slice(0, 2).map(e => e[0]);
  }

  // ===== result_id 算出 (10) =====
  // すべての診断形式が4軸を「決定的に」決める方式に統一された：
  //   quiz / mood / topic / path は4組×1軸の選択で4軸を直接決定（composeResultIdFromAnswers）
  //   game は purpose から軸A・軸B、ゲーム指標から軸C・軸Dを決定（10.7、STATE.gameResult.result_id）
  // 旧来の軸スコア累積・同点処理・固定既定値は廃止された。
  function computeResultId() {
    if (STATE.diagnosisType === 'game' && STATE.gameResult && STATE.gameResult.result_id) {
      return { resultId: STATE.gameResult.result_id, isDefault: false };
    }
    if (STATE.diagnosisType === 'quiz') {
      const rid = composeResultIdFromAnswers(STATE.quizAnswers);
      if (rid) return { resultId: rid, isDefault: false };
    }
    if (STATE.diagnosisType === 'mood') {
      const rid = composeResultIdFromAnswers(STATE.moodAnswers);
      if (rid) return { resultId: rid, isDefault: false };
    }
    if (STATE.diagnosisType === 'topic') {
      const rid = composeResultIdFromAnswers(STATE.topicAnswers);
      if (rid) return { resultId: rid, isDefault: false };
    }
    if (STATE.diagnosisType === 'path') {
      const rid = composeResultIdFromAnswers(STATE.pathAnswers);
      if (rid) return { resultId: rid, isDefault: false };
    }
    // 17.2 デフォルト: いずれの経路でも result_id を確定できない場合
    return { resultId: DEFAULT_RESULT_ID, isDefault: true };
  }

  // ===== ハイブリッド方式ガイドマッチング (12, 23) =====
  function selectGuide(resultId, behaviorTraits, lastSeenCategory) {
    const guides = (window.manatane.data && window.manatane.data.guides) || [];
    if (guides.length === 0) return null;

    const axisA = resultId.substring(0, 2);
    const axisB = resultId.substring(2, 4);
    const axisC = resultId.substring(4, 6);
    const axisD = resultId.substring(6, 8);

    let bestGuide = null;
    let bestScore = -1;
    const tied = [];

    for (const g of guides) {
      let score = 0;
      const gt = g.behavior_traits || [];
      const matches = behaviorTraits.filter(t => gt.indexOf(t) !== -1).length;
      if (matches >= 2) score += 6;
      else if (matches === 1) score += 3;
      if ((g.axis_a || []).indexOf(axisA) !== -1) score += 1;
      if ((g.axis_b || []).indexOf(axisB) !== -1) score += 1;
      if ((g.axis_c || []).indexOf(axisC) !== -1) score += 1;
      if ((g.axis_d || []).indexOf(axisD) !== -1) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestGuide = g;
        tied.length = 0;
        tied.push(g);
      } else if (score === bestScore) {
        tied.push(g);
      }
    }

    // 12.5 最低スコア保証
    if (bestScore < 2) {
      const defaults = guides.filter(g => DEFAULT_GUIDE_IDS.indexOf(g.guide_id) !== -1);
      if (defaults.length > 0) {
        return defaults[Math.floor(Math.random() * defaults.length)];
      }
    }

    // 23.3 同点処理: 過去カテゴリと異なるものを優先 → それでも同点ならランダム
    if (tied.length > 1) {
      let candidates = tied;
      if (lastSeenCategory) {
        const diff = tied.filter(g => g.category !== lastSeenCategory);
        if (diff.length > 0) candidates = diff;
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return bestGuide;
  }

  // ===== 結果画面の描画 (9.7) =====
  function findResultData(resultId) {
    const results = (window.manatane.data && window.manatane.data.results) || [];
    for (let i = 0; i < results.length; i += 1) if (results[i].result_id === resultId) return results[i];
    return null;
  }

  function renderListInto(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      el.appendChild(li);
    });
  }

  function buildReasons(computed) {
    const reasons = [];
    if (STATE.purpose && PURPOSE_LABELS[STATE.purpose]) reasons.push('選択した目的：' + PURPOSE_LABELS[STATE.purpose]);
    if (STATE.diagnosisType && DIAGNOSIS_LABELS[STATE.diagnosisType]) {
      let label = DIAGNOSIS_LABELS[STATE.diagnosisType];
      if (STATE.diagnosisType === 'game' && STATE.gameType && GAME_TYPE_LABELS[STATE.gameType]) {
        label += '（' + GAME_TYPE_LABELS[STATE.gameType] + '）';
      }
      reasons.push('診断形式：' + label);
    }
    // 9.7: 3項目目は診断形式別に出し分ける。
    // - quiz / mood: 表示しない（行動傾向タグは内部処理用識別子のため画面には出さない）
    // - game: 「ゲーム結果」をプレイ種類＋到達状況のみで表示（効率比などの内部指標は出さない）
    if (STATE.diagnosisType === 'game' && STATE.gameResult) {
      const completed = !!(STATE.gameResult.stats && STATE.gameResult.stats.completed);
      let summary;
      if (STATE.gameType === 'slide_puzzle') {
        summary = completed ? 'スライドパズルを完成' : 'スライドパズルに挑戦（時間切れ）';
      } else if (STATE.gameType === 'maze') {
        summary = completed ? '迷路をゴールまで進んだ' : '迷路に挑戦（時間切れ）';
      } else {
        summary = completed ? 'ミニゲームを完了' : 'ミニゲームに挑戦（時間切れ）';
      }
      reasons.push('ゲーム結果：' + summary);
    }
    if (computed.isDefault) {
      reasons.push('今回は判定材料が不足したため、デフォルトの入口を表示しています。');
    }
    return reasons;
  }

  function renderResultScreen(computed) {
    const data = findResultData(computed.resultId);
    const nameEl = document.getElementById('result-name');
    const descEl = document.getElementById('result-desc');

    if (data) {
      if (nameEl) nameEl.textContent = data.title;
      if (descEl) {
        descEl.textContent = computed.isDefault
          ? '今日は、世の中について短く読み、見方を少し見直す入口が合いそうです。'
          : data.description;
      }
      renderListInto('result-recommendations', data.recommendations || []);
      renderListInto('result-avoid', data.avoid || []);
    } else {
      if (nameEl) nameEl.textContent = '今日の入口';
      if (descEl) descEl.textContent = '';
      renderListInto('result-recommendations', []);
      renderListInto('result-avoid', []);
    }
    renderListInto('result-reasons', buildReasons(computed));
  }

  // ===== ガイド画面の描画 (9.8) =====
  function findGuide(guideId) {
    const guides = (window.manatane.data && window.manatane.data.guides) || [];
    for (let i = 0; i < guides.length; i += 1) if (guides[i].guide_id === guideId) return guides[i];
    return null;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = (typeof text === 'string' && text.length > 0) ? text : '';
  }

  function renderGuideScreen() {
    if (!STATE.guideId) return;
    const g = findGuide(STATE.guideId);
    if (!g) return;

    updateStored({ lastGuideId: STATE.guideId }); // 14.3

    setText('guide-label', g.display_label || g.frame_name || '');
    setText('guide-person', g.name || '');
    setText('guide-name-original', g.name_original || '');
    const eraRegion = [g.era, g.region].filter(Boolean).join(' / ');
    setText('guide-era-region', eraRegion);
    setText('guide-line', g.short_line || '');

    // 16.3 / 9.8: 注意書きは固定文言で必ず表示
    const noticeEl = document.querySelector('#screen-guide .guide-notice');
    if (noticeEl) {
      noticeEl.textContent = 'この一言は本人の発言ではなく、考え方を学習向けに要約したものです。';
    }

    // ガイド画像: images/guides/{guide_id}.svg を読み込み、存在しなければ placeholder にフォールバック
    const imgEl = document.getElementById('guide-image');
    if (imgEl) {
      const primarySrc = 'images/guides/' + STATE.guideId + '.svg';
      const fallbackSrc = 'images/guides/placeholder.svg';
      imgEl.onerror = function () {
        if (imgEl.src.indexOf('placeholder.svg') === -1) {
          imgEl.onerror = null;
          imgEl.src = fallbackSrc;
        }
      };
      imgEl.alt = g.display_label || g.name || '';
      imgEl.src = primarySrc;
    }

    setText('guide-bio', g.bio_short || '');
    setText('guide-translation', g.learning_translation || '');
    setText('guide-action', g.one_min_action || '');
    renderListInto('guide-topics', g.related_topics || []);
  }

  // ===== おすすめルートの描画 (9.9) =====
  function matchingRoutes(resultId) {
    const routes = (window.manatane.data && window.manatane.data.routes) || [];
    return routes.filter(r => Array.isArray(r.target_results) && r.target_results.indexOf(resultId) !== -1);
  }

  function renderRoutesScreen() {
    const listEl = document.getElementById('route-list');
    if (!listEl) return;
    const matched = STATE.resultId ? matchingRoutes(STATE.resultId) : [];
    listEl.innerHTML = '';

    if (matched.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'desc';
      empty.textContent = 'この入口に対応するルートは現在準備中です。診断結果に戻って別の入口を試すこともできます。';
      listEl.appendChild(empty);
      return;
    }

    matched.forEach(r => {
      const card = document.createElement('article');
      card.className = 'route-card';
      const t = document.createElement('p');
      t.className = 'route-title';
      t.textContent = r.title || '';
      card.appendChild(t);
      if (r.description) {
        const d = document.createElement('p');
        d.className = 'route-desc';
        d.textContent = r.description;
        card.appendChild(d);
      }
      if (r.suitable_for) {
        const m = document.createElement('p');
        m.className = 'route-meta';
        m.textContent = '向いている状態：' + r.suitable_for;
        card.appendChild(m);
      }
      if (r.estimated_time) {
        const m = document.createElement('p');
        m.className = 'route-meta';
        m.textContent = '想定時間：' + r.estimated_time;
        card.appendChild(m);
      }
      const link = document.createElement('a');
      link.className = 'btn btn-primary';
      link.href = r.url || 'https://example.com';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '見てみる';
      card.appendChild(link);
      listEl.appendChild(card);
    });
  }

  // ===== 診断完了 =====
  function finishDiagnosis() {
    // 23.4 行動傾向タグの集計
    STATE.behaviorTraits = aggregateBehaviorTraits();

    // 10 result_id 確定
    const computed = computeResultId();
    STATE.resultId = computed.resultId;

    // 23 ハイブリッド方式でガイド確定
    const stored = loadStored();
    let lastSeenCategory = null;
    if (stored.history && stored.history.length > 0) {
      const lastEntry = stored.history[stored.history.length - 1];
      if (lastEntry && lastEntry.guide_id) {
        const lg = findGuide(lastEntry.guide_id);
        if (lg) lastSeenCategory = lg.category;
      }
    }
    const guide = selectGuide(computed.resultId, STATE.behaviorTraits, lastSeenCategory);
    STATE.guideId = guide ? guide.guide_id : null;

    hasResult = true;

    // 14.3: 結果確定時の保存
    updateStored({
      lastResultId: STATE.resultId,
      lastBehaviorTraits: STATE.behaviorTraits.slice(),
    });
    appendHistoryEntry({
      date: todayDateISO(),
      purpose: STATE.purpose,
      diagnosis_type: STATE.diagnosisType,
      result_id: STATE.resultId,
      guide_id: STATE.guideId,
      behavior_traits: STATE.behaviorTraits.slice(),
    });

    renderResultScreen(computed);
    showScreen('result', { replace: true });
  }

  // ===== 初期化・データ読み込み =====
  function showError(message) {
    const e = document.getElementById('error-message');
    if (e && message) e.textContent = message;
    SCREENS.forEach(k => { const el = screenElements[k]; if (el) el.hidden = (k !== 'error'); });
    currentScreen = 'error';
  }

  function loadJson(p) {
    return fetch(p, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + p);
      return r.json();
    });
  }

  function loadAllData() {
    const keys = Object.keys(DATA_FILES);
    return Promise.all(keys.map(k => loadJson(DATA_FILES[k]))).then(values => {
      const out = {};
      keys.forEach((k, i) => { out[k] = values[i]; });
      return out;
    });
  }

  function init() {
    cacheScreens();
    attachListeners();
    storageAvailable = detectStorage();
    applyStorageAvailability();
    showScreen('home', { replace: true });

    loadAllData().then(data => {
      window.manatane.data = data;
    }).catch(err => {
      console.error('[manatane] data load failed:', err);
      showError('データを読み込めませんでした。ページを再読み込みしてください。'); // 17.1
    });
  }

  // ===== 公開API =====
  window.manatane = window.manatane || {};
  window.manatane.showScreen = showScreen;
  window.manatane.setHasResult = v => { hasResult = !!v; };

  // games.js から呼ばれる: ゲーム完了時のコールバック。
  // 期待する payload 形式 (10.7):
  //   { game_type, completed, stats, axis_c, axis_d, behavior_traits }
  // STATE.purpose から軸A・軸Bを補い、result_id を合成する。
  window.manatane.completeGame = function (payload) {
    if (!payload) return;
    const ab = PURPOSE_AXIS_AB[STATE.purpose] || { A: 'A1', B: 'B2' };
    let resultId = null;
    if (payload.axis_c && payload.axis_d) {
      resultId = ab.A + ab.B + payload.axis_c + payload.axis_d;
    } else if (payload.result_id && /^A\dB\dC\dD\d$/.test(payload.result_id)) {
      resultId = payload.result_id;
    }
    if (!resultId) return;
    STATE.gameResult = {
      result_id: resultId,
      stats: payload.stats || null,
      game_type: payload.game_type || STATE.gameType,
      behavior_traits: Array.isArray(payload.behavior_traits) ? payload.behavior_traits.slice() : [],
    };
    finishDiagnosis();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
