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
      name: '黍·年',
      skeleton: 'models/shu-nian/build_char_2025_shu_nian#11.skel',
      atlas: 'models/shu-nian/build_char_2025_shu_nian#11.atlas',
      texture: 'models/shu-nian/build_char_2025_shu_nian#11.png',
      resourcePath: '/mascot/arkpets/'
    }
  ];

  var character = null;
  var isVisible = false;

  function initArkPets() {
    if (typeof arkpets !== 'undefined' && arkpets.Character) {
      var style = document.createElement('style');
      style.textContent = '.arkpets-canvas { opacity: 0 !important; pointer-events: none !important; }';
      document.head.appendChild(style);

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
        style.remove();
        hidePet();
      }, 200);
    } else {
      console.warn('ArkPets not loaded yet, retrying...');
      setTimeout(initArkPets, 500);
    }
  }

  function showPet() {
    var canvas = document.getElementById('arkpets-demo');
    if (canvas) {
      canvas.style.opacity = '1';
      canvas.style.pointerEvents = 'auto';
    }
    isVisible = true;
  }

  function hidePet() {
    var canvas = document.getElementById('arkpets-demo');
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.style.pointerEvents = 'none';
    }
    isVisible = false;
  }

  function togglePet() {
    if (isVisible) {
      hidePet();
    } else {
      showPet();
    }
    return isVisible;
  }

  window.ArkPets = {
    show: showPet,
    hide: hidePet,
    toggle: togglePet,
    isVisible: function () { return isVisible; }
  };

  if (document.readyState !== 'loading') {
    initArkPets();
  } else {
    document.addEventListener('DOMContentLoaded', initArkPets);
  }
})();