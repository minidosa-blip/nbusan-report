# 북부산성결교회 보고 화면 (정적 파일)

Static screens for the church's weekly report app and the officer evaluation form. The data stays in Google Sheets. These pages talk to the Apps Script web apps as a JSON API, with no Google cookies (`credentials: 'omit'`). This avoids the multi-account "현재 파일을 열 수 없습니다" error.

- `report/` — 구역·부서 보고 (link: `report/?k=<보고자 열쇠>`)
- `dash/` — 교역자 모아보기 (link: `dash/?v=<열람 열쇠>`)
- `eval/` — 임직 후보 평가서 (link: `eval/#d=<평가서 배포 번호>`; 요약: `eval/#d=<배포 번호>&k=<요약 열쇠>`)
- `api.js` — the only place that calls `fetch`. Simple requests only: GET `?api=`, or POST with `text/plain`.
- `config.js` — the report web app URL.

No names, keys or sheet data are stored in this repository. Built from `구역보고앱/build_site_v12.cjs`; do not edit the built pages by hand.
