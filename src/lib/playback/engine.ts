// smplr(v1.0.0)를 감싸는 얇은 자체 재생 엔진 어댑터 (Task 021).
// docs/PLAN.md가 지적한 의존성 리스크(smplr은 사실상 단일 메인테이너 소규모 프로젝트)를
// 완화하려고, 앱의 나머지 부분(미리듣기 플레이어, 이후 Task 022의 실시간 재생 화면)은 이
// PlaybackEngine 클래스만 알고 smplr을 직접 import하지 않는다 — 라이브러리를 교체해야 할 때
// 이 파일 하나만 다시 쓰면 된다.
//
// AudioContext는 브라우저가 사용자 제스처 없이 생성/재생하는 것을 막는다 — 그래서 실제 로딩
// (사운드폰트 다운로드 포함)은 이 클래스 생성자가 아니라 activate()에서 일어나고, activate()는
// 반드시 클릭 핸들러 등 사용자 제스처 콜백 "안에서" 호출해야 한다(테스트 체크리스트 "사용자
// 제스처 없이 재생 시도 시 활성화 안내가 표시되는가").
import { Sequencer } from "smplr";
import type { PatternInput, Sequencer as SequencerInstance, SequencerNote } from "smplr";
import type { Instrument, InstrumentTrack, NoteEvent } from "@/lib/song-model/types";
import { INSTRUMENTS } from "@/lib/song-model/types";
import { beatsPerBar } from "@/lib/song-model/time-signature";
import { beatsToTicks, positionStringToBeats } from "@/lib/playback/beat-time";
import { toSequencerNotes } from "@/lib/playback/sequencer-notes";
import {
  getSharedAudioContext,
  loadInstrumentsCached,
  type AssetLoadEvent,
  type PooledInstrument,
} from "@/lib/playback/instrument-pool";

export type PlaybackTransportState = "stopped" | "playing" | "paused";

/**
 * activate()가 실패했을 때(제스처 거부로 AudioContext가 running이 되지 못했거나, 사운드폰트
 * 로딩이 네트워크 오류 등으로 실패한 경우 전부 포함) 던진다. UI는 원인과 무관하게 같은
 * 메시지로 재시도를 유도한다 — 어느 쪽이든 사용자가 할 수 있는 건 "다시 누르기"뿐이다.
 * cause에 원래 에러를 담아 콘솔 디버깅은 가능하게 해 둔다.
 */
export class AudioActivationError extends Error {
  constructor(cause?: unknown) {
    super("오디오를 활성화하지 못했습니다. 버튼을 다시 눌러주세요.", { cause });
    this.name = "AudioActivationError";
  }
}

const PPQ = 480;

type SmplrInstrumentInstance = PooledInstrument;

/**
 * arrangement/instruments.ts는 킷과 무관한 범용 드럼 별칭을 쓰고("실제 로드되는 킷에 따라
 * 별칭이 다를 수 있어 재생 어댑터가 최종 매핑을 책임진다"는 주석이 그쪽에 있다), 여기서
 * TR-808 킷(smpldsnds.github.io/drum-machines/TR-808/dm.json)의 실제 샘플 그룹 이름으로
 * 옮긴다. 매핑을 빠뜨리면 smplr이 에러 없이 조용히 무음 처리한다 — "hihat-closed"/"crash"가
 * 정확히 이 상태였다(라이브 재생 검증 중 네트워크 로그로 실측: 두 별칭 다 어떤 샘플 요청도
 * 발생시키지 않았다). kick/snare는 이 킷에서도 같은 이름이라 매핑이 필요 없다.
 */
const DRUM_PITCH_ALIAS: Record<string, string> = {
  "hihat-closed": "hihat-close",
  crash: "cymbal",
};

