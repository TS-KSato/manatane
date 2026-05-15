/* manatane prototype - app.js
 * Step 2: screen transitions
 * 仕様書セクション 8, 9, 15 に対応
 */
'use strict';

(function () {
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

  function init() {
    cacheScreens();
    attachListeners();
    showScreen('home', { replace: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Step3 以降が利用するためのフラグ更新API（最小限）
  window.manatane = window.manatane || {};
  window.manatane.setHasResult = function (value) {
    hasResult = !!value;
  };
  window.manatane.showScreen = showScreen;
})();
