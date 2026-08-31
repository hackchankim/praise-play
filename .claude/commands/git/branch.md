---
description: 'ROADMAP.md 브랜치 전략에 따라 새 작업 브랜치를 생성합니다'
allowed-tools:
  [
    'Bash(git checkout:*)',
    'Bash(git branch:*)',
    'Bash(git pull:*)',
    'Bash(git fetch:*)',
    'Bash(git status:*)',
    'Bash(git log:*)',
    'Read',
    'Grep',
  ]
---

# Claude 명령어: Branch

`ROADMAP.md`의 브랜치 전략에 따라 새 작업용 브랜치를 만듭니다.

## 사용법

```
/branch 003 domain-types          # Task 브랜치: task/003-domain-types
/branch fix 016 extraction-retry  # 버그 수정 브랜치: fix/016-extraction-retry
/branch chore branch-strategy     # 문서/설정 브랜치: chore/branch-strategy
```

인자를 생략하면 `ROADMAP.md`에서 아직 ✅ 표시가 없는 가장 앞선 Task를 찾아 제안한다.

## 프로세스

1. `git status`로 미커밋 변경사항 확인 — 있으면 커밋(`/commit`) 또는 스태시 여부를 먼저 확인
2. 현재 브랜치가 `main`이 아니면 `main`으로 전환
3. `git fetch origin` 후 `git pull`로 `main`을 최신 상태로 갱신
4. 인자를 해석해 브랜치 이름 결정
   - 숫자만 주어지면 `task/NNN-슬러그`
   - `fix` 접두면 `fix/NNN-슬러그`
   - `chore` 접두면 `chore/슬러그` (Task 번호 없음)
   - 슬러그가 주어지지 않으면 `ROADMAP.md`의 Task 제목에서 자동 생성
5. Task 번호가 주어진 경우 `ROADMAP.md`에서 해당 Task 섹션을 찾아 제목·완료 기준(및 테스트 체크리스트 존재 여부)을 요약해 보여줌
6. `git checkout -b <브랜치명>`으로 생성 및 전환
7. 결과와 함께 진행할 Task의 "완료 기준"을 다시 안내

## 브랜치 이름 규칙

| 종류 | 패턴 | 예시 |
|---|---|---|
| Task 작업 | `task/NNN-슬러그` | `task/003-domain-types` |
| 버그 수정 | `fix/NNN-슬러그` | `fix/016-extraction-retry` |
| 문서/설정 | `chore/슬러그` | `chore/branch-strategy-docs` |

## 참고사항

- 항상 최신 `main`에서 분기한다 (오래된 base 위에 브랜치를 만들지 않음)
- 이미 동일한 이름의 브랜치가 있으면 새로 만들지 않고 그 브랜치로 전환만 함
- Task 번호는 `ROADMAP.md`의 실제 Task ID와 반드시 일치시킴
