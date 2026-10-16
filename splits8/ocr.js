/* 대회 결과 캡처 → 숫자 읽기 → 내 기록 분석 칸 채우기
   사진은 이 기기(브라우저) 안에서만 읽습니다. 글자 읽는 프로그램(tesseract.js)과 영어 글자 자료만 처음에 내려받습니다. */
(function () {
  var btn = document.getElementById('ocrb'), file = document.getElementById('ocrf'), st = document.getElementById('ocrs');
  if (!btn || !file) return;
  var EN = document.documentElement.lang === 'en';
  var T = EN ? {
    load: 'Loading the text reader… (first time only, a few seconds)',
    read: 'Reading the image… ',
    none: 'Could not find split times in this image. Try a sharper image, or type the times in.',
    ok: function (n) { return 'Filled ' + n + ' boxes from the image. Please check the numbers, then press Analyze.'; },
    fail: 'The text reader could not load. Check your connection and try again.'
  } : {
    load: '글자 읽는 프로그램을 불러오는 중… (처음 한 번, 몇 초)',
    read: '이미지를 읽는 중… ',
    none: '이 이미지에서 구간 시간을 못 찾았어요. 더 선명한 이미지로 다시 하거나, 직접 넣어 주세요.',
    ok: function (n) { return '이미지에서 ' + n + '칸을 채웠어요. 숫자가 맞는지 확인하고 분석하기를 눌러 주세요.'; },
    fail: '글자 읽는 프로그램을 못 불러왔어요. 인터넷 연결을 확인하고 다시 해 주세요.'
  };
  function say(t, cls) { st.textContent = t; st.className = 'small ocrs' + (cls ? ' ' + cls : ''); }

  var lib = null;
  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    if (lib) return lib;
    lib = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = ok; s.onerror = function () { lib = null; no(); };
      document.head.appendChild(s);
    });
    return lib;
  }

  // 시간 글자 → 초. 0:04:35 · 04:35 · 4:35.2
  function sec(t) {
    var p = t.split(':').map(function (x) { return parseFloat(x); });
    if (p.some(isNaN)) return null;
    var s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    return Math.round(s);
  }
  function fm(s) { var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  var TIME = /(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?/g;
  function times(line) {
    // 글자 읽기에서 자주 틀리는 것: O→0, l·I→1 (숫자 사이에서만)
    var l = line.replace(/\s*:\s*/g, ':').replace(/[\dOolI|:]{3,}/g, function (w) {
      return /\d/.test(w) && /:/.test(w) ? w.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1') : w; });
    return (l.match(TIME) || []).map(sec).filter(function (v) { return v !== null && v >= 10; });
  }

  // 줄에서 구간 이름 찾기 (영어 결과 화면 기준)
  var KEYS = [
    ['rox', /rox\s*zone/i], ['ski', /ski\s*-?\s*erg/i], ['push', /sled\s*push/i], ['pull', /sled\s*pull/i],
    ['bbj', /burpee/i], ['farm', /farmer/i], ['lun', /lunge/i], ['wb', /wall\s*-?\s*ball/i], ['row', /\brow(ing)?\b/i]
  ];
  function parse(text) {
    var lines = text.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var out = {}, runs = {}, all = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], ts = times(l);
      if (!ts.length && i + 1 < lines.length) ts = times(lines[i + 1]);  // 이름과 시간이 다른 줄로 읽힌 경우
      all = all.concat(times(l));
      var rm = l.match(/\brun(?:ning)?\s*([1-8])\b/i);
      if (rm && ts.length) { if (!runs[rm[1]]) runs[rm[1]] = ts[0]; continue; }
      if (/\brun(?:ning)?\b/i.test(l) && !/rox/i.test(l)) continue;
      for (var k = 0; k < KEYS.length; k++) if (KEYS[k][1].test(l)) { if (ts.length && !out[KEYS[k][0]]) out[KEYS[k][0]] = ts[0]; break; }
      if (/(overall|finish|final|total)\s*time|^total\b|^time\b/i.test(l) && !/rox|run/i.test(l) && ts.length) out.total = Math.max(out.total || 0, Math.max.apply(null, ts));
    }
    var rk = Object.keys(runs);
    if (rk.length === 8) out.run = rk.reduce(function (a, k) { return a + runs[k]; }, 0);
    if (!out.total) { var big = all.filter(function (v) { return v >= 40 * 60 && v <= 4 * 3600; }); if (big.length) out.total = Math.max.apply(null, big); }
    // 말이 안 되는 값 빼기 (스테이션 30초~20분, Roxzone 1~25분)
    ['ski', 'push', 'pull', 'bbj', 'row', 'farm', 'lun', 'wb'].forEach(function (k) { if (out[k] && (out[k] < 30 || out[k] > 1200)) delete out[k]; });
    if (out.rox && (out.rox < 60 || out.rox > 1500)) delete out.rox;
    if (out.run && (out.run < 20 * 60 || out.run > 150 * 60)) delete out.run;
    return out;
  }

  function fill(r) {
    var n = 0;
    if (r.total) { document.getElementById('tt').value = fm(r.total); n++; }
    ['run', 'ski', 'push', 'pull', 'bbj', 'row', 'farm', 'lun', 'wb', 'rox'].forEach(function (k) {
      var el = document.getElementById('s_' + k); if (el && r[k]) { el.value = fm(r[k]); el.classList.add('ocrfill'); n++; }
    });
    if (n > 1) { var d = document.querySelector('details.more'); if (d) d.open = true; }
    return n;
  }

  btn.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f) return;
    btn.disabled = true; say(T.load);
    loadLib().then(function () {
      return Tesseract.recognize(f, 'eng', { logger: function (m) {
        if (m.status === 'recognizing text') say(T.read + Math.round(m.progress * 100) + '%');
      } });
    }).then(function (res) {
      var n = fill(parse(res.data.text));
      say(n ? T.ok(n) : T.none, n ? 'good' : 'bad');
    }).catch(function () { say(T.fail, 'bad'); })
      .then(function () { btn.disabled = false; file.value = ''; });
  });
  window.__ocrParse = parse;  // 시험용
})();
