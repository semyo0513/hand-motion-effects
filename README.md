# 핸드 이펙트 스튜디오

웹캠 앞 손동작으로 불꽃·번개·충격파를 만들고, **파워 슈트(레드·골드 장갑)** 를 몸에 장착하는 정적 웹앱입니다.
서버·DB 없이 브라우저에서만 동작하며, 영상은 외부로 전송되지 않습니다.

## 폴더 구조
index.html / css/style.css / js/(config, camera, handTracker, gestureEngine, themes, particles, effects, suit, recorder, main).js

## 주요 기능
- 손동작 이펙트: 손바닥·주먹·펴기↔오므리기·핀치·검지 궤적·V 번개·엄지 척(테마 전환)·두 손 구체·박수
- 파워 슈트: 두 주먹 맞대기(0.6초) → 가슴·어깨·양팔·헬멧 조립 → HUD, 리펄서 빔, 비행 모드, 페이스플레이트 열기/닫기
- 캡처(PNG)·녹화(webm) · 단축키 1~5 테마 / S 슈트 / F 페이스플레이트 / G 가이드 / D 디버그

## 로컬 실행
`file://`로는 열 수 없습니다. 폴더에서 `python -m http.server 8000` 실행 후 http://localhost:8000

## GitHub Pages 배포
1. 이 폴더 **안의 파일 전체**를 저장소 루트에 업로드(폴더째가 아님)
2. Settings → Pages → Deploy from a branch → main / (root)
3. https://<계정>.github.io/<저장소>/ 접속 후 카메라 허용

## 문제 해결
- 시작 버튼 후 아무 반응이 없으면: 새로고침(Ctrl+Shift+R) → 화면에 표시되는 오류 문구 확인 → F12 Console 확인
- 손이 안 잡히면: 조명을 밝게, 30cm~1m 거리, 디버그 스위치로 인식 상태 확인
- 슈트가 안 입혀지면: 어깨·팔이 모두 화면에 보이게 1~2m 뒤로 이동
