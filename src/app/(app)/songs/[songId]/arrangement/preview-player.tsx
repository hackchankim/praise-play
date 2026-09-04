"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Instrument, InstrumentTrack, NoteEvent } from "@/lib/song-model/types";
import { INSTRUMENT_LABEL } from "@/lib/song-model/labels";
import { AudioActivationError, PlaybackEngine } from "@/lib/playback/engine";

interface PreviewPlayerProps {
  tracks: InstrumentTrack[];
  tempo: number;
  timeSignature: string;
}

type Status = "idle" | "activating" | "ready" | "activation_failed";

function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function computeDurationBeats(tracks: InstrumentTrack[]): number {
  const allNotes: NoteEvent[] = tracks.flatMap((track) => track.notes);
  return allNotes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0);
}

/**
 * 반주 미리듣기 — smplr 어댑터(PlaybackEngine, Task 021)로 실제 오디오를 재생한다.
 * AudioContext는 브라우저 정책상 사용자 제스처 없이 만들 수 없어, 최초 재생 버튼 클릭이 곧
 * activate() 호출이다(로딩 동안 "activating" 상태로 버튼을 비활성화). activate()가
 * AudioActivationError로 실패하면(제스처로 인정받지 못한 경우, 사운드폰트 로딩 실패 등) 다시
 * 눌러달라는 안내를 보여준다 — 테스트 체크리스트 "사용자 제스처 없이 재생 시도 시 활성화
 * 안내가 표시되는가".
 *
 * PlaybackEngine은 useMemo가 아니라 useEffect 안에서 만들고 그 안의 클린업에서 dispose한다 —
 * useMemo로 만든 뒤 별도 effect에서만 dispose하면, Next.js 기본값인 React StrictMode의 개발
 * 모드 이펙트 이중 호출(mount→cleanup→remount) 때 "생성은 한 번, dispose는 cleanup 실행마다"가
 * 어긋나 실제 사용되는 엔진 인스턴스가 첫 렌더 직후 곧바로 dispose되어(activate()의 disposed
 * 가드가 늘 true) 재생 버튼이 영구히 먹통이 되는 버그가 있었다(실제 재현·수정 확인됨). 생성과
 * 정리를 같은 effect 안에 짝지어 두면 StrictMode가 그 effect를 통째로 두 번 돌려도(첫 번째
 * 인스턴스는 만들자마자 정리되고, 두 번째 인스턴스가 살아남아 정상 사용된다) 안전하다.
 *
 * 편곡(arrangement)이 바뀌면 호출부(arrangement-view.tsx)가 key={arrangement.id}로 이
 * 컴포넌트를 통째로 새로 마운트한다 — 그래서 status/playing/positionBeat/volumes는 그냥
 * 평범한 useState 초기값으로 두면 자연히 리셋된다.
 */
export function PreviewPlayer({ tracks, tempo, timeSignature }: PreviewPlayerProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [playing, setPlaying] = useState(false);
  const [positionBeat, setPositionBeat] = useState(0);
  // ref로 두는 이유: 렌더 값이 아니라 "이벤트 핸들러가 지금 이 순간 쓸 명령형 핸들"이라서다
  // (react-hooks/refs 규칙도 렌더 중 읽기만 금지할 뿐 이펙트·핸들러 안 읽기/쓰기는 허용한다).
  // useState로 두면 엔진 생성 이펙트 안에서 setState를 호출하게 되는데, 그건
  // react-hooks/set-state-in-effect 규칙에 걸린다(직접 확인함).
  const engineRef = useRef<PlaybackEngine | null>(null);

  const instruments = useMemo(
    () => tracks.filter((track) => track.notes.length > 0).map((track) => track.instrument),
    [tracks],
  );
  const [volumes, setVolumes] = useState<Partial<Record<Instrument, number>>>(() =>
    Object.fromEntries(instruments.map((instrument) => [instrument, 1])),
  );
  // handleToggle의 activate() 완료 후 볼륨 재적용 루프가 클로저에 갇힌 volumes를 읽으면,
  // 로딩 중(activate 진행 중) 사용자가 슬라이더를 조작해도 그 변경이 재적용 시 덮어써진다
  // (code review 지적) — ref로 "지금 이 순간의" 값을 항상 읽는다. 렌더 중이 아니라 커밋 후
  // 이펙트에서 갱신해야 react-hooks/refs 규칙(렌더 중 ref 쓰기 금지)에 걸리지 않는다.
  const volumesRef = useRef(volumes);
  useEffect(() => {
    volumesRef.current = volumes;
  }, [volumes]);

  useEffect(() => {
    const created = new PlaybackEngine(tracks, tempo, timeSignature, {
      onTransportStateChange: (state) => setPlaying(state === "playing"),
      onPositionChange: setPositionBeat,
    });
    engineRef.current = created;
    return () => {
      created.dispose();
      if (engineRef.current === created) engineRef.current = null;
    };
  }, [tracks, tempo, timeSignature]);

  const durationBeats = computeDurationBeats(tracks);
  const durationSeconds = tempo > 0 ? (durationBeats / tempo) * 60 : 0;
  const elapsedSeconds = tempo > 0 ? (positionBeat / tempo) * 60 : 0;
  const progressPercent = durationBeats > 0 ? (positionBeat / durationBeats) * 100 : 0;

  const handleToggle = async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (playing) {
      engine.pause();
      return;
    }

    if (!engine.isActivated) {
      setStatus("activating");
      try {
        await engine.activate();
      } catch (error) {
        setStatus(error instanceof AudioActivationError ? "activation_failed" : "idle");
        return;
      }
      // activate() 전에는 Sequencer가 없어 setInstrumentVolume 호출이 조용히 무시된다 —
      // 사용자가 재생을 누르기 전에(또는 로딩 중에) 슬라이더를 만졌을 수 있으니, 방금 만들어진
      // 트랙에 "지금" 볼륨 값을 다시 적용한다(ref라서 로딩 중 변경분까지 반영된다).
      for (const instrument of instruments) {
        engine.setInstrumentVolume(instrument, volumesRef.current[instrument] ?? 1);
      }
    }
    setStatus("ready");
    engine.play();
  };

  const handleVolumeChange = (instrument: Instrument, value: number) => {
    setVolumes((prev) => ({ ...prev, [instrument]: value }));
    engineRef.current?.setInstrumentVolume(instrument, value);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleToggle}
          disabled={durationBeats === 0 || status === "activating"}
          aria-label={playing ? "일시정지" : "미리듣기 재생"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} />
        </div>
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {formatSeconds(elapsedSeconds)} / {formatSeconds(durationSeconds)}
        </span>
      </div>
      {status === "activating" && (
        <p className="text-xs text-muted-foreground">오디오를 불러오는 중...</p>
      )}
      {status === "activation_failed" && (
        <p className="text-xs text-destructive">
          오디오를 활성화하지 못했습니다. 재생 버튼을 다시 눌러주세요.
        </p>
      )}
      {instruments.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
          {instruments.map((instrument) => (
            <label key={instrument} className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-muted-foreground">
                {INSTRUMENT_LABEL[instrument]}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumes[instrument] ?? 1}
                onChange={(e) => handleVolumeChange(instrument, Number(e.target.value))}
                aria-label={`${INSTRUMENT_LABEL[instrument]} 볼륨`}
                className="h-1 w-full accent-primary"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
