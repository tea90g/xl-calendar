넣는 위치:

1) electron/main.js
   - 기존 파일 전체 삭제 후, 이 main.js 내용으로 교체

2) electron/preload.js
   - 기존 파일 전체 삭제 후, 이 preload.js 내용으로 교체

추가 npm 설치 필요 없음.
PowerShell을 내부에서 호출해서 현재 활성 창/실행 중 프로그램 목록을 읽습니다.

테스트:
1. 실행 중인 앱 끄기
2. CMD에서 npm run dev
3. 설정 → 작업 추적 프로그램 → 실행중 선택
4. CLIP STUDIO 관련 항목을 선택
5. CLIP STUDIO를 실제로 사용하면서 작업 시간이 올라가는지 확인

참고:
- File / Edit / View / Window 메뉴바는 사라져야 정상입니다.
- 완전한 무테두리 창은 아니고, Windows 닫기/최소화 버튼은 유지하는 방식입니다.
- 그래도 상단 기본 메뉴바는 없어지고 캘린더 자체가 훨씬 앱처럼 보입니다.
