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
import { DrumMachine, Sequencer, Soundfont, SplendidGrandPiano } from "smplr";
import type { Sequencer as SequencerInstance } from "smplr";
import type { Instrument, InstrumentTrack, NoteEvent } from "@/lib/song-model/types";
import { INSTRUMENTS } from "@/lib/song-model/types";
import { beatsPerBar } from "@/lib/song-model/time-signature";
import { beatsToTicks, positionStringToBeats } from "@/lib/playback/beat-time";
import { toSequencerNotes } from "@/lib/playback/sequencer-notes";

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

// Instrument("piano"/"guitar"/"bass"/"drums")마다 어떤 smplr 악기를 쓸지 매핑. 기타/베이스는
// smplr에 전용 샘플 악기가 없어(SplendidGrandPiano/DrumMachine만 전용) General MIDI
// Soundfont의 표준 악기 이름을 쓴다 — 실제 이름은 node_modules/smplr 번들에서 확인했다.
function createInstrument(instrument: Instrument, context: AudioContext) {
  switch (instrument) {
    case "piano":
      return SplendidGrandPiano(context);
    case "guitar":
      return Soundfont(context, { instrument: "acoustic_guitar_steel" });
    case "bass":
      return Soundfont(context, { instrument: "electric_bass_finger" });
    case "drums":
      return DrumMachine(context, { instrument: "TR-808" });
  }
}

type SmplrInstrumentInstance = ReturnType<typeof createInstrument>;

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
}

const POSITION_POLL_MS = 100;

/**
 * 곡 하나(편곡 트랙 4개)를 실제로 재생하는 어댑터. 미리듣기 플레이어(preview-player.tsx)가
 * 유일한 소비처다 — 실시간 예배 재생 화면(Task 022)은 여기에 마디 경계 지연 점프를 얹은
 * 별도 래퍼를 쓴다(section-jump.ts, 아직 미구현).
 */
export class PlaybackEngine {
  private readonly tracks: InstrumentTrack[];
  private readonly beatsPerBarValue: number;
  private tempoValue: number;

  private context: AudioContext | null = null;
  private sequencer: SequencerInstance | null = null;
  private instruments: Partial<Record<Instrument, SmplrInstrumentInstance>> = {};
  private positionPollId: ReturnType<typeof setInterval> | null = null;
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

  /** 트랙 전체(모든 악기)에서 가장 늦게 끝나는 노트 기준 총 길이(beat). 활성화 전에도 계산 가능. */
  get durationBeats(): number {
    const allNotes: NoteEvent[] = this.tracks.flatMap((track) => track.notes);
    return allNotes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0);
  }

  /**
   * 사용자 제스처 콜백 안에서 호출한다. AudioContext 생성(또는 suspended 상태면 resume) →
   * 트랙에 노트가 있는 악기만 사운드폰트 로딩 → Sequencer 구성까지 한 번에 끝낸다. 이미
   * 완전히 활성화돼 있으면(this.sequencer가 있으면) resume만 시도하고 재구성하지 않는다
   * (중복 호출에 안전).
   *
   * 실패하면(제스처 거부, 네트워크 오류로 사운드폰트 로딩 실패 등) 부분적으로 만든 자원을
   * 전부 정리하고 AudioActivationError를 던진다 — this.context/this.sequencer를 어중간하게
   * 채운 채로 남기면, 이 엔진은 이미 "활성화됨"으로 보여 재시도가 조용히 무시되는(아무 소리도
   * 안 나는데 에러도 없는) 영구 먹통 상태가 된다(code review 지적, 코드 확인으로 재현 가능함을
   * 검증).
   */
  async activate(): Promise<void> {
    if (this.disposed) return;

    if (this.context && this.sequencer) {
      if (this.context.state === "suspended") await this.context.resume().catch(() => {});
      if (this.context.state !== "running") throw new AudioActivationError();
      return;
    }

    const context = new AudioContext();
    const loadedInstruments: SmplrInstrumentInstance[] = [];
    try {
      if (context.state === "suspended") await context.resume().catch(() => {});
      if (this.disposed) return this.abandonAndClose(context, loadedInstruments);
      if (context.state !== "running") throw new AudioActivationError();

      const neededInstruments = INSTRUMENTS.filter((instrument) =>
        this.tracks.some((track) => track.instrument === instrument && track.notes.length > 0),
      );
      const loaded = await Promise.all(
        neededInstruments.map(async (instrument) => {
          const instance = createInstrument(instrument, context);
          loadedInstruments.push(instance);
          await instance.ready;
          return [instrument, instance] as const;
        }),
      );
      if (this.disposed) return this.abandonAndClose(context, loadedInstruments);

      const sequencer = Sequencer(context, {
        bpm: this.tempoValue,
        ppq: PPQ,
        timeSignature: this.beatsPerBarValue,
        loop: false,
      });
      for (const track of this.tracks) {
        const instrument = loaded.find(([name]) => name === track.instrument)?.[1];
        if (!instrument || track.notes.length === 0) continue;
        const pitchAlias = track.instrument === "drums" ? DRUM_PITCH_ALIAS : undefined;
        sequencer.addTrack(
          instrument,
          toSequencerNotes(track.notes, PPQ, pitchAlias, track.instrument),
          {
            id: track.instrument,
          },
        );
      }
      sequencer.on("statechange", (state: PlaybackTransportState) => {
        this.options.onTransportStateChange?.(state);
        if (state === "playing") this.startPositionPolling();
        else this.stopPositionPolling();
      });
      // 자연스럽게 끝까지 재생되면(루프가 아니므로) statechange만으로는 위치가 0으로 돌아오지
      // 않는다 — 마지막으로 폴링된, 끝 근처의 값에 진행바가 멈춰 남는다(code review 지적).
      sequencer.on("end", () => this.options.onPositionChange?.(0));

      if (this.disposed) return this.abandonAndClose(context, loadedInstruments, sequencer);

      this.context = context;
      this.instruments = Object.fromEntries(loaded);
      this.sequencer = sequencer;
    } catch (error) {
      for (const instance of loadedInstruments) instance.dispose();
      await context.close().catch(() => {});
      throw error instanceof AudioActivationError ? error : new AudioActivationError(error);
    }
  }

  /** activate() 도중 dispose()가 먼저 실행된 경우, 방금 로드한 것들을 되살리지 않고 정리한다. */
  private abandonAndClose(
    context: AudioContext,
    instruments: SmplrInstrumentInstance[],
    sequencer?: SequencerInstance,
  ): void {
    sequencer?.stop();
    for (const instance of instruments) instance.dispose();
    void context.close();
  }

  play(): void {
    this.sequencer?.start();
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
   * 컴포넌트 언마운트 시 반드시 호출 — AudioContext를 닫지 않으면 브라우저 오디오 리소스가
   * 샌다. disposed 플래그를 세워 두면 activate()가 아직 진행 중이었더라도(사운드폰트 로딩
   * 대기 등) 뒤늦게 이어지는 코드가 이 상태를 되살리지 않고 스스로 정리한다.
   */
  dispose(): void {
    this.disposed = true;
    this.stopPositionPolling();
    this.sequencer?.stop();
    for (const instrument of Object.values(this.instruments)) instrument?.dispose();
    this.instruments = {};
    this.sequencer = null;
    void this.context?.close();
    this.context = null;
  }
}
