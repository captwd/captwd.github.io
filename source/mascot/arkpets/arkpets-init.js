(function () {
  'use strict';

  var CHARACTER_RESOURCES = [
    {
      id: 'shu',
      name: '黍',
      skeleton: 'models/shu/build_char_2025_shu.skel',
      atlas: 'models/shu/build_char_2025_shu.atlas',
      texture: 'models/shu/build_char_2025_shu.png',
      resourcePath: '/mascot/arkpets/'
    },
    {
      id: 'shu-nian',
      name: '春日宴',
      skeleton: 'models/shu-nian/build_char_2025_shu_nian#11.skel',
      atlas: 'models/shu-nian/build_char_2025_shu_nian#11.atlas',
      texture: 'models/shu-nian/build_char_2025_shu_nian#11.png',
      resourcePath: '/mascot/arkpets/'
    }
  ];

  var character = null;
  var isVisible = true;
  var dialogBox = null;
  var dialogText = null;
  var followAnimation = null;
  var lastCanvasPos = { x: 0, y: 0 };

  var messages = [
    '今天天气真好~',
    '欢迎来到小窝',
    '要不要聊聊天？',
    '一起加油吧！',
    '记得休息哦'
  ];

  function createDialogBox() {
    dialogBox = document.createElement('div');
    dialogBox.id = 'arkpets-dialog';
    dialogBox.className = 'arkpets-dialog';

    dialogText = document.createElement('div');
    dialogText.id = 'arkpets-dialog-text';
    dialogText.className = 'arkpets-dialog-text';

    dialogBox.appendChild(dialogText);

    document.body.appendChild(dialogBox);

    showRandomMessage();
    startPositionTracking();

    // 定时换一句闲聊语，让气泡时不时蹦出新句子
    setInterval(function () {
      if (isVisible && !document.hidden) {
        showRandomMessage();
      }
    }, 20000);
  }

  function showRandomMessage() {
    if (dialogText && isVisible) {
      var randomIndex = Math.floor(Math.random() * messages.length);
      dialogText.textContent = messages[randomIndex];
    }
  }

  function startPositionTracking() {
    if (followAnimation) return;
    function updateDialogPosition() {
      var canvas = document.getElementById('arkpets-demo');
      if (canvas && isVisible) {
        var rect = canvas.getBoundingClientRect();
        var currentX = rect.left + rect.width / 2;
        var currentY = rect.top;

        if (currentX !== lastCanvasPos.x || currentY !== lastCanvasPos.y) {
          lastCanvasPos.x = currentX;
          lastCanvasPos.y = currentY;

          if (dialogBox && dialogBox.style.display !== 'none') {
            dialogBox.style.left = currentX + 'px';
            dialogBox.style.top = (currentY - 45) + 'px';
          }
        }
      }
      followAnimation = requestAnimationFrame(updateDialogPosition);
    }
    updateDialogPosition();
  }

  function stopPositionTracking() {
    if (followAnimation) {
      cancelAnimationFrame(followAnimation);
      followAnimation = null;
    }
  }

  function initArkPets() {
    if (typeof arkpets !== 'undefined' && arkpets.Character) {
      character = new arkpets.Character(
        'arkpets-demo',
        function (e) {
          arkpets.showContextMenu(e, character, {
            getCharacterModels: function () {
              return CHARACTER_RESOURCES;
            }
          });
        },
        CHARACTER_RESOURCES[0]
      );
      console.log('ArkPets initialized:', character);

      setTimeout(function () {
        showPet();
        createDialogBox();
      }, 100);
    } else {
      console.warn('ArkPets not loaded yet, retrying...');
      setTimeout(initArkPets, 500);
    }
  }

  function showPet() {
    var canvas = document.getElementById('arkpets-demo');
    if (canvas) {
      canvas.style.transition = 'opacity 0.5s ease';
      canvas.style.pointerEvents = 'auto';
      canvas.style.opacity = '1';
    }
    if (dialogBox) {
      dialogBox.style.transition = 'opacity 0.5s ease';
      dialogBox.style.opacity = '1';
    }
    isVisible = true;
  }

  function hidePet() {
    var canvas = document.getElementById('arkpets-demo');
    if (canvas) {
      canvas.style.transition = 'opacity 0.5s ease';
      canvas.style.opacity = '0';
      setTimeout(function () {
        if (!isVisible) {
          canvas.style.pointerEvents = 'none';
        }
      }, 500);
    }
    if (dialogBox) {
      dialogBox.style.transition = 'opacity 0.5s ease';
      dialogBox.style.opacity = '0';
    }
    isVisible = false;
  }

  function togglePet() {
    if (isVisible) {
      hidePet();
    } else {
      showPet();
      showRandomMessage();
    }
    return isVisible;
  }

  window.ArkPets = {
    show: showPet,
    hide: hidePet,
    toggle: togglePet,
    isVisible: function () { return isVisible; },
    setMessage: function (msg) {
      if (dialogText) {
        dialogText.textContent = msg;
      }
    }
  };

  // 切到后台/隐藏时停止跟随动画；回到前台且桌宠可见时恢复
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPositionTracking();
    } else if (isVisible) {
      startPositionTracking();
    }
  });

  if (document.readyState !== 'loading') {
    initArkPets();
  } else {
    document.addEventListener('DOMContentLoaded', initArkPets);
  }
})();
