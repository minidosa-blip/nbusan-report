// 북부산성결교회 보고 화면 ↔ 구글 앱스 스크립트(JSON) 연결 — v12, T1109 (형님 11/09 승인: 화면을 구글 밖에 둔다).
// 왜: 구글 계정이 여러 개 로그인된 브라우저에서 script.google.com 화면이 '현재 파일을 열 수 없습니다'로 막힌다.
//     이 파일은 구글 쿠키를 보내지 않고(credentials:'omit') 시트 쪽 웹앱에 JSON만 묻는다 — 시크릿 창과 같은 조건이다.
// 규칙(바꾸지 말 것 — test_site_v12.cjs가 검사한다):
//   읽기 = GET  …/exec?api=이름&…           쓰기 = POST …/exec, 본문 = JSON 글자, Content-Type = 'text/plain;charset=utf-8'
//   그 밖의 머리글(Authorization, X-…, application/json 등)을 넣으면 브라우저가 먼저 OPTIONS로 묻는데,
//   Apps Script는 그 물음에 답하지 못해 요청이 막힌다(마스터 11/09 실측: application/json POST = 막힘).
// v14 (형님 11/15: 링크가 바로 안 열린다): 읽기(GET)만 12초 안에 답이 없으면 끊고 한 번만 다시 묻는다(Apps Script가 가끔 멈춘다 — 실측 2분 넘게
//   답 없음). 다시 묻는 동안 '불러오는 중' 글을 바꾼다. 쓰기(POST: 보고·사진·이름 더하기)는 절대 다시 보내지 않는다 — 두 번 접수될 수 있다.
(function (G) {
  'use strict';
  var CT = 'text/plain;charset=utf-8';
  var GET_TIMEOUT_MS = 12000;   // v14
  var RETRY_TEXT = '조금 더 걸리고 있습니다. 다시 불러오는 중…';   // v14

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
    // v14: 한 번 묻기. GET은 GET_TIMEOUT_MS 뒤 끊는다. 실패의 종류(retry=다시 물어도 되는 실패)를 붙여 돌려준다.
    function once() {
      var o = Object.assign({}, opts), timer = null, ctl = null;
      if (!isPost && typeof G.AbortController === 'function') {
        ctl = new G.AbortController(); o.signal = ctl.signal;
        timer = G.setTimeout(function () { ctl.abort(); }, GET_TIMEOUT_MS);
      }
      var done = function () { if (timer) G.clearTimeout(timer); };
      return G.fetch(url, o).then(function (r) {
        done();
        if (!r.ok) { var e1 = new Error('서버가 응답하지 않습니다(' + r.status + '). 잠시 뒤 다시 눌러 주세요.'); e1.retry = true; throw e1; }
        return r.json().catch(function () { var e2 = new Error('서버 답을 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); e2.retry = true; throw e2; });
      }, function () {
        done();
        var e3 = new Error(ctl && ctl.signal.aborted ? '서버가 늦게 답하고 있습니다. 잠시 뒤 다시 눌러 주세요.' : '인터넷 연결을 확인하고 다시 눌러 주세요.'); e3.retry = true; throw e3;
      });
    }
    var first = once();
    var answered = isPost ? first : first.catch(function (e) {
      if (!e.retry) throw e;
      showRetry(onRetry);
      return once();   // v14: 딱 한 번만 다시
    });
    return answered.then(function (j) {
      if (!j || j.ok !== true) throw new Error((j && j.error) || '알 수 없는 오류입니다.');
      return j.data;
    });
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
  function start(kind, action, params, cb) {
    var box = G.document.createElement('div');
    box.id = 'nb-boot';
    box.setAttribute('role', 'status');
    box.style.cssText = 'max-width:560px;margin:24px auto;padding:18px 16px;font:17px/1.6 "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;text-align:center';
    box.textContent = '불러오는 중입니다…';
    G.document.body.insertBefore(box, G.document.body.firstChild);
    call(kind, action, params, false, function (t) { box.textContent = t; }).then(function (data) {
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
