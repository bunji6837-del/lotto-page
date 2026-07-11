# 기존 기능 보존 수정본

이번 수정본은 처음 올린 원본 `App.jsx`와 `App.css`를 기준으로 만들었습니다.

유지된 기능:
- Ctrl + V 캡처 붙여넣기
- 카드 드래그
- 카드 위치 맞교환
- 저장/수정 상태 전환
- 자동 정렬
- 회차 검색
- 개별 삭제
- 전체 삭제
- 기존 메모장과 자동 저장
- 확인창과 PC 알림
- 기존 Supabase 데이터 및 x/y/z_index
- 표 페이지 이동

추가된 기능:
- 아이디 로그인
- 로그인 사용자만 추가·수정·삭제
- 사진 선택 업로드
- 모바일 카메라 촬영
- 모바일 자동 그리드
- 확대 화면 이전/다음
- 키보드 좌우 방향키
- 모바일 좌우 스와이프
- 점 3개 메뉴의 상세 정보

## 관리자 계정 생성

Supabase Dashboard에서:

Authentication → Users → Add user

Email:
`hoony6837@lotto.local`

Password:
사용자가 지정한 관리자 비밀번호

웹페이지 로그인창에서는 아이디 `hoony6837`을 사용합니다.

## 적용

1. `supabase.sql`을 SQL Editor에서 한 번 실행
2. `npm install`
3. `npm run dev`
4. 확인 후 `npm run build`
5. 생성된 docs 폴더까지 GitHub에 업로드
