---
description: '원격 저장소에 안전하게 push합니다'
allowed-tools:
  [
    'Bash(git push:*)',
    'Bash(git status:*)',
    'Bash(git log:*)',
    'Bash(git branch:*)',
    'Bash(git remote:*)',
    'Bash(git diff:*)',
  ]
---

# Claude 명령어: Push

원격 저장소에 안전하게 push합니다.

## 사용법

```
/push
```

## 프로세스

1. 미커밋 변경사항 확인 및 경고
2. 원격 저장소 존재 여부 확인
3. push될 커밋 목록 미리보기
4. 안전 검사 수행
5. push 실행 및 결과 출력

## 안전 검사

- **미커밋 변경사항**: push 전 커밋 권장 경고 출력
- **main / master 브랜치**: 직접 push 시 확인 요청
- **신규 브랜치**: `-u origin <branch>` 플래그 자동 적용
- **force push**: 절대 수행하지 않음

## 실행 흐름

```
git status          # 미커밋 변경사항 확인
git remote -v       # 원격 저장소 확인
git log origin/<브랜치>..HEAD --oneline   # push 대상 커밋 미리보기
git push [-u origin <브랜치>]             # push 실행
```

## 참고사항

- 트래킹 브랜치가 없는 신규 브랜치는 `-u` 플래그로 자동 설정
- push 성공 시 PR 생성 안내 제공
- push 실패 시 오류 원인 분석 및 해결 방향 제시
- **force push는 사용자가 명시적으로 요청해도 수행하지 않음**