export interface PlaybackEngineOptions {
  onTransportStateChange?: (state: PlaybackTransportState) => void;
  /** 재생 중 대략 100ms 간격으로 현재 위치(절대 beat, 곡 시작 기준)를 알려준다. */
  onPositionChange?: (beat: number) => void;
  /**
   * 루프가 아닌 트랙이 끝까지 자연 재생돼 멈췄을 때 한 번 불린다. onPositionChange(0)과
   * 구분해서 둔다 — seekToBeat(0)(곡 시작으로 명시적 이동)도 onPositionChange(0)을 부르는데,
   * "자연히 끝났다"와 "0으로 이동했다"는 실시간 세션(section-jump.ts)이 다음 곡으로 자동
   * 진행할지 결정하는 서로 다른 신호라 하나로 겹치면 안 된다.
   */
  onEnd?: () => void;
  /**
   * loadQueue()로 세트리스트 전체를 하나의 smplr 패턴 체인으로 로드했을 때, 자연 진행으로(사용자
   * 조작 없이) 다음 패턴(=다음 곡)으로 넘어간 순간 호출된다(Task 023). smplr의 패턴 체인은 같은
   * 연속 오디오 클록을 유지한 채 다음 패턴으로 넘어가므로 stop()+start() 재시작 특유의
   * setInterval 첫 tick 스케줄링 catch-up 지연(node_modules/smplr 소스 + 실측 확인, ~50-75ms)이
   * 없다 — 이 콜백이 "무음 없는 곡 전환"(F009)의 핵심 신호다. 사용자가 직접 다른 곡으로
   * 점프하는 경우(jumpToSong)는 호출자가 이미 목표 songIndex를 알고 있어 이 콜백을 거치지
   * 않는다.
   */
  onSongChange?: (songIndex: number) => void;
  /**
   * 생성자에 넘긴 tracks가 쓰는 악기만이 아니라 4개 전부(피아노/기타/베이스/드럼) 로딩한다.
   * 세트리스트 여러 곡을 이어 재생하는 실시간 세션(section-jump.ts)이 loadTracks()로 곡을
   * 바꿔치기할 때, 첫 곡엔 없던 악기가 나중 곡에 등장해도 다시 activate()할 필요 없이(=사용자
   * 제스처를 또 요구하지 않고) 바로 쓸 수 있어야 하므로 켠다. 미리듣기 플레이어(단일 곡, Task
   * 021)는 필요한 악기만 받으면 되니 기본값 false.
   */
  preloadAllInstruments?: boolean;
  /**
   * activate()가 요청한 악기들을 로딩하는 동안 진행 상황을 그대로 전달한다(Task 024) —
   * instrument-pool.ts의 AssetLoadEvent를 가공 없이 넘긴다. 사전 로딩 화면이 악기별
   * 진행률/성공/실패를 보여주는 데 쓴다. 세션 캐시에 이미 있는 악기는 네트워크 요청 없이
   * 즉시 "done"으로 한 번만 온다.
   */
  onLoadProgress?: (event: AssetLoadEvent) => void;
}

const POSITION_POLL_MS = 100;

/**
 * handlePatternChange가 곡 자연 전환 시 위치 폴링을 잠깐 멈췄다가 재개할 때 쓰는 지연.
 * smplr Sequencer의 기본 lookaheadMs(200, node_modules/smplr 소스 확인)보다 확실히 길어야
 * 재개 시점에는 항상 실제 경계(restartAudioTime)를 이미 지난 뒤라 오염된 체크포인트를 다시
 * 읽지 않는다 — use-live-playback.ts의 SCHEDULE_LOOKAHEAD_MS와 같은 이유로 같은 여유폭(260)을
 * 쓴다.
 */
const POSITION_POLL_RESUME_DELAY_MS = 260;

/**
 * 곡 하나(편곡 트랙 4개)를 실제로 재생하는 어댑터. 미리듣기 플레이어(preview-player.tsx, 단일
 * 곡)와 실시간 예배 재생 화면(section-jump.ts를 통해 여러 곡을 이어 재생, Task 022) 둘 다
 * 이 클래스를 쓴다. 후자는 activate()를 한 번만 호출(=사용자 제스처도 한 번만 필요)하고, 곡이
 * 바뀔 때마다 loadTracks()로 같은 AudioContext/로드된 악기 인스턴스를 재사용하면서 Sequencer의
 * 트랙만 통째로 교체한다 — 곡마다 새 AudioContext를 만들면 매 곡 전환마다 제스처가 다시
 * 필요해지기 때문이다.
 */
