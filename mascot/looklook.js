(function () {
  'use strict';

  var VISIBLE = false;

  function buildDOM() {
    var btn = document.createElement('button');
    btn.id = 'looklook-btn';
    btn.title = '召唤黍';
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);
  }

  function toggle() {
    if (typeof ArkPets !== 'undefined') {
      ArkPets.toggle();
      VISIBLE = ArkPets.isVisible();
    }
    var btn = document.getElementById('looklook-btn');
    if (VISIBLE) {
      btn.classList.add('active');
      btn.textContent = '×';
      btn.title = '收起黍';
    } else {
      btn.classList.remove('active');
      btn.textContent = '';
      btn.title = '召唤黍';
    }
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    buildDOM();
  });
})();