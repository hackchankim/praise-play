---
description: '완료된 작업 브랜치를 검증 후 GitHub PR을 생성하고 즉시 squash merge합니다'
allowed-tools:
  [
    'Bash(git checkout:*)',
    'Bash(git branch:*)',
    'Bash(git status:*)',
    'Bash(git log:*)',
    'Bash(git pull:*)',
    'Bash(git fetch:*)',
    'Bash(git push:*)',
    'Bash(git add:*)',
    'Bash(git commit:*)',
    'Bash(git diff:*)',
    'Bash(git merge-base:*)',
    'Bash(gh auth status:*)',
    'Bash(gh pr create:*)',
    'Bash(gh pr merge:*)',
    'Bash(gh pr view:*)',
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

완료된 작업 브랜치(`task/NNN-*`, `fix/NNN-*`, `chore/*`)를 검증한 뒤 원격에 push하고, **GitHub PR을 생성해 즉시 squash merge**한다. 로컬에서 `git merge`를 직접 수행하지 않는다 — 병합은 항상 GitHub 쪽에서 일어나고, 로컬 `main`은 그 결과를 pull해서 따라간다.

## 사용법

```
/merge
```

## 사전 요구사항

- `gh` CLI 설치 및 `gh auth status`로 로그인 확인된 상태. 미인증이면 중단하고 `gh auth login`(브라우저 인증이 필요하므로 사용자에게 `! gh auth login` 직접 실행을 안내)을 요청한다.

## 프로세스

1. 현재 브랜치를 확인한다 — `main`이면 병합할 대상이 없으므로 중단
2. `gh auth status`로 인증 상태를 확인한다 — 미인증이면 중단
3. `git status`로 미커밋 변경사항을 확인한다 — 있으면 먼저 커밋(`/commit`)할 것을 요청하고 중단
4. 검증 게이트를 실행한다. 하나라도 실패하면 진행하지 않고 무엇이 실패했는지 보고한다
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run format:check`
   - `npm run build`
5. 브랜치명이 `task/NNN-*`이면 `ROADMAP.md`에서 Task NNN 섹션을 찾아 제목과 "완료 기준"(있다면 테스트 체크리스트)을 보여주고, 실제로 충족됐는지 사용자에게 확인받는다
6. `task/NNN-*` 브랜치라면 `ROADMAP.md`의 해당 Task 줄을 ✅로 갱신하고 **현재 브랜치에** 커밋한다 (PR에 포함되어 squash 결과물에도 반영되도록)
7. `git push -u origin <브랜치>`로 브랜치를 원격에 반영한다
8. PR 제목을 브랜치 종류에 맞춰 생성한다
   - `task/NNN-*` → `Task NNN: <ROADMAP 제목>`
   - `fix/NNN-*` → `fix: <설명> (Task NNN)`
   - `chore/*` → `chore: <설명>`
9. `gh pr create --base main --head <브랜치> --title "<제목>" --body "<요약>"`으로 PR을 생성한다. 본문에는 변경 요약과 (Task 브랜치의 경우) 완료 기준 충족 여부를 적는다
10. `gh pr merge <PR번호> --squash --delete-branch`로 즉시 squash merge하고 원격 브랜치까지 삭제한다
    - CI(Task 029 이후)가 붙어 있어 필수 체크가 아직 대기 중이라 병합이 거부되면, 대신 `--auto` 플래그로 자동 병합을 예약하고 사용자에게 안내한다
11. `git checkout main && git pull`로 로컬 `main`을 squash 커밋까지 최신화한다
12. 로컬 브랜치를 정리한다 — squash merge 특성상 `git branch -d`는 "완전히 병합되지 않음"으로 거부될 수 있으므로, `git diff <브랜치> main --`으로 내용이 실제로 동일한지 확인한 뒤 `git branch -D <브랜치>`로 삭제한다
13. 결과 요약과 PR URL을 출력한다

## 안전 검사

- **검증 실패 시 진행 금지**: tsc/lint/format/build 중 하나라도 실패하면 push/PR 생성 자체를 하지 않고 실패 원인을 보고
- **미커밋 변경사항이 있으면 진행 금지**: 먼저 커밋을 완료해야 함
- **`gh` 미인증 시 중단**: 인증 없이는 PR 생성/머지 불가
- **로컬 브랜치 강제 삭제(`-D`) 전 반드시 diff로 내용 일치를 확인**: 확인 없이 삭제하지 않음
- **force push, force merge 없음**: 어떤 단계에서도 force 관련 옵션을 사용하지 않음

## 참고사항

- 병합은 항상 GitHub PR을 통해서만 일어난다 — 로컬 `git merge`는 사용하지 않는다
- `main` 히스토리는 PR당(=Task당) 커밋 1개로 유지된다 (GitHub squash merge 기본 동작)
- `/push`와의 역할 분리: `/push`는 이미 만든 커밋을 원격에 반영하는 범용 커맨드(예: `main`에 직접 커밋한 문서 변경)이고, `/merge`는 작업 브랜치를 PR로 완결짓는 전용 흐름이다. Task 브랜치 작업을 마쳤다면 `/push`가 아니라 `/merge`를 사용한다
