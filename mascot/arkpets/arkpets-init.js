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
  var dialogInput = null;
  var dialogSendBtn = null;
  var dialogVoiceBtn = null;
  var dialogCloseBtn = null;
  var isChatMode = false;
  var isSpeaking = false;
  var audioContext = null;
  var lastCanvasPos = { x: 0, y: 0 };
  var followAnimation = null;
  var chatHistory = [];
  var currentResponse = '';
  var currentAudio = null;

  var API_BASE_URL = 'https://api-hc686dyr2-blog13.vercel.app';
  var TTS_VOICE_ID = '6152d1d4-8e30-4847-bf7a-87560bf431e8';

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

    var inputContainer = document.createElement('div');
    inputContainer.id = 'arkpets-dialog-input-container';
    inputContainer.className = 'arkpets-dialog-input-container';

    dialogInput = document.createElement('input');
    dialogInput.id = 'arkpets-dialog-input';
    dialogInput.className = 'arkpets-dialog-input';
    dialogInput.type = 'text';
    dialogInput.placeholder = '说点什么...';
    dialogInput.addEventListener('keydown', handleInputKeyDown);

    dialogSendBtn = document.createElement('button');
    dialogSendBtn.id = 'arkpets-dialog-send';
    dialogSendBtn.className = 'arkpets-dialog-send';
    dialogSendBtn.innerHTML = '→';
    dialogSendBtn.addEventListener('click', sendMessage);

    dialogVoiceBtn = document.createElement('button');
    dialogVoiceBtn.id = 'arkpets-dialog-voice';
    dialogVoiceBtn.className = 'arkpets-dialog-voice';
    dialogVoiceBtn.innerHTML = '🔊';
    dialogVoiceBtn.addEventListener('click', toggleSpeech);

    dialogCloseBtn = document.createElement('button');
    dialogCloseBtn.id = 'arkpets-dialog-close';
    dialogCloseBtn.className = 'arkpets-dialog-close';
    dialogCloseBtn.innerHTML = '×';
    dialogCloseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      exitChatMode();
    });

    inputContainer.appendChild(dialogInput);
    inputContainer.appendChild(dialogVoiceBtn);
    inputContainer.appendChild(dialogSendBtn);

    dialogBox.appendChild(dialogCloseBtn);
    dialogBox.appendChild(dialogText);
    dialogBox.appendChild(inputContainer);

    dialogBox.addEventListener('click', toggleChatMode);

    document.body.appendChild(dialogBox);

    showRandomMessage();
    startPositionTracking();
  }

  function toggleChatMode() {
    if (!isChatMode) {
      isChatMode = true;
      dialogBox.classList.add('chat-mode');
      dialogInput.focus();
    }
  }

  function exitChatMode() {
    isChatMode = false;
    dialogBox.classList.remove('chat-mode');
    dialogInput.blur();
    dialogInput.value = '';
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    isSpeaking = false;
    if (dialogVoiceBtn) {
      dialogVoiceBtn.innerHTML = '🔊';
    }
    showRandomMessage();
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      exitChatMode();
    }
  }

  async function sendMessage() {
    var text = dialogInput.value.trim();
    if (!text) return;

    dialogInput.value = '';
    dialogInput.disabled = true;
    dialogSendBtn.disabled = true;
    dialogVoiceBtn.disabled = true;

    currentResponse = '';
    dialogText.textContent = '';
    dialogText.classList.add('typing');

    chatHistory.push({ role: 'user', content: text });

    try {
      var response = await fetch(API_BASE_URL + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: chatHistory,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();

      while (true) {
        var { done, value } = await reader.read();
        
        if (done) break;

        var chunk = decoder.decode(value, { stream: true });
        var lines = chunk.split('\n');

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              var json = JSON.parse(data);
              if (json.choices && json.choices[0] && json.choices[0].delta) {
                var delta = json.choices[0].delta;
                if (delta.content) {
                  currentResponse += delta.content;
                  dialogText.textContent = currentResponse;
                }
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }

      chatHistory.push({ role: 'assistant', content: currentResponse });
      dialogText.classList.remove('typing');
      
      setTimeout(function() {
        if (currentResponse) {
          synthesizeSpeech(currentResponse);
        }
      }, 500);

    } catch (error) {
      console.error('Chat error:', error);
      dialogText.textContent = '抱歉，我好像出了点问题...';
      dialogText.classList.remove('typing');
    } finally {
      dialogInput.disabled = false;
      dialogSendBtn.disabled = false;
      dialogVoiceBtn.disabled = false;
      dialogInput.focus();
    }
  }

  async function synthesizeSpeech(text) {
    if (!text) return;

    try {
      var response = await fetch(API_BASE_URL + '/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          language: 'Chinese',
          stream: false,
          voice_id: TTS_VOICE_ID
        })
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      var audioBlob = await response.blob();
      var audioUrl = URL.createObjectURL(audioBlob);

      if (window.Audio) {
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }
        currentAudio = new Audio(audioUrl);
        isSpeaking = true;
        dialogVoiceBtn.innerHTML = '⏸';
        
        currentAudio.onended = function() {
          isSpeaking = false;
          dialogVoiceBtn.innerHTML = '🔊';
        };
        
        currentAudio.onerror = function() {
          isSpeaking = false;
          dialogVoiceBtn.innerHTML = '🔊';
        };
        
        currentAudio.play();
      }
    } catch (error) {
      console.error('TTS error:', error);
      isSpeaking = false;
      dialogVoiceBtn.innerHTML = '🔊';
    }
  }

  function toggleSpeech() {
    if (isSpeaking) {
      var audioElements = document.getElementsByTagName('audio');
      for (var i = 0; i < audioElements.length; i++) {
        audioElements[i].pause();
      }
      isSpeaking = false;
      dialogVoiceBtn.innerHTML = '🔊';
    } else if (currentResponse) {
      synthesizeSpeech(currentResponse);
    }
  }

  function showRandomMessage() {
    if (dialogText && isVisible && !isChatMode) {
      var randomIndex = Math.floor(Math.random() * messages.length);
      dialogText.textContent = messages[randomIndex];
    }
  }

  function startPositionTracking() {
    function updateDialogPosition() {
      var canvas = document.getElementById('arkpets-demo');
      if (canvas && dialogBox && isVisible) {
        var rect = canvas.getBoundingClientRect();
        var currentX = rect.left + rect.width / 2;
        var currentY = rect.top;

        if (currentX !== lastCanvasPos.x || currentY !== lastCanvasPos.y) {
          lastCanvasPos.x = currentX;
          lastCanvasPos.y = currentY;

          var offsetY = isChatMode ? -100 : -60;
          dialogBox.style.left = currentX + 'px';
          dialogBox.style.top = (currentY + offsetY) + 'px';
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
    },
    setApiUrl: function (url) {
      API_BASE_URL = url;
    }
  };

  if (document.readyState !== 'loading') {
    initArkPets();
  } else {
    document.addEventListener('DOMContentLoaded', initArkPets);
  }
})();