---
description: '완료된 작업 브랜치를 검증 후 main으로 squash merge합니다'
allowed-tools:
  [
    'Bash(git checkout:*)',
    'Bash(git merge:*)',
    'Bash(git branch:*)',
    'Bash(git status:*)',
    'Bash(git log:*)',
    'Bash(git pull:*)',
    'Bash(git fetch:*)',
    'Bash(git add:*)',
    'Bash(git commit:*)',
    'Bash(git diff:*)',
    'Bash(npm run build:*)',
    'Bash(npm run lint:*)',
    'Bash(npm run format:check:*)',
    'Bash(npx tsc:*)',
    'Read',
    'Edit',
    'Grep',
  ]
---

# Claude 명령어: Merge

완료된 작업 브랜치(`task/NNN-*`, `fix/NNN-*`, `chore/*`)를 검증한 뒤 `main`으로 squash merge하고 정리합니다.

## 사용법

```
/merge
```

## 프로세스

1. 현재 브랜치를 확인한다 — `main`이면 병합할 대상이 없으므로 중단
2. `git status`로 미커밋 변경사항을 확인한다 — 있으면 먼저 커밋(`/commit`)할 것을 요청하고 중단
3. 검증 게이트를 실행한다. 하나라도 실패하면 병합을 진행하지 않고 무엇이 실패했는지 보고한다
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run format:check`
   - `npm run build`
4. 브랜치명이 `task/NNN-*`이면 `ROADMAP.md`에서 Task NNN 섹션을 찾아 제목과 "완료 기준"(있다면 테스트 체크리스트)을 보여주고, 실제로 충족됐는지 사용자에게 확인받는다
5. `git checkout main && git pull`로 `main`을 최신화한다
6. `git merge --squash <브랜치>`를 실행한다
7. `task/NNN-*` 브랜치라면 `ROADMAP.md`의 해당 Task 줄을 ✅로 갱신해 함께 스테이징한다
8. 커밋 메시지를 브랜치 종류에 맞춰 생성한다
   - `task/NNN-*` → `Task NNN: <ROADMAP 제목>`
   - `fix/NNN-*` → `fix: <설명> (Task NNN)`
   - `chore/*` → `chore: <설명>`
   그 후 커밋한다
9. `git branch -d <브랜치>`로 로컬 브랜치를 삭제한다
10. 원격에도 같은 이름의 브랜치가 push돼 있다면, 삭제 여부를 사용자에게 확인한 뒤 진행한다
11. 결과를 요약하고, `main`을 원격에 반영하려면 `/push`를 실행하라고 안내한다 (이 커맨드는 자동으로 push하지 않음)

## 안전 검사

- **검증 실패 시 병합 금지**: tsc/lint/format/build 중 하나라도 실패하면 병합하지 않고 실패 원인을 보고
- **미커밋 변경사항이 있으면 병합 금지**: 먼저 커밋을 완료해야 함
- **원격 push는 별도**: 이 커맨드는 로컬 병합까지만 수행하고, 원격 반영은 `/push`로 분리
- **force 관련 작업 없음**: force merge, force push 등은 절대 수행하지 않음

## 참고사항

- squash merge를 사용해 `main` 히스토리를 Task당 커밋 1개로 유지한다 (기존 컨벤션과 일치)
- 병합 전 항상 `main`을 최신 상태로 갱신한다
- 원격 브랜치 삭제는 사용자 확인이 필수다
