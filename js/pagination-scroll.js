/* 分页导航时记住滚动位置，避免切换页码后跳到页面顶部
 * 背景：Butterfly 的分页链接对第 1 页不带 #content-inner 锚点（pagination.pug 的 format），
 *       从第 2 页点回第 1 页时会直接落到整页最顶。
 */
(function () {
  'use strict';

  var KEY = 'btf_pagination_scroll';

  // 点击分页链接前记录当前位置
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target.closest ? e.target.closest('#pagination a') : null;
      if (a) {
        try {
          sessionStorage.setItem(KEY, String(window.scrollY || window.pageYOffset || 0));
        } catch (_) {}
      }
    },
    true
  );

  // 加载完成后恢复上次位置
  try {
    var saved = sessionStorage.getItem(KEY);
    if (saved !== null) {
      sessionStorage.removeItem(KEY);
      var y = parseInt(saved, 10) || 0;
      // 去掉锚点，避免浏览器的 #content-inner 跳转覆盖我们的恢复
      if (location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      window.addEventListener('load', function () {
        window.scrollTo(0, y);
      });
      // 部分浏览器在 load 之前已完成锚点跳转，这里再兜一次
      window.scrollTo(0, y);
    }
  } catch (_) {}
})();
