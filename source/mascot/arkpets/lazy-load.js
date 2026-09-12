/* ArkPets 懒加载：等页面 load 之后再（空闲时）加载引擎与初始化脚本
 * 目的：不让 246KB 引擎 + 3.4MB 模型在首屏/滚动时抢占主线程
 */
(function () {
  'use strict';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function start() {
    loadScript('/mascot/arkpets/arkpets.js')
      .then(function () { return loadScript('/mascot/arkpets/arkpets-init.js'); })
      .catch(function (e) { console.warn('[arkpets] lazy load failed:', e); });
  }

  function schedule() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(start, { timeout: 3000 });
    } else {
      setTimeout(start, 1200);
    }
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule);
  }
})();
