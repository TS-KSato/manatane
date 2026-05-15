/* manatane prototype - app.js
 * Step 2: screen transitions (仕様書 8, 9, 15)
 * Step 3: JSON データ読み込み (仕様書 5, 13, 17.1)
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

  function handlePurposeSelect(_purposeId) {
    // 実際の状態保存・スコア計算はStep4以降。ここでは遷移のみ。
    showScreen('diagnosis-type');
  }

  function handleDiagnosisSelect(diagnosisType) {
    switch (diagnosisType) {
      case 'quiz':
        showScreen('quiz');
        break;
      case 'mood':
        showScreen('mood');
        break;
      case 'game':
        showScreen('game');
        break;
    }
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
