"use client";

// 실시간 예배 재생의 오디오 오케스트레이션 훅 (Task 022). play-view.tsx가 세트리스트 전체 곡의
// SongTree+편곡 트랙을 로드해 넘겨주면, 이 훅이 PlaybackEngine 하나(세션 전체에서 재사용,
// engine.ts의 loadTracks() 참고 — 곡마다 새 AudioContext를 만들면 매 곡 전환마다 사용자 제스처가
// 다시 필요해진다)와 DelayedJumpScheduler로 "다음 마디 경계에서만 전환"을 구현한다.
//
// 예약(pending)·구간 반복(loop) 둘 다 "언젠가 될 오디오 동작"을 하나의 DelayedJumpScheduler
// 인스턴스로 공유한다 — 사용자가 다른 섹션을 탭하면 그 순간 진행 중이던 반복 예약이든 이전
// 점프 예약이든 자동으로 취소되고 새 예약으로 교체돼야 하는데, 타이머가 하나뿐이면 schedule()
// 호출 자체가 그 교체를 보장한다(둘 다 동시에 유효할 수 없는 상태이기도 하다 — 반복 중이면
// pending은 항상 null, pending이 있으면 반복 예약은 항상 취소돼 있다).
import { useEffect, useRef, useState } from "react";
import { PlaybackEngine } from "@/lib/playback/engine";
import {
  DelayedJumpScheduler,
  nextBarBoundaryBeat,
  secondsUntilBeat,
} from "@/lib/playback/section-jump";
import { beatsPerBar } from "@/lib/song-model/time-signature";
import type { InstrumentTrack } from "@/lib/song-model/types";
import {
  createInitialPlaybackState,
  sectionIndexAtBeat,
  type PlaybackState,
  type QueueEntry,
} from "./playback-state";

export type ActivationStatus = "idle" | "activating" | "failed";

export interface UseLivePlaybackResult {
  state: PlaybackState;
  activationStatus: ActivationStatus;
  /**
   * 재생/일시정지 겸용. 사용자 제스처 콜백 안에서 호출해야 한다 — 처음 호출될 때(또는 이전
   * activate 실패 후) AudioContext 활성화까지 함께 처리하고, 성공하면 처음부터 재생을 시작한다.
   */
  togglePlay: () => void;
  toggleLoop: () => void;
  /**
   * targetBeat을 생략하면 섹션 시작으로 이동한다(기존 "섹션 탭" 동작). 값을 주면 그 절대
   * beat로 이동한다 — 줄(line) 단위 점프가 이 경로를 재사용한다("섹션보다 세밀한 단위의 동일
   * 메커니즘", ROADMAP Task 022).
   */
  jumpTo: (songIndex: number, sectionIndex: number, targetBeat?: number) => void;
  cancelPending: () => void;
}

/**
 * setTimeout은 지정한 지연보다 "늦게" 발동할 수는 있어도 "일찍" 발동하지는 않는다 — 반면 실제
 * 오디오는 하드웨어 시계로 정확히 흘러간다. 그래서 마디 경계 정각에 딱 맞춰 지연 시간을
 * 계산하면(margin 0), 메인 스레드가 아주 잠깐만 밀려도 오디오가 그 경계를 이미 넘어선 뒤에야
 * 우리 콜백이 실행되는 경우가 생긴다 — 그 사이 100ms 위치 폴링(handlePositionChange)이 먼저
 * "자연스럽게 다음 섹션으로 넘어갔다"고 판단해버려, 원래 예약했던 점프/반복이 자연 진행에게
 * 가로채인다(실측 재현: 구간 반복이 몇 바퀴 잘 돌다가 어느 순간 조용히 다음 섹션으로 새어
 * 나갔다). 이 margin만큼 일찍 발동시켜 그 경쟁 자체를 없앤다 — ROADMAP이 명시한 "예약된 노트
 * 잔향 처리: lookahead 창(약 100~150ms)"과 같은 여유폭이다.
 */
