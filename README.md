# Calendar Clone App - Windows exe project

## 사용법
1. 압축을 푼다.
2. `build-windows.bat`를 더블클릭한다.
3. 완료되면 `release` 폴더 안의 설치 파일을 실행한다.

## 개발 미리보기
`run-dev.bat` 더블클릭.

## Google Drive 연동
앱 설정창에서 Google OAuth Client ID를 입력한 뒤 `연결` → `저장`/`불러오기`를 사용한다.

## 작업 추적
Windows exe에서는 현재 활성 창 제목을 1초마다 읽어 React 앱으로 전달한다.
설정창의 작업 추적 프로그램 이름이 활성 창 제목에 포함되면 `작업 시간`으로 카운트된다.
예: `CLIP STUDIO`, `Chrome`.
