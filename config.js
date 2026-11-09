// 보고 웹앱(구역·부서 보고 + 교역자 모아보기)의 주소 — 마스터가 배포 후 한 번만 바꾼다.
// 이 주소는 지금도 모든 보고자 링크에 들어 있는 주소라 공개되어도 새로 드러나는 것이 없다(모든 요청은 개인 열쇠로 다시 확인한다).
// 평가서 웹앱 주소는 여기에 적지 않는다(평가서는 열쇠 없이 보내는 화면이라, 장로님 링크의 #d= 로만 전한다).
window.NB_CONFIG = {
  REPORT_API: 'https://script.google.com/macros/s/AKfycbysTySfh0yLyr8ZP3bYeX1dVxKtvPOtMV3PRWpWIzuUUzpVAdjHtEvUhqmPDB-1Sl4h/exec',
  EVAL_API: ''
};