const SCHEDULE_LOOKAHEAD_MS = 120;

/**
 * queue/tracksByIndex는 play-view.tsx가 세트리스트 로딩 완료 시 한 번만 set하고 이후 절대
 * 바꾸지 않는다는 계약을 전제한다(정확히 play-view.tsx의 기존 queueRef 주석과 같은 전제). 이
 * 훅 내부의 엔진 생성 이펙트·콜백들이 이 배열들을 클로저로 직접 캡처하는 이유다 — 매 렌더
 * 새로 만들어지는 참조였다면 엔진을 곡마다 다시 만들어야 했을 것이다.
 */
export function useLivePlayback(
  queue: QueueEntry[],
  tracksByIndex: InstrumentTrack[][],
): UseLivePlaybackResult {
  const [state, setState] = useState<PlaybackState>(createInitialPlaybackState);
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>("idle");

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const schedulerRef = useRef(new DelayedJumpScheduler());
  // 마지막으로 "이 섹션에 진입했다"고 확정한 인덱스. handlePositionChange가 폴링마다 다시
  // 계산하는 sectionIndexAtBeat 결과와 비교해 "섹션이 막 바뀌었는가"를 판정하는 기준값이다.
  const lastSectionIndexRef = useRef(-1);

  /** 다른 곡으로 전환(loadTracks 필요) 또는 같은 곡 안에서의 seek를 실제로 실행하고 상태를 확정한다. */
  const commitJump = (
    songIndex: number,
    sectionIndex: number,
    targetBeat: number,
    forcePlay?: boolean,
  ) => {
    const engine = engineRef.current;
    const shouldPlay = forcePlay ?? stateRef.current.isPlaying;
    if (songIndex !== stateRef.current.songIndex) {
      const entry = queue[songIndex];
      engine?.loadTracks(
        tracksByIndex[songIndex] ?? [],
        entry.song.tempo,
        entry.song.timeSignature,
      );
      if (shouldPlay) engine?.play(targetBeat);
      else engine?.seekToBeat(targetBeat);
    } else {
      engine?.seekToBeat(targetBeat);
    }
    lastSectionIndexRef.current = sectionIndex;
    schedulerRef.current.cancel();
    setState((prev) => ({ ...prev, songIndex, absoluteBeat: targetBeat, pending: null }));
  };

  /** 구간 반복이 켜져 있으면 지금 섹션이 끝나는 시점(마다 SCHEDULE_LOOKAHEAD_MS만큼 일찍)에
   * 섹션 시작으로 되돌아가도록 예약하고, 발동될 때마다 스스로 다음 바퀴를 재예약한다. 반복이
   * 꺼져 있으면 취소한다.
   *
   * pending이 떠 있을 때는 취소도 하지 않고 그냥 아무것도 하지 않는다 — 이 함수가
   * handlePositionChange(자연 위치 폴링)에서도 호출되는데, pending의 커밋 타이머가 아직
   * 발동 전이어도(다음 마디 경계까지) 자연 폴링이 "섹션이 바뀌었다"고 먼저 감지해버릴 수 있다
   * (SCHEDULE_LOOKAHEAD_MS 마진을 초과하는 백그라운드 탭 스로틀링 등). 그때 스케줄러를
   * cancel()해버리면 pending 전용 이펙트가 걸어둔 커밋 타이머 자체가 지워져, 배지만 "다음
   * 마디에서 전환 예정"으로 영원히 남고 실제 전환은 일어나지 않는다(code review 지적, 재현
   * 가능함을 코드로 확인). pending을 정리하는 건 오직 그 커밋 자체(commitJump)나
   * cancelPending의 몫이다. */
  const armLoopIfNeeded = (songIndex: number, sectionIndex: number) => {
    if (stateRef.current.pending) return;
    if (!stateRef.current.loopSection) {
      schedulerRef.current.cancel();
      return;
    }
    const song = queue[songIndex].song;
    const section = song.sections[sectionIndex];
    if (!section) return;
    const sectionEndBeat = section.startBeat + section.lengthBeats;
    const currentBeat = engineRef.current?.positionBeat ?? stateRef.current.absoluteBeat;
    const delayMs = secondsUntilBeat(sectionEndBeat, currentBeat, song.tempo) * 1000;
    schedulerRef.current.schedule(delayMs - SCHEDULE_LOOKAHEAD_MS, () => {
      engineRef.current?.seekToBeat(section.startBeat);
      setState((prev) => ({ ...prev, absoluteBeat: section.startBeat }));
      armLoopIfNeeded(songIndex, sectionIndex);
    });
  };

  const handlePositionChange = (absoluteBeat: number) => {
    const songIndex = stateRef.current.songIndex;
    const song = queue[songIndex].song;
    const sectionIndex = sectionIndexAtBeat(song.sections, absoluteBeat);
    if (sectionIndex !== lastSectionIndexRef.current) {
      lastSectionIndexRef.current = sectionIndex;
      armLoopIfNeeded(songIndex, sectionIndex);
    }
    setState((prev) => ({ ...prev, absoluteBeat }));
  };

  const handleSongEnd = () => {
    // pending이 있다면 그 목표로 이미 커밋됐어야 정상이라(예약된 마디 경계는 항상 섹션 끝 이내로
    // clamp된다, jumpTo 참고) 여기 도달했다는 건 pending이 없다는 뜻이지만, 방어적으로 한 번 더
    // 확인한다 — 있다면 그쪽 로직에 맡기고 아무것도 하지 않는다.
    if (stateRef.current.pending) return;
    const nextSongIndex = stateRef.current.songIndex + 1;
    if (nextSongIndex >= queue.length) {
      setState((prev) => ({ ...prev, ended: true }));
      return;
    }
    // smplr의 "end" 이벤트는 자기 자신의 setTimeout 콜백 안에서 _emit("end") 다음 줄에
    // _emit("statechange", "stopped")를 한 번 더 무조건 내보낸다(node_modules/smplr 소스로
    // 확인). commitJump가 여기서 즉시 loadTracks()+play()를 부르면(=같은 Sequencer 인스턴스를
    // "end" 콜백 안에서 재진입 변경) 다음 곡이 막 재생을 시작한 "직후"에 그 뒤이은 무조건적인
    // "stopped" 이벤트가 뒤따라와 방금 세운 "playing" 상태를 덮어써 버린다(실측 재현: 다음 곡
    // 전환 직후 오디오는 실제로 재생 중인데 UI만 일시정지로 보임, 이후 몇 초 만에 그 다음 곡까지
    // 잘못 이어서 넘어감). smplr의 end 콜백이 완전히 끝난 뒤(새 매크로태스크)로 미루면 그 뒤이은
    // 이벤트가 우리가 손대기 전에 먼저 정리되어 재진입이 사라진다.
    setTimeout(() => {
      // 이 한 틱을 미루는 사이(위 주석) 사용자가 직접 다른 목표로 점프를 탭했다면(pending이
      // 새로 생겼다면) 그 명시적 선택이 "다음 곡 자동 진행"보다 우선한다 — 여기서 그냥
      // commitJump를 강행하면 사용자가 방금 고른 목표를 조용히 덮어써버린다(code review 지적).
      if (stateRef.current.pending) return;
      commitJump(nextSongIndex, 0, 0, true);
    }, 0);
  };

  useEffect(() => {
    if (queue.length === 0) return;
    const firstEntry = queue[0];
    const engine = new PlaybackEngine(
      tracksByIndex[0] ?? [],
      firstEntry.song.tempo,
      firstEntry.song.timeSignature,
      {
        preloadAllInstruments: true,
        onTransportStateChange: (transportState) => {
          setState((prev) => ({ ...prev, isPlaying: transportState === "playing" }));
        },
        onPositionChange: handlePositionChange,
        onEnd: handleSongEnd,
      },
    );
    engineRef.current = engine;
    const scheduler = schedulerRef.current;
    return () => {
      scheduler.cancel();
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // queue/tracksByIndex를 deps로 써서 "빈 배열 → 로드 완료" 전환 시 정확히 한 번 실행되게
    // 한다(play-view.tsx가 로딩 중엔 []을 넘기다가 로드 완료 시 새 참조로 교체하는 게 바로 이
    // 재실행을 트리거하는 신호다). 그 이후로는 두 값이 다시 바뀌지 않는다는 계약이라(훅
    // docstring 참고) 엔진이 두 번 만들어지지 않는다. handlePositionChange/handleSongEnd는 매
    // 렌더 새로 만들어지는 클로저라 deps에 넣으면 이 효과가 계속 재실행돼(=엔진을 계속 새로
    // 만들어) 버리므로 의도적으로 뺐다 — 이 효과가 실행되는 "그 순간"의 최신
    // queue/tracksByIndex를 이미 캡처하고 있어 문제없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, tracksByIndex]);

  // 사용자가 다른 섹션을 탭해 pending이 새로 생기면(또는 취소되면) 실제 지연 점프를 예약한다.
  // 여기를 jumpTo() 안에서 직접 하지 않고 이펙트로 분리한 이유: pending 값(오브젝트 참조) 자체가
  // "예약해야 한다"는 신호이자 정리 대상이라, cleanup 함수 하나로 "새 예약이 이전 예약을
  // 대체한다/pending이 null이 되면 예약을 취소한다"를 동시에 표현할 수 있어서다.
  useEffect(() => {
    const pending = state.pending;
    if (!pending) return;
    const song = queue[state.songIndex].song;
    const section = song.sections[lastSectionIndexRef.current];
    if (!section) return;
    const currentBeat = engineRef.current?.positionBeat ?? state.absoluteBeat;
    const beatsPerBarValue = beatsPerBar(song.timeSignature);
    const boundaryBeat = nextBarBoundaryBeat(currentBeat, section.startBeat, beatsPerBarValue);
    // 예약된 경계가 섹션이 자연히 끝나는 지점보다 늦으면(섹션 길이가 마디 배수가 아닌 경우)
    // 섹션 끝에서 커밋한다 — 그렇지 않으면 이미 다음 섹션 노트가 울리기 시작한 뒤에야 점프하게 된다.
    const sectionEndBeat = section.startBeat + section.lengthBeats;
    const commitBeat = Math.min(boundaryBeat, sectionEndBeat);
    const delayMs = secondsUntilBeat(commitBeat, currentBeat, song.tempo) * 1000;

    const scheduler = schedulerRef.current;
    scheduler.schedule(delayMs - SCHEDULE_LOOKAHEAD_MS, () => {
      // forcePlay: true — pending은 jumpTo가 "재생 중일 때만" 만든다(재생 중이 아니면 즉시
      // 커밋하지 예약하지 않는다). 그런데 이 콜백이 발동하는 시점의 stateRef.current.isPlaying은
      // 더 이상 신뢰할 수 없다 — 그 사이 곡이 자연히 끝나 정지됐을 수 있다(예: 같은 곡 안의
      // pending이 막 예약된 직후 그 곡의 마지막 섹션이 자연 종료되는 경우). commitJump가
      // forcePlay 없이 그 시점의 (이미 false로 떨어진) isPlaying을 참조하면 목표 지점으로
      // seek만 하고 재생은 재개하지 않아 일시정지 상태로 멈춰버린다(code review 지적, 재현
      // 가능함을 코드로 확인) — pending을 만든 시점의 "재생 중이었다"는 의도를 그대로 강제한다.
      commitJump(pending.songIndex, pending.sectionIndex, pending.targetBeat, true);
    });
    return () => scheduler.cancel();
    // queue는 안정적 참조(위 훅 docstring), commitJump는 stateRef/engineRef만 읽어 재생성돼도 동작은 같다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pending]);

  /**
   * 재생/일시정지를 겸한다. 아직 activate() 전(첫 재생, 또는 이전 activate 실패 후 재시도)이면
   * 활성화부터 하고 성공 시 처음부터 재생한다 — "예배 시작" 버튼과 화면의 재생 버튼이 동일한
   * togglePlay를 쓰므로 별도의 activate() 진입점을 앱 쪽에 노출할 필요가 없다.
   */
  const togglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (stateRef.current.isPlaying) {
      engine.pause();
      return;
    }
    if (!engine.isActivated) {
      setActivationStatus("activating");
      engine.activate().then(
        () => {
          setActivationStatus("idle");
          // activate()가 진행되는 동안(또는 이전 activate 실패 후 재시도를 기다리는 동안)
          // 사용자가 다른 곡/섹션을 탭했을 수 있다 — 그 탭은 engine이 아직 활성화 전이라
          // seekToBeat/loadTracks가 조용히 무시되지만(engine.ts), React state(songIndex/
          // absoluteBeat)는 정상적으로 그 목표를 반영해 둔 상태다. 여기서 무조건 beat 0부터
          // 재생하면 그 선택을 조용히 무시하게 된다(code review 지적, 재현 가능함을 코드로
          // 확인) — 지금 state가 가리키는 지점부터 이어서 재생한다.
          const { songIndex, absoluteBeat } = stateRef.current;
          if (songIndex !== 0) {
            const entry = queue[songIndex];
            engine.loadTracks(
              tracksByIndex[songIndex] ?? [],
              entry.song.tempo,
              entry.song.timeSignature,
            );
          }
          engine.play(absoluteBeat);
        },
        () => setActivationStatus("failed"),
      );
      return;
    }
    engine.play();
  };

  const toggleLoop = () => {
    setState((prev) => {
      const loopSection = !prev.loopSection;
      return { ...prev, loopSection };
    });
  };

  // loopSection 토글 자체(또는 그 토글이 pending 예약과 상호작용하는 상황)에 반응해 반복 예약을
  // 다시 걸거나 취소한다. handlePositionChange는 "섹션이 바뀐 시점"에만 armLoopIfNeeded를
  // 부르므로, 같은 섹션 안에서 토글이 눌린 경우는 이 이펙트가 담당해야 한다.
  useEffect(() => {
    if (state.pending) return; // pending 이펙트가 이미 스케줄러를 점유 중 — 여기서 손대지 않는다
    armLoopIfNeeded(state.songIndex, lastSectionIndexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- armLoopIfNeeded는 stateRef/engineRef/queue(안정적)만 읽는다
  }, [state.loopSection, state.pending, state.songIndex]);

  const jumpTo = (songIndex: number, sectionIndex: number, targetBeat?: number) => {
    if (
      songIndex === stateRef.current.songIndex &&
      sectionIndex === lastSectionIndexRef.current &&
      targetBeat === undefined
    ) {
      return; // 지금 재생 중인 섹션을 다시 탭한 경우 무시(다음 마디에서 처음부터 재시작되는 것을 방지)
    }
    const section = queue[songIndex]?.song.sections[sectionIndex];
    if (!section) return;
    const resolvedTargetBeat = targetBeat ?? section.startBeat;

    if (!stateRef.current.isPlaying) {
      commitJump(songIndex, sectionIndex, resolvedTargetBeat, false);
      return;
    }
    setState((prev) => ({
      ...prev,
      pending: { songIndex, sectionIndex, targetBeat: resolvedTargetBeat },
    }));
  };

  const cancelPending = () => {
    setState((prev) => ({ ...prev, pending: null }));
  };

  return { state, activationStatus, togglePlay, toggleLoop, jumpTo, cancelPending };
}