export class PlaybackEngine {
  private tracks: InstrumentTrack[];
  private beatsPerBarValue: number;
  private tempoValue: number;

  private context: AudioContext | null = null;
  private sequencer: SequencerInstance | null = null;
  private instruments: Partial<Record<Instrument, SmplrInstrumentInstance>> = {};
  private positionPollId: ReturnType<typeof setInterval> | null = null;
  /** loadQueue()로 로드한 곡별 템포/박자 — patternChange 핸들러가 곡 경계에서 참조한다. */
  private queueMeta: Array<{ tempo: number; beatsPerBar: number }> = [];
  /**
   * 가장 최근 activate() 시도에서 로딩에 실패한 악기 목록(Task 024). 부분 실패해도 activate()
   * 자체는 throw하지 않고 성공한 악기만으로 Sequencer를 구성한다 — 실패한 악기를 쓰는 트랙은
   * addTracksToSequencer/buildTrackInputs가 이미 "instrument가 없으면 건너뛴다"로 조용히
   * 무음 처리하므로(기존 로직 그대로), 호출부는 이 목록을 읽어 "일부 악기 없이 진행" 안내만
   * 보여주면 된다.
   */
  private failedInstruments: Instrument[] = [];
  /**
   * dispose()가 activate() 진행 중(사운드폰트 로딩 대기 등) 호출되면, 뒤늦게 이어지는 activate()의
   * 나머지 코드가 이미 정리된 필드를 다시 채워 dispose 이후에도 "활성화된" 것처럼 되살아나고
   * 방금 만든 인스턴스들은 영영 dispose되지 않는다(code review 지적, 실제 코드 확인으로 재현
   * 가능함을 검증). activate()가 각 await 지점 이후 이 플래그를 확인해 조기 종료한다.
   */
  private disposed = false;

  constructor(
    tracks: InstrumentTrack[],
    tempo: number,
    timeSignature: string,
    private readonly options: PlaybackEngineOptions = {},
  ) {
    this.tracks = tracks;
    this.tempoValue = tempo;
    this.beatsPerBarValue = beatsPerBar(timeSignature);
  }

  get isActivated(): boolean {
    return this.sequencer !== null;
  }

  /** 가장 최근 activate()에서 로딩에 실패한 악기 목록. 비어 있으면 전부 성공한 것이다. */
  get loadFailures(): readonly Instrument[] {
    return this.failedInstruments;
  }

  /**
   * 이미 activate()된 뒤 이전에 실패했던 악기만 다시 로딩한다(Task 024, "재시도" 버튼).
   * activate() 자체를 다시 부르면 안 되는 이유: activate()의 "이미 활성화됐으면(this.context &&
   * this.sequencer) resume만 하고 재구성하지 않는다"는 가드가 부분 실패 뒤에도 그대로 걸린다
   * — 부분 실패해도 Sequencer는 이미 구성돼 있어(loadFailures 참고) isActivated가 true이므로,
   * 그 가드가 실패한 악기를 다시 시도할 기회 자체를 막아버린다(실측 재현: Playwright로 드럼
   * 로딩만 네트워크 차단 → "재시도" 클릭 → 차단을 풀어도 계속 실패 화면에 멈춰 있음 — 애초에
   * 아무 요청도 다시 나가지 않았다). 이 메서드는 그 가드를 우회해 실패했던 악기만 세션 캐시를
   * 통해 다시 로딩한다.
   *
   * 방금 성공한 악기를 쓰는 트랙이 실제로 소리 나려면 호출부가 이어서 loadTracks()나
   * loadQueue()를 다시 불러야 한다 — activate() 때 이미 "실패한 악기를 쓰는 트랙은 건너뛴다"로
   * Sequencer를 구성해 둔 상태라, 트랙을 다시 붙이는 로직을 여기서 중복 구현하지 않고 기존
   * 경로를 그대로 재사용한다.
   */
  async retryFailedInstruments(): Promise<void> {
    if (this.disposed || !this.context || this.failedInstruments.length === 0) return;
    const targets = [...this.failedInstruments];
    const { loaded, failed } = await loadInstrumentsCached(targets, this.context, (event) =>
      this.options.onLoadProgress?.(event),
    );
    // activate()가 각 await 지점 이후 disposed를 다시 확인하는 것과 같은 이유다(위 클래스
    // 필드 주석 참고) — 이 await 도중 dispose()가 먼저 실행됐다면(사용자가 로딩 중 페이지를
    // 나간 경우 등) 이미 정리된 필드(instruments={}, failedInstruments 등)를 뒤늦게 다시
    // 채워 넣으면 안 된다(code review 지적, 실제로 dispose 이후 필드가 되살아나는 것과 같은
    // 버그 클래스임을 확인).
    if (this.disposed) return;
    this.instruments = { ...this.instruments, ...loaded };
    this.failedInstruments = failed;
  }

