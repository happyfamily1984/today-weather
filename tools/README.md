# 개발 보조 스크립트

| 파일 | 용도 |
|---|---|
| gen_widget_layouts.py | 위젯 레이아웃 XML 생성. `python3 tools/gen_widget_layouts.py app/src/main/res` (res/layout 의 w_*, c_* 를 덮어씀 — 위젯 글씨 크기 등은 여기서 고친다) |
| render-widget-icons.js | 앱 icons.js 의 SVG 날씨 아이콘을 위젯용 PNG(res/drawable-nodpi/wx_*.png)로 렌더 |
| preview-screens.js | Playwright 로 앱 화면 캡쳐(실데이터). 인자: 작업폴더(그 안에 kma.key 파일), 배율, 출력폴더 |
| store-screenshots.js | 스토어 스크린샷 1080×1920 6장 캡쳐 |
| widget-mock.html / widget-mock-shot.js | 위젯 디자인 시안 HTML과 캡쳐 |
| feature-graphic.html | 스토어 그래픽 이미지 1024×500 |

스크립트 안의 경로는 당시 작업 폴더 기준이라 실행 전에 경로를 맞춘다.
기상청 인증키는 저장소에 두지 않는다(루트 keys.properties, git 제외).
