// Mobile (offline APK) build only: copied to public/ by prepare-mobile.mjs and
// loaded before the app. Android WebView has no Web Speech API, so this
// implements window.speechSynthesis / SpeechSynthesisUtterance on top of the
// native TextToSpeech bridge (window.AndroidTTS, see AndroidTts.java).
(function () {
  var bridge = window.AndroidTTS;
  if (!bridge) return;

  var VOICE = {
    name: 'Japonais (Android)',
    lang: 'ja-JP',
    voiceURI: 'android-tts-ja',
    localService: true,
    default: true,
  };

  function Target() {
    this._listeners = {};
  }
  Target.prototype.addEventListener = function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  };
  Target.prototype.removeEventListener = function (type, fn) {
    var list = this._listeners[type] || [];
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  Target.prototype._emit = function (type, event) {
    var handler = this['on' + type];
    if (typeof handler === 'function') handler.call(this, event);
    (this._listeners[type] || []).slice().forEach(function (fn) {
      fn.call(this, event);
    }, this);
  };

  function Utterance(text) {
    Target.call(this);
    this.text = text || '';
    this.lang = 'ja-JP';
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
  }
  Utterance.prototype = Object.create(Target.prototype);

  var synth = new Target();
  var pendingById = {};
  var counter = 0;
  synth.speaking = false;
  synth.pending = false;
  synth.paused = false;

  synth.getVoices = function () {
    return bridge.isReady() ? [VOICE] : [];
  };
  synth.speak = function (utterance) {
    var id = 'u' + ++counter;
    pendingById[id] = utterance;
    synth.speaking = true;
    bridge.speak(
      String(utterance.text || ''),
      Number(utterance.rate) || 1,
      Number(utterance.pitch) || 1,
      id,
    );
  };
  synth.cancel = function () {
    bridge.cancel();
    Object.keys(pendingById).forEach(function (id) {
      var u = pendingById[id];
      delete pendingById[id];
      u._emit('error', { type: 'error', error: 'interrupted', utterance: u });
    });
    synth.speaking = false;
  };
  synth.pause = function () {};
  synth.resume = function () {};

  window.__androidTtsEvent = function (id, type) {
    var u = pendingById[id];
    if (!u) return;
    if (type === 'start') {
      u._emit('start', { type: 'start', utterance: u });
      return;
    }
    delete pendingById[id];
    synth.speaking = Object.keys(pendingById).length > 0;
    if (type === 'end') u._emit('end', { type: 'end', utterance: u });
    else u._emit('error', { type: 'error', error: type, utterance: u });
  };
  window.__androidTtsReady = function () {
    synth._emit('voiceschanged', { type: 'voiceschanged' });
  };

  try {
    Object.defineProperty(window, 'speechSynthesis', {
      value: synth,
      configurable: true,
    });
  } catch (e) {
    window.speechSynthesis = synth;
  }
  window.SpeechSynthesisUtterance = Utterance;
})();