  /** 트랙 전체(모든 악기)에서 가장 늦게 끝나는 노트 기준 총 길이(beat). 활성화 전에도 계산 가능. */
  get durationBeats(): number {
    const allNotes: NoteEvent[] = this.tracks.flatMap((track) => track.notes);
    return allNotes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0);
  }

  /**
   * 사용자 제스처 콜백 안에서 호출한다. 세션 공유 AudioContext 확보(또는 suspended 상태면
   * resume) → 트랙에 노트가 있는 악기만 사운드폰트 로딩(세션 캐시 재사용, instrument-pool.ts
   * 참고, Task 024) → Sequencer 구성까지 한 번에 끝낸다. 이미 완전히 활성화돼 있으면
   * (this.sequencer가 있으면) resume만 시도하고 재구성하지 않는다(중복 호출에 안전).
   *
   * AudioContext 확보/resume 자체가 실패하면(제스처 거부 등) AudioActivationError를 던진다.
   * 반면 악기 로딩은 개별 실패를 허용한다 — 일부 악기가 실패해도 나머지로 Sequencer를
   * 구성하고 조용히 진행한다(loadFailures로 어떤 악기가 빠졌는지 호출부가 확인할 수 있다).
   * 트랙 스케줄링(addTracksToSequencer)은 이미 "instrument가 없으면 그 트랙을 건너뛴다"로
   * 무음 처리하므로 부분 실패로 크래시하지 않는다 — ROADMAP Task 024 "부분 실패 시 진행 여부
   * 선택 안내"를 지원하려면 activate() 자체가 전부 실패해버리면 안 됐다.
   */
  async activate(): Promise<void> {
    if (this.disposed) return;

    if (this.context && this.sequencer) {
      // this.context를 지역 변수로 먼저 잡아 둔다 — 아래 await 도중 dispose()가 끼어들면
      // this.context가 null로 바뀌는데, 그 뒤에도 계속 this.context를 읽으면 의도한
      // AudioActivationError 대신 캐치되지 않은 TypeError가 던져진다(code review 지적).
      // 현재는 이 분기에 도달하는 유일한 경로(engine.isActivated가 이미 true)가 없어(모든
      // 호출부가 activate() 전 isActivated를 확인한다) 실제로 재현되지는 않지만, 이 함수
      // 나머지 전체가 지키는 "await 이후 disposed 재확인" 불변조건과 맞춰 둔다.
      const context = this.context;
      if (context.state === "suspended") await context.resume().catch(() => {});
      if (this.disposed) return;
      if (context.state !== "running") throw new AudioActivationError();
      return;
    }

    const context = getSharedAudioContext();
    try {
      if (context.state === "suspended") await context.resume().catch(() => {});
      if (this.disposed) return;
      if (context.state !== "running") throw new AudioActivationError();

      const neededInstruments = this.options.preloadAllInstruments
        ? INSTRUMENTS
        : INSTRUMENTS.filter((instrument) =>
            this.tracks.some((track) => track.instrument === instrument && track.notes.length > 0),
          );
      const { loaded, failed } = await loadInstrumentsCached(neededInstruments, context, (event) =>
        this.options.onLoadProgress?.(event),
      );
      if (this.disposed) return;

      const sequencer = Sequencer(context, {
        bpm: this.tempoValue,
        ppq: PPQ,
        timeSignature: this.beatsPerBarValue,
        loop: false,
      });
      this.addTracksToSequencer(sequencer, this.tracks, loaded);
      sequencer.on("statechange", (state: PlaybackTransportState) => {
        this.options.onTransportStateChange?.(state);
        if (state === "playing") this.startPositionPolling();
        else this.stopPositionPolling();
      });
      // 자연스럽게 끝까지 재생되면(루프가 아니므로) statechange만으로는 위치가 0으로 돌아오지
      // 않는다 — 마지막으로 폴링된, 끝 근처의 값에 진행바가 멈춰 남는다(code review 지적).
      sequencer.on("end", () => {
        this.options.onPositionChange?.(0);
        this.options.onEnd?.();
      });
      sequencer.on("patternChange", (patternIndex: number) => {
        this.handlePatternChange(patternIndex);
      });

      if (this.disposed) {
        sequencer.stop();
        return;
      }

      this.context = context;
      this.instruments = loaded;
      this.failedInstruments = failed;
      this.sequencer = sequencer;
    } catch (error) {
      throw error instanceof AudioActivationError ? error : new AudioActivationError(error);
    }
  }

  /**
   * 트랙 목록 → smplr 트랙 입력(악기 인스턴스 + 노트 + id) 변환. addTracksToSequencer(단일 곡,
   * addTrack 경로)와 loadQueue(세트리스트 전체, setPatterns 경로)가 공유한다 — 후자는 addTrack()을
   * 직접 쓸 수 없어서(setPatterns() 호출 후에는 addTrack/clearTracks가 throw한다, smplr 타입
   * 주석 확인) 같은 변환 결과를 Pattern.tracks 배열 형태 그대로 넘겨야 한다.
   */
  private buildTrackInputs(
    tracks: InstrumentTrack[],
    instruments: Partial<Record<Instrument, SmplrInstrumentInstance>>,
  ): Array<{ instrument: SmplrInstrumentInstance; notes: SequencerNote[]; id: string }> {
    const result: Array<{
      instrument: SmplrInstrumentInstance;
      notes: SequencerNote[];
      id: string;
    }> = [];
    for (const track of tracks) {
      const instrument = instruments[track.instrument];
      if (!instrument || track.notes.length === 0) continue;
      const pitchAlias = track.instrument === "drums" ? DRUM_PITCH_ALIAS : undefined;
      result.push({
        instrument,
        notes: toSequencerNotes(track.notes, PPQ, pitchAlias, track.instrument),
        id: track.instrument,
      });
    }
    return result;
  }

  /** activate()와 loadTracks() 둘 다 쓰는 "트랙 목록 → Sequencer에 addTrack" 로직. */
  private addTracksToSequencer(
    sequencer: SequencerInstance,
    tracks: InstrumentTrack[],
    instruments: Partial<Record<Instrument, SmplrInstrumentInstance>>,
  ): void {
    for (const input of this.buildTrackInputs(tracks, instruments)) {
      sequencer.addTrack(input.instrument, input.notes, { id: input.id });
    }
  }

  /**
   * setPatterns()로 로드한 체인이 smplr 자연 진행으로 다음 패턴(=다음 곡)에 들어선 순간 온다.
   * bpm/timeSignature는 Sequencer 전역 속성이라(패턴별 속성이 아니다, smplr 타입 확인) 여기서
   * 곧바로 다음 곡 값으로 갱신해야 그 곡의 노트가 올바른 템포로 스케줄된다 — 실측 확인
   * (patternChange 핸들러 안에서 bpm을 바꿔도 다음 패턴 노트 타이밍에 즉시 정확히 반영됨).
   *
   * bpm setter를 여기서 호출하면(재생 중이므로) smplr의 TransportClock이 "지금 tick 위치를 새
   * bpm으로 태깅한" 체크포인트를 즉시 주입한다(node_modules/smplr 소스의 TransportClock.set bpm
   * 확인). 그런데 patternChange는 실제 곡 경계 시각(smplr이 두 번째 인자로 주는 restartAudioTime)
   * 보다 최대 lookahead(기본 200ms)만큼 일찍 발동하고 — "end"와 달리 자체 setTimeout으로 정확한
   * 시각까지 미루지 않는다 — 뒤이어 실행되는 _flush()의 seekAt(0, restartAudioTime)이 이
   * 체크포인트를 걸러내지 못한다(그 audioTime이 아직 restartAudioTime보다 이르기 때문). 그 결과
   * [지금, 실제 경계) 구간 동안 position을 읽으면 "이전 곡의 tick을 새 곡의 템포로 해석한"
   * 의미 없는 값이 나온다(code review 지적, smplr 소스 추적으로 재현 가능함을 검증 — 노트
   * 스케줄링 자체는 seekAt이 만드는 새 체크포인트를 쓰므로 영향 없다, 오직 위치 "읽기"만 오염됨).
   * bpm을 여기서 세팅하는 것 자체는 필수다(늦추면 새 패턴의 첫 노트들이 _scheduleWindow의 같은
   * 동기 호출 안에서 옛 템포로 스케줄돼버려 더 나쁘다) — 대신 오염 구간 동안 위치를 "읽지"
   * 못하게 폴링을 잠깐 멈췄다가 smplr의 200ms lookahead를 확실히 넘는 지연 뒤에 재개한다.
   * absoluteBeat는 handleSongChange가 전환과 동시에 0으로 되돌리므로, 폴링 재개까지 화면에 새
   * 곡의 실제 위치가 조금 늦게(최대 POSITION_POLL_RESUME_DELAY_MS) 반영되는 정도는 100ms 폴링
   * 간격 자체가 이미 갖는 지연과 다르지 않다.
   */
  private handlePatternChange(patternIndex: number): void {
    const meta = this.queueMeta[patternIndex];
    if (!meta || !this.sequencer) return;
    this.tempoValue = meta.tempo;
    this.beatsPerBarValue = meta.beatsPerBar;
    this.stopPositionPolling();
    this.sequencer.bpm = meta.tempo;
    this.sequencer.timeSignature = meta.beatsPerBar;
    setTimeout(() => {
      if (this.sequencer?.state === "playing") this.startPositionPolling();
    }, POSITION_POLL_RESUME_DELAY_MS);
    this.options.onSongChange?.(patternIndex);
  }

  /**
   * 이미 activate()된 엔진에 새 곡의 트랙을 얹는다 — AudioContext와 로드된 악기 인스턴스는
   * 그대로 재사용하고(다시 다운로드하지 않음) Sequencer의 트랙만 통째로 교체한다. 세트리스트
   * 여러 곡을 이어 재생하는 실시간 세션(section-jump.ts)이 곡 전환마다 쓴다 — activate()를
   * 다시 부르면 매 곡 전환마다 사용자 제스처가 또 필요해지므로 이 메서드가 필수다.
   *
   * 아직 activate() 전(this.sequencer가 없음)이면 tracks/tempo/timeSignature만 갱신해 두고
   * 조용히 반환한다 — 다음 activate() 호출이 이 값들을 그대로 쓴다.
   */
  loadTracks(tracks: InstrumentTrack[], tempo: number, timeSignature: string): void {
    this.tracks = tracks;
    this.tempoValue = tempo;
    this.beatsPerBarValue = beatsPerBar(timeSignature);
    if (!this.sequencer) return;

    this.sequencer.stop();
    this.sequencer.clearTracks();
    this.sequencer.bpm = tempo;
    this.sequencer.timeSignature = this.beatsPerBarValue;
    this.addTracksToSequencer(this.sequencer, this.tracks, this.instruments);
  }

  /**
   * 세트리스트 전체 곡을 smplr의 다중 패턴 체인(setPatterns/chainOrder)으로 한 번에 로드한다
   * (Task 023, F009 "무음 없는 다음 곡 전환"). loadTracks()(단일 곡 교체, addTrack 기반)와
   * 달리, 곡 경계에서 자연 진행이 스스로 다음 패턴으로 이어져 stop()/start() 재시작 특유의
   * setInterval 첫 tick 스케줄링 catch-up 지연(node_modules/smplr 소스 + 실측으로 확인, 냉간
   * 시작이든 재시작이든 동일하게 ~50-75ms 발생 — 반면 패턴 체인 전환은 실측상 오차 1ms 이내로
   * 완전히 이음매 없음)이 전혀 없다.
   *
   * setPatterns() 호출 이후로는 addTrack()/clearTracks()가 throw하므로(smplr 타입 주석 확인)
   * 이 메서드를 호출한 엔진 인스턴스에는 다시 loadTracks()를 쓸 수 없다 — 실시간 세션
   * (use-live-playback.ts) 전용이고, 미리듣기 플레이어(단일 곡, loadTracks 사용)와는 별개
   * 경로다.
   *
   * activate() 이전(this.sequencer가 아직 없음)에 호출되면 곡별 템포/박자만 기록해 두고 조용히
   * 반환한다 — activate() 완료 뒤 다시 호출해야 실제 setPatterns()가 실행된다
   * (use-live-playback.ts가 activate() 성공 콜백에서 호출).
   */
  loadQueue(
    entries: Array<{
      tracks: InstrumentTrack[];
      tempo: number;
      timeSignature: string;
      /** 곡 전체(모든 섹션 합산) 길이 — 패턴의 loopEnd로 쓰인다(마지막 노트 이후의 여백 마디도
       * 포함해 섹션 정의 기준 길이를 그대로 존중한다, playback-state.ts의 songDurationSeconds와
       * 같은 계산). */
      totalBeats: number;
    }>,
  ): void {
    this.queueMeta = entries.map((entry) => ({
      tempo: entry.tempo,
      beatsPerBar: beatsPerBar(entry.timeSignature),
    }));
    if (entries.length > 0) {
      this.tempoValue = entries[0].tempo;
      this.beatsPerBarValue = this.queueMeta[0].beatsPerBar;
    }
    if (!this.sequencer) return;

    const patterns: PatternInput[] = entries.map((entry) => ({
      tracks: this.buildTrackInputs(entry.tracks, this.instruments),
      loopEnd: beatsToTicks(entry.totalBeats, PPQ),
    }));
    this.sequencer.setPatterns(patterns);
    this.sequencer.bpm = this.tempoValue;
    this.sequencer.timeSignature = this.beatsPerBarValue;
  }

  /**
   * loadQueue()로 로드한 체인에서 임의의 곡(songIndex)으로 수동 점프한다(Task 023) — 사용자가
   * 가사 피드에서 다른 곡의 줄을 탭하는 경우 등. smplr 패턴 체인은 순차 진행만 자동으로
   * 하고(_chainIndex는 private, 임의 패턴으로 바로 점프하는 공개 API가 없다 — node_modules/smplr
   * 소스 확인) chainOrder를 목표 곡부터 시작하도록 다시 잘라 낸 뒤 stop()+start()로 그 체인의
   * 처음(=목표 곡)부터 다시 시작한다. start()는 항상 chainOrder[0]부터 시작하며 그 순간
   * _chainIndex를 0으로 리셋하므로(smplr 소스 확인) 이 재구성이 필요하다.
   *
   * stop()+start()를 쓰므로 loadQueue()가 없애는 setInterval 첫 tick 지연이 여기서는 다시
   * 생긴다 — 하지만 이건 사용자가 직접 탭한 불연속 동작이라(음악이 자연스럽게 흘러가는 도중이
   * 아니다) 체감상 문제되지 않는다. ROADMAP이 요구하는 "무음 없는 전환"은 자연 진행(다음 곡으로
   * 자동으로 넘어가는) 케이스만을 가리킨다.
   *
   * shouldPlay가 false면(탭한 시점에 일시정지 상태였다면) start() 직후 바로 pause()한다 —
   * start()~pause() 사이에는 setInterval 콜백이 아직 한 번도 돌지 않으므로(동기 호출 구간) 실제
   * 소리가 나기 전에 멈춰 오디오 아티팩트가 없다(실측 확인).
   */
  jumpToSong(songIndex: number, atBeat: number, shouldPlay: boolean): void {
    if (!this.sequencer) return;
    const meta = this.queueMeta[songIndex];
    if (!meta) return;
    this.sequencer.chainOrder = this.queueMeta.map((_, index) => index).slice(songIndex);
    this.sequencer.stop();
    this.tempoValue = meta.tempo;
    this.beatsPerBarValue = meta.beatsPerBar;
    this.sequencer.bpm = meta.tempo;
    this.sequencer.timeSignature = meta.beatsPerBar;
    this.sequencer.start(beatsToTicks(atBeat, PPQ));
    if (!shouldPlay) this.sequencer.pause();
  }

  /** atBeat을 주면 그 위치부터 시작한다(곡 전환 시 목표 섹션의 시작 beat 등). 생략하면 smplr
   * 기본 동작(처음부터, 또는 일시정지에서였다면 이어서) 그대로다. */
  play(atBeat?: number): void {
    if (atBeat !== undefined) this.sequencer?.start(beatsToTicks(atBeat, PPQ));
    else this.sequencer?.start();
  }

  pause(): void {
    this.sequencer?.pause();
  }

  stop(): void {
    this.sequencer?.stop();
  }

  seekToBeat(beat: number): void {
    if (!this.sequencer) return;
    this.sequencer.position = beatsToTicks(beat, PPQ);
    // seek는 statechange를 내지 않으므로, 정지/일시정지 상태에서 스크럽했을 때도 UI가 즉시
    // 새 위치를 반영하도록 명시적으로 한 번 통지한다.
    this.options.onPositionChange?.(beat);
  }

  /** 0~1 배율. AddTrackOptions.volume(누적 velocity 배율)에 그대로 대응한다. */
  setInstrumentVolume(instrument: Instrument, volume: number): void {
    this.sequencer?.setTrackVolume(instrument, volume);
  }

  /** smplr Sequencer는 재생 중 bpm 변경도 끊김 없이 반영한다(README 확인). */
  setTempo(bpm: number): void {
    this.tempoValue = bpm;
    if (this.sequencer) this.sequencer.bpm = bpm;
  }

  get transportState(): PlaybackTransportState {
    return this.sequencer?.state ?? "stopped";
  }

  /**
   * 지금 이 순간의 정확한 위치(절대 beat). onPositionChange 콜백은 최대 100ms 지연될 수 있어,
   * "지금 위치 기준으로 다음 마디 경계를 계산"해야 하는 지연 점프 스케줄링(section-jump.ts)은
   * 폴링된 값 대신 이 게터로 직접 조회한 값을 써야 한다.
   */
  get positionBeat(): number {
    if (!this.sequencer) return 0;
    return positionStringToBeats(this.sequencer.position, PPQ, this.beatsPerBarValue);
  }

  private startPositionPolling(): void {
    this.stopPositionPolling();
    this.positionPollId = setInterval(() => {
      if (!this.sequencer) return;
      const beat = positionStringToBeats(this.sequencer.position, PPQ, this.beatsPerBarValue);
      this.options.onPositionChange?.(beat);
    }, POSITION_POLL_MS);
  }

  private stopPositionPolling(): void {
    if (this.positionPollId !== null) {
      clearInterval(this.positionPollId);
      this.positionPollId = null;
    }
  }

  /**
   * 컴포넌트 언마운트 시 반드시 호출 — 이 엔진 인스턴스의 Sequencer를 멈추고 참조를 정리한다.
   * disposed 플래그를 세워 두면 activate()가 아직 진행 중이었더라도(사운드폰트 로딩 대기 등)
   * 뒤늦게 이어지는 코드가 이 상태를 되살리지 않고 스스로 정리한다.
   *
   * AudioContext와 로드된 악기 인스턴스는 여기서 닫거나 dispose하지 않는다 — 세션 전체에서
   * 공유되는 풀 소유이기 때문이다(instrument-pool.ts, Task 024). 예전(Task 021~023)에는 이
   * 엔진이 직접 만든 전용 자원이라 여기서 닫는 게 맞았지만, 이제 닫아버리면 같은 세션 안의
   * 다른 화면(다른 세트리스트 재생, 미리듣기 등)이 처음부터 다시 다운로드해야 한다 — 이
   * 엔진이 들고 있던 "참조"만 버린다.
   */
  dispose(): void {
    this.disposed = true;
    this.stopPositionPolling();
    this.sequencer?.stop();
    this.instruments = {};
    this.sequencer = null;
    this.context = null;
  }
}
