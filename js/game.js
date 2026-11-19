/* =========================================================
   Set the Clock - game logic (plain JavaScript, no libraries)

   Flow: Start button -> 10 random questions -> "Great job!" -> Play again
   Each question plays "Set the clock to ..." and the child drags the
   clock hands, then taps the green check button.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var STAGE_W = 720, STAGE_H = 540;
  var TOTAL_QUESTIONS = 10;
  var START_TIME = 4 * 60;          // the artwork shows 4:00, so the game starts there
  var SNAP_MINUTES = 5;             // audio exists for 5-minute steps only
  var AUDIO = 'assets/audio/';
  var MISSING_OCLOCK = [11];        // no "11 o'clock" recording was provided

  /* ---------- Elements ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var hourWrap = $('hourWrap'), minuteWrap = $('minuteWrap');
  var hourHit = $('hourHit'), minuteHit = $('minuteHit');
  var cap = $('cap');
  var digital = $('digital');
  var checkBtn = $('checkBtn'), replayBtn = $('replayBtn');
  var feedback = $('feedback'), clockLayer = $('clockLayer');
  var progress = $('progress');
  var startScreen = $('startScreen'), endScreen = $('endScreen');

  /* ---------- Game state ---------- */
  var clockMinutes = START_TIME;    // minutes since 12:00, NOT wrapped (keeps rotations smooth)
  var questions = [];
  var qIndex = 0;
  var triesThisQuestion = 0;
  var firstTryResults = [];
  var busy = false;                 // true while feedback is showing (blocks double taps)
  var drag = null;                  // { hand: 'hour'|'minute', lastAngle, pointerId }

  /* =========================================================
     1. Responsive scaling: fit the 720x540 stage into the window
     ========================================================= */
  function fitStage() {
    var s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  /* =========================================================
     2. Clock drawing
     ========================================================= */
  function wrap720(m) { return ((Math.round(m) % 720) + 720) % 720; }

  // Current time as {h: 1-12, m: 0-59}
  function currentTime() {
    var t = wrap720(clockMinutes);
    var h = Math.floor(t / 60);
    return { h: h === 0 ? 12 : h, m: t % 60 };
  }

  function renderClock() {
    // Minute hand turns 6 deg per minute, hour hand 0.5 deg per minute,
    // so moving either hand always moves the other one too.
    minuteWrap.style.transform = 'rotate(' + clockMinutes * 6 + 'deg)';
    hourWrap.style.transform = 'rotate(' + clockMinutes * 0.5 + 'deg)';
    renderDigital(currentTime());
    var v = wrap720(clockMinutes);
    hourHit.setAttribute('aria-valuenow', v);
    minuteHit.setAttribute('aria-valuenow', v);
    hourHit.setAttribute('aria-valuetext', timeText(currentTime()));
    minuteHit.setAttribute('aria-valuetext', timeText(currentTime()));
  }

  function timeText(t) { return t.h + ':' + (t.m < 10 ? '0' : '') + t.m; }

  /* ---------- Seven-segment digital read-out (SVG) ---------- */
  var DW = 30, DH = 54, ST = 7, GAP = 7, COLON_W = 10;   // digit size in SVG units
  var SEGMENTS = {          // which segments light up for each digit
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
    5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
  };

  // Hexagon-shaped segment, horizontal or vertical
  function segPoints(x0, y0, x1, y1) {
    var t = ST / 2, p;
    if (y0 === y1) { // horizontal
      p = [[x0 + 1, y0], [x0 + t + 1, y0 - t], [x1 - t - 1, y0 - t], [x1 - 1, y0], [x1 - t - 1, y0 + t], [x0 + t + 1, y0 + t]];
    } else {         // vertical
      p = [[x0, y0 + 1], [x0 + t, y0 + t + 1], [x0 + t, y1 - t - 1], [x0, y1 - 1], [x0 - t, y1 - t - 1], [x0 - t, y0 + t + 1]];
    }
    return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ');
  }

  function digitSVG(n, x) {
    var t = ST / 2, w = DW, h = DH, m = h / 2;
    var segs = {
      a: [x + t, t, x + w - t, t], g: [x + t, m, x + w - t, m], d: [x + t, h - t, x + w - t, h - t],
      f: [x + t, t, x + t, m], b: [x + w - t, t, x + w - t, m],
      e: [x + t, m, x + t, h - t], c: [x + w - t, m, x + w - t, h - t]
    };
    return SEGMENTS[n].split('').map(function (k) {
      var s = segs[k];
      return '<polygon class="seg" points="' + segPoints(s[0], s[1], s[2], s[3]) + '"/>';
    }).join('');
  }

  function renderDigital(t) {
    var chars = timeText(t).split('');
    var x = 0, out = '';
    chars.forEach(function (c, i) {
      if (c === ':') {
        var cx = x + COLON_W / 2 - ST / 2;
        out += '<rect class="seg" x="' + cx + '" y="' + (DH * 0.27) + '" width="' + ST + '" height="' + ST + '"/>';
        out += '<rect class="seg" x="' + cx + '" y="' + (DH * 0.62) + '" width="' + ST + '" height="' + ST + '"/>';
        x += COLON_W;
      } else {
        out += digitSVG(+c, x);
        x += DW;
      }
      if (i < chars.length - 1) x += GAP;
    });
    // Let the SVG centre the read-out inside the orange box
    digital.setAttribute('viewBox', (-4) + ' ' + (-5) + ' ' + (x + 8) + ' ' + (DH + 10));
    digital.innerHTML = out;
    digital.setAttribute('aria-label', timeText(t));
  }

  /* =========================================================
     3. Dragging the hands (mouse + touch via Pointer Events)
     ========================================================= */
  // Angle of the pointer around the clock centre: 0 = 12 o'clock, clockwise
  function pointerAngle(e) {
    var r = cap.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return Math.atan2(e.clientX - cx, cy - e.clientY) * 180 / Math.PI;
  }

  function startDrag(hand, e) {
    if (busy || !gameRunning()) return;
    e.preventDefault();
    drag = { hand: hand, lastAngle: pointerAngle(e), pointerId: e.pointerId };
    e.target.setPointerCapture(e.pointerId);
    hourWrap.classList.remove('snap'); minuteWrap.classList.remove('snap');
    stage.classList.add('dragging');
  }

  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var a = pointerAngle(e);
    var delta = a - drag.lastAngle;
    // Take the short way round when crossing the 12 (e.g. 359 deg -> 1 deg)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle = a;
    // Minute hand: 6 deg = 1 minute. Hour hand: 0.5 deg = 1 minute.
    clockMinutes += drag.hand === 'minute' ? delta / 6 : delta * 2;
    renderClock();
  }

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    drag = null;
    stage.classList.remove('dragging');
    snapClock();
  }

  // Snap to the nearest 5 minutes with a short animation
  function snapClock() {
    hourWrap.classList.add('snap'); minuteWrap.classList.add('snap');
    clockMinutes = Math.round(clockMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    renderClock();
  }

  [['hour', hourHit], ['minute', minuteHit]].forEach(function (pair) {
    var el = pair[1];
    el.addEventListener('pointerdown', function (e) { startDrag(pair[0], e); });
    el.addEventListener('pointermove', moveDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('lostpointercapture', endDrag);
    // Keyboard support: arrow keys move 5 minutes (minute hand) or 1 hour (hour hand)
    el.addEventListener('keydown', function (e) {
      if (busy || !gameRunning()) return;
      var step = pair[0] === 'minute' ? SNAP_MINUTES : 60;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') clockMinutes += step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') clockMinutes -= step;
      else if (e.key === 'Enter') { checkAnswer(); return; }
      else return;
      e.preventDefault();
      snapClock();
    });
  });

  /* =========================================================
     4. Audio
     One <audio> element plays the prompt clips in sequence.
     Re-using a single element (unlocked by the Start tap) keeps
     it working on iPad/iPhone and when opened from a file.
     ========================================================= */
  var voice = new Audio();
  voice.preload = 'auto';
  var playToken = 0;

  // Warm the browser cache so clips play back-to-back without gaps
  function preloadAudio() {
    var files = ['set-the-clock-to.mp3'];
    for (var h = 1; h <= 12; h++) {
      files.push('hours/' + h + '.mp3');
      if (MISSING_OCLOCK.indexOf(h) < 0) files.push('oclock/' + h + '.mp3');
    }
    for (var m = 5; m < 60; m += 5) files.push('minutes/' + pad(m) + '.mp3');
    files.forEach(function (f) { var a = new Audio(); a.preload = 'auto'; a.src = AUDIO + f; });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function clipsFor(q) {
    var list = [AUDIO + 'set-the-clock-to.mp3'];
    if (q.m === 0) list.push(AUDIO + 'oclock/' + q.h + '.mp3');
    else list.push(AUDIO + 'hours/' + q.h + '.mp3', AUDIO + 'minutes/' + pad(q.m) + '.mp3');
    return list;
  }

  // Play a list of clips one after another; a newer call cancels an older one
  function playSequence(list) {
    var token = ++playToken;
    var i = 0;
    replayBtn.classList.add('playing');
    function next() {
      if (token !== playToken) return;
      if (i >= list.length) { replayBtn.classList.remove('playing'); return; }
      voice.onended = next;
      voice.onerror = next;                       // skip a broken clip instead of stalling
      voice.src = list[i++];
      var p = voice.play();
      if (p && p.catch) p.catch(function () { replayBtn.classList.remove('playing'); });
    }
    voice.pause();
    next();
  }

  function stopVoice() {
    playToken++;
    voice.pause();
    replayBtn.classList.remove('playing');
  }

  function askQuestion() { playSequence(clipsFor(questions[qIndex])); }

  /* ---------- Feedback sounds (generated, no extra files needed) ---------- */
  var actx = null;
  function initTones() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
  }

  function tone(freq, start, dur, type, vol) {
    if (!actx) return;
    var o = actx.createOscillator(), g = actx.createGain();
    var t0 = actx.currentTime + start;
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  function soundCorrect() {   // happy rising arpeggio
    [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.1, 0.35, 'triangle', 0.25); });
  }
  function soundWrong() {     // soft, low "boop"
    var o = tone(260, 0, 0.35, 'sine', 0.25);
    if (o) o.frequency.exponentialRampToValueAtTime(170, actx.currentTime + 0.3);
  }

  /* =========================================================
     5. Questions: 10 random times with no repeats
     Rules: never the same time twice, never the same hour twice
     in a row, never two "o'clock" questions in a row, and the first
     question is never the time already on the clock.
     ========================================================= */
  function buildPool() {
    var pool = [];
    for (var h = 1; h <= 12; h++) {
      if (MISSING_OCLOCK.indexOf(h) < 0) pool.push({ h: h, m: 0 });
      for (var m = 5; m < 60; m += 5) pool.push({ h: h, m: m });
    }
    return pool;
  }

  function okAfter(q, prev) {
    return q.h !== prev.h && !(q.m === 0 && prev.m === 0);
  }

  function makeQuestions(startFrom) {
    var pool = buildPool();
    for (var attempt = 0; attempt < 50; attempt++) {
      var list = [], used = {}, prev = startFrom, ok = true;
      for (var n = 0; n < TOTAL_QUESTIONS; n++) {
        var choices = pool.filter(function (q) { return !used[q.h + ':' + q.m] && okAfter(q, prev); });
        if (!choices.length) { ok = false; break; }
        var pick = choices[Math.floor(Math.random() * choices.length)];
        used[pick.h + ':' + pick.m] = true;
        list.push(pick);
        prev = pick;
      }
      if (ok) return list;
    }
    return list;
  }

  /* =========================================================
     6. Game flow
     ========================================================= */
  function gameRunning() {
    return startScreen.classList.contains('hidden') && endScreen.classList.contains('hidden');
  }

  var STAR_PATH = 'M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7L1.9 9.2l7-1z';
  function starSVG(cls) {
    return '<svg class="star ' + (cls || '') + '" viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg>';
  }

  function renderProgress() {
    var html = '';
    for (var i = 0; i < TOTAL_QUESTIONS; i++) {
      html += starSVG(i < qIndex ? 'done' : i === qIndex ? 'current' : '');
    }
    progress.innerHTML = html;
  }

  function startGame() {
    initTones();                                  // unlock sound on this first tap
    questions = makeQuestions(currentTime());
    qIndex = 0;
    firstTryResults = [];
    triesThisQuestion = 0;
    busy = false;
    checkBtn.disabled = false;
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    renderProgress();
    askQuestion();
  }

  function checkAnswer() {
    if (busy || !gameRunning() || drag) return;
    busy = true;                                  // ignore repeated taps while feedback shows
    checkBtn.disabled = true;
    stopVoice();
    triesThisQuestion++;

    var q = questions[qIndex], t = currentTime();
    var correct = t.h === q.h && t.m === q.m;
    showBadge(correct ? 'correct' : 'wrong');

    if (correct) {
      soundCorrect();
      firstTryResults.push(triesThisQuestion === 1);
      qIndex++;
      renderProgress();
      var stars = progress.querySelectorAll('.star');
      if (stars[qIndex - 1]) stars[qIndex - 1].classList.add('pop');
      setTimeout(function () {
        busy = false;
        checkBtn.disabled = false;
        triesThisQuestion = 0;
        if (qIndex >= TOTAL_QUESTIONS) showEnd(); else askQuestion();
      }, 1400);
    } else {
      soundWrong();
      clockLayer.classList.remove('shake');
      void clockLayer.offsetWidth;                // restart the shake animation
      clockLayer.classList.add('shake');
      setTimeout(function () {
        busy = false;
        checkBtn.disabled = false;
        askQuestion();                            // say the time again to help
      }, 1000);
    }
  }

  function showBadge(kind) {
    feedback.className = '';
    void feedback.offsetWidth;                    // restart the pop animation
    feedback.className = kind;
  }

  function showEnd() {
    stopVoice();
    var html = '';
    for (var i = 0; i < TOTAL_QUESTIONS; i++) {
      html += starSVG('done').replace('<svg ', '<svg style="animation-delay:' + (i * 0.08) + 's" ');
    }
    $('endStars').innerHTML = html;
    endScreen.classList.remove('hidden');
    soundCorrect();
    setTimeout(function () { tone(1319, 0, 0.5, 'triangle', 0.2); }, 450);
    $('againBtn').focus();
  }

  /* ---------- Button wiring ---------- */
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  checkBtn.addEventListener('click', checkAnswer);
  replayBtn.addEventListener('click', function () {
    if (!gameRunning() || busy) return;
    initTones();
    askQuestion();                                // restarts the prompt from the beginning
  });

  // Pause the voice if the page is hidden (e.g. learner switches slide/tab)
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopVoice(); });

  /* ---------- Init ---------- */
  preloadAudio();
  renderClock();
  renderProgress();

  // Small hook for automated testing (not used by the game itself)
  window.__clockGame = {
    get questions() { return questions; }, get index() { return qIndex; },
    get time() { return currentTime(); }, get busy() { return busy; },
    setTime: function (h, m) { clockMinutes = (h % 12) * 60 + m; renderClock(); }
  };
})();
