// 북부산성결교회 보고 화면 ↔ 구글 앱스 스크립트(JSON) 연결 — v12, T1109 (형님 11/09 승인: 화면을 구글 밖에 둔다).
// 왜: 구글 계정이 여러 개 로그인된 브라우저에서 script.google.com 화면이 '현재 파일을 열 수 없습니다'로 막힌다.
//     이 파일은 구글 쿠키를 보내지 않고(credentials:'omit') 시트 쪽 웹앱에 JSON만 묻는다 — 시크릿 창과 같은 조건이다.
// 규칙(바꾸지 말 것 — test_site_v12.cjs가 검사한다):
//   읽기 = GET  …/exec?api=이름&…           쓰기 = POST …/exec, 본문 = JSON 글자, Content-Type = 'text/plain;charset=utf-8'
//   그 밖의 머리글(Authorization, X-…, application/json 등)을 넣으면 브라우저가 먼저 OPTIONS로 묻는데,
//   Apps Script는 그 물음에 답하지 못해 요청이 막힌다(마스터 11/09 실측: application/json POST = 막힘).
// v14 (형님 11/15: 링크가 바로 안 열린다): 읽기(GET)만 12초 안에 답이 없으면 끊고 한 번만 다시 묻는다(Apps Script가 가끔 멈춘다 — 실측 2분 넘게
//   답 없음). 다시 묻는 동안 '불러오는 중' 글을 바꾼다. 쓰기(POST: 보고·사진·이름 더하기)는 절대 다시 보내지 않는다 — 두 번 접수될 수 있다.
// v15 (형님 11/15 v14 뒤에도 느리다 — 실측: GET 약 40%가 구글 앞단 첫 단계에서 30초 넘게 멈춤, 우리 코드는 1~3초):
//   읽기(GET)는 3.5초 안에 답이 없으면 같은 물음을 하나 더 띄워 먼저 온 답을 쓰고 나머지는 끊는다. 전체는 20초까지.
//   처음 화면 값(boot·dashBoot)은 이 휴대폰에 마지막으로 받은 값을 두었다가 다음에 열 때 바로 보여 주고, 뒤에서 새 값을 받아
//   달라졌으면 바꾼다(보고 화면은 아직 아무것도 만지지 않았을 때만 — 쓰던 글을 지우지 않는다). 쓰기(POST)는 v14 그대로 한 번만.
(function (G) {
  'use strict';
  var CT = 'text/plain;charset=utf-8';
  var HEDGE_MS = 3500;    // v15: 이 시간 안에 답이 없으면 같은 GET을 하나 더
  var CAP_MS = 20000;     // v15: GET 전체 한도
  var RETRY_TEXT = '조금 더 걸리고 있습니다. 다시 불러오는 중…';   // v14
  var CACHE_DAYS = 14;    // v15: 이보다 오래된 저장 값은 쓰지 않는다
  var CACHED = { boot: 'k', dashBoot: 'v' };   // v15: 저장해 두는 처음 값 — 이름: 열쇠 칸

  // 링크의 값: #k=… 또는 ?k=… (둘 다 받는다. # 뒤는 어떤 서버로도 가지 않는다)
  function param(name) {
    var h = new URLSearchParams(String(G.location.hash || '').replace(/^#/, ''));
    var q = new URLSearchParams(G.location.search || '');
    return h.get(name) || q.get(name) || '';
  }

  function base(kind) {
    var cfg = G.NB_CONFIG || {};
    if (kind === 'eval') {
      // 평가서 웹앱 주소는 공개 저장소에 적지 않는다 — 장로님들께 드리는 링크의 #d=배포번호 로만 받는다.
      var d = param('d');
      if (/^[A-Za-z0-9_-]{20,}$/.test(d)) return 'https://script.google.com/macros/s/' + d + '/exec';
      return cfg.EVAL_API || '';
    }
    return cfg.REPORT_API || '';
  }

  function call(kind, action, params, isPost, onRetry) {
    var url = base(kind);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || /REPLACE_WITH/.test(url)) {
      return Promise.reject(new Error('연결 주소가 아직 설정되지 않았거나 링크가 잘렸습니다. 받으신 링크 전체로 다시 열어 주세요.'));
    }
    var opts = { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' };
    if (isPost) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': CT };
      opts.body = JSON.stringify(Object.assign({}, params || {}, { api: action }));
    } else {
      var q = new URLSearchParams();
      q.set('api', action);
      Object.keys(params || {}).forEach(function (k) { var v = params[k]; if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
      url += '?' + q.toString();
    }
    // 한 번 묻기 — 답(JSON)을 돌려주거나, 다시 물어도 되는 실패를 던진다.
    function once(ctl) {
      var o = Object.assign({}, opts);
      if (ctl) o.signal = ctl.signal;
      return G.fetch(url, o).then(function (r) {
        if (!r.ok) throw new Error('서버가 응답하지 않습니다(' + r.status + '). 잠시 뒤 다시 눌러 주세요.');
        return r.json().catch(function () { throw new Error('서버 답을 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); });
      }, function () {
        throw new Error('인터넷 연결을 확인하고 다시 눌러 주세요.');
      });
    }
    var answered = isPost ? once(null) : hedged(once, onRetry);   // v15: POST는 한 번만, GET은 겹쳐 묻기
    return answered.then(function (j) {
      if (!j || j.ok !== true) throw new Error((j && j.error) || '알 수 없는 오류입니다.');
      return j.data;
    });
  }

  // v15: 겹쳐 묻기 — 첫 GET이 HEDGE_MS 안에 답하지 않거나 바로 실패하면 같은 GET을 하나 더 띄운다(최대 2개).
  //   먼저 온 답을 쓰고 나머지는 끊는다. 둘 다 실패하면 마지막 실패 이유, CAP_MS가 지나면 '늦게 답하고 있습니다'.
  function hedged(once, onRetry) {
    return new Promise(function (resolve, reject) {
      var ctls = [], timers = [], started = 0, failed = 0, settled = false;
      function finish(fn, v) {
        if (settled) return;
        settled = true;
        timers.forEach(function (t) { if (typeof G.clearTimeout === 'function') G.clearTimeout(t); });
        ctls.forEach(function (c) { try { c.abort(); } catch (_) { return; } });
        fn(v);
      }
      function launch() {
        started++;
        var c = typeof G.AbortController === 'function' ? new G.AbortController() : null;
        if (c) ctls.push(c);
        once(c).then(function (j) { finish(resolve, j); }, function (e) {
          failed++;
          if (settled) return;
          if (started < 2) { second(); return; }
          if (failed >= started) finish(reject, e);
        });
      }
      function second() {
        if (settled || started >= 2) return;
        showRetry(onRetry);
        launch();
      }
      launch();
      timers.push(G.setTimeout(second, HEDGE_MS));
      timers.push(G.setTimeout(function () { finish(reject, new Error('서버가 늦게 답하고 있습니다. 잠시 뒤 다시 눌러 주세요.')); }, CAP_MS));
    });
  }

  // v15: 이 휴대폰에 저장해 둔 처음 값. 저장소가 막혀 있어도(사생활 보호 창 등) 화면은 그대로 동작한다.
  function cacheKey(action, params) {
    var f = CACHED[action], id = f && params ? String(params[f] || '') : '';
    return id ? 'nb15:' + action + ':' + id : '';
  }
  function cacheGet(key) {
    try {
      var o = JSON.parse(G.localStorage.getItem(key) || 'null');
      if (!o || typeof o.t !== 'number' || o.d == null || Date.now() - o.t > CACHE_DAYS * 864e5) return null;
      return o;
    } catch (_) { return null; }
  }
  function cachePut(key, data) {
    try { if (data == null) G.localStorage.removeItem(key); else G.localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (_) { return; }
  }
  // 새로 고침은 한 번만(1분 안에 두 번 하지 않는다) — 끝없이 다시 열리는 일이 없게.
  function reloadOnce(key) {
    try {
      var k = 'nb15r:' + key, last = Number(G.sessionStorage.getItem(k) || 0);
      if (Date.now() - last < 60000) return;
      G.sessionStorage.setItem(k, String(Date.now()));
    } catch (_) { return; }
    G.location.reload();
  }

  // v14: 다시 묻는 중이라는 것을 보이는 곳 — 부른 쪽이 준 함수, 그리고 화면의 '불러오는 중' 글(.loading p).
  function showRetry(onRetry) {
    try {
      if (typeof onRetry === 'function') onRetry(RETRY_TEXT);
      Array.prototype.forEach.call(G.document.querySelectorAll('.loading p'), function (p) { p.textContent = RETRY_TEXT; });
    } catch (_) { return; }   // 글을 못 바꿔도 다시 묻기는 그대로
  }

  // google.script.run 과 같은 모양 — 화면 코드는 그대로 .withSuccessHandler(f).withFailureHandler(g).함수(값) 를 쓴다.
  function runner(table) {
    function make(ok, fail) {
      var o = {
        withSuccessHandler: function (h) { return make(h, fail); },
        withFailureHandler: function (h) { return make(ok, h); }
      };
      Object.keys(table).forEach(function (name) {
        o[name] = function () {
          var args = Array.prototype.slice.call(arguments);
          Promise.resolve().then(function () { return table[name].apply(null, args); })
            .then(function (r) { if (ok) ok(r); }, function (e) { if (fail) fail(e); });
        };
      });
      return o;
    }
    return make(null, null);
  }

  // 첫 값을 받아 화면을 시작한다. 받는 동안 '불러오는 중', 실패하면 이유와 [다시 시도].
  // v15: 저장해 둔 값이 있으면 바로 화면을 시작하고 뒤에서 새 값을 받는다. 화면(cb)이 함수를 돌려주면 새 값이 달라졌을 때
  //   그 함수로 바꾸고(모아보기), 돌려주지 않으면 아직 아무것도 만지지 않았을 때만 새로 연다(보고 화면 — 쓰던 글을 지키려고).
  //   열쇠가 꺼져 새 값이 null이면 저장 값을 지우고 새로 연다(꺼진 링크가 옛 화면을 계속 보이지 않게).
  function start(kind, action, params, cb) {
    var key = cacheKey(action, params), hit = key ? cacheGet(key) : null;
    if (hit) {
      var touched = false;
      var mark = function () { touched = true; };
      ['input', 'change', 'keydown', 'pointerdown'].forEach(function (ev) { try { G.document.addEventListener(ev, mark, true); } catch (_) { return; } });
      var refresh = cb(hit.d);
      call(kind, action, params, false).then(function (data) {
        if (JSON.stringify(data) === JSON.stringify(hit.d)) { cachePut(key, data); return; }
        cachePut(key, data);
        if (data != null && typeof refresh === 'function') refresh(data);
        else if (data == null || !touched) reloadOnce(key);
      }, function () { return; });   // 새 값을 못 받으면 저장 값 화면을 그대로 둔다
      return;
    }
    var box = G.document.createElement('div');
    box.id = 'nb-boot';
    box.setAttribute('role', 'status');
    box.style.cssText = 'max-width:560px;margin:24px auto;padding:18px 16px;font:17px/1.6 "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;text-align:center';
    box.textContent = '불러오는 중입니다…';
    G.document.body.insertBefore(box, G.document.body.firstChild);
    call(kind, action, params, false, function (t) { box.textContent = t; }).then(function (data) {
      if (key) cachePut(key, data);
      box.remove();
      cb(data);
    }, function (e) {
      box.textContent = '';
      var p = G.document.createElement('p'); p.textContent = e.message;
      var b = G.document.createElement('button'); b.type = 'button'; b.textContent = '다시 시도';
      b.style.cssText = 'min-height:48px;padding:8px 20px;font:inherit;font-weight:700;border-radius:12px;border:1.5px solid #a8402a;background:#fff;color:#8a3220;cursor:pointer';
      b.addEventListener('click', function () { G.location.reload(); });
      box.appendChild(p); box.appendChild(b);
    });
  }

  G.NBAPI = {
    param: param,
    call: call,
    get: function (kind, action, params) { return call(kind, action, params, false); },
    post: function (kind, action, params) { return call(kind, action, params, true); },
    runner: runner,
    start: start
  };
})(window);
