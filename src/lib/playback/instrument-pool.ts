// AudioContext와 디코딩된 사운드폰트 인스턴스를 세션 전체(같은 브라우저 탭 안에서 SPA
// 내비게이션을 오가는 동안)에 걸쳐 재사용하는 싱글턴 풀 (Task 024).
//
// PlaybackEngine이 매번 자기 것만 만들고 dispose()에서 닫아버리면, 세트리스트 재생 화면을
// 나갔다가 다시 들어오거나 다른 세트리스트를 열 때마다 이미 받아둔 몇 MB짜리 사운드폰트
// 샘플을 처음부터 다시 다운로드·디코딩해야 한다 — "사전 로딩"의 취지(재생 페이지 진입 직후
// 지연 없이 재생)가 재방문에서는 반쯤 무의미해진다. 모듈 스코프 상태이므로 페이지를
// 새로고침(하드 리로드)하면 당연히 사라진다 — "브라우저 세션 전체"는 그 정도 범위를 뜻한다.
//
// 실패한 로딩은 캐시에 남기지 않는다 — 남아 있으면 "재시도" 버튼을 다시 눌러도 캐시된 실패
// 프라미스가 그대로 다시 reject되어 재시도가 영원히 성공할 수 없는 상태가 된다.
import { DrumMachine, Soundfont, SplendidGrandPiano } from "smplr";
import type { Instrument } from "@/lib/song-model/types";

interface LoadProgress {
  loaded: number;
  total: number;
}

function createInstrument(
  instrument: Instrument,
  context: AudioContext,
  onLoadProgress?: (progress: LoadProgress) => void,
) {
  switch (instrument) {
    case "piano":
      return SplendidGrandPiano(context, { onLoadProgress });
    case "guitar":
      return Soundfont(context, { instrument: "acoustic_guitar_steel", onLoadProgress });
    case "bass":
      return Soundfont(context, { instrument: "electric_bass_finger", onLoadProgress });
    case "drums":
      return DrumMachine(context, { instrument: "TR-808", onLoadProgress });
  }
}

export type PooledInstrument = ReturnType<typeof createInstrument>;

let sharedContext: AudioContext | null = null;

/**
 * 없으면 만들고 있으면 재사용한다. AudioContext "생성"은 사용자 제스처 없이도 허용되지만
 * (실제로 소리를 내려면 resume()이 필요하다), 이 함수는 브라우저에서만(activate() 호출
 * 경로에서만) 불려야 한다는 전제는 그대로다 — resume() 호출 자체는 여전히 호출부의 몫이다.
 */
export function getSharedAudioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

const instrumentCache = new Map<Instrument, PooledInstrument>();
// 로딩 "중"인 프라미스도 캐시해 동시에 여러 화면(실시간 세션 + 미리듣기 등)이 같은 악기를
// 요청해도 네트워크 요청이 중복되지 않게 한다.
const loadingPromises = new Map<Instrument, Promise<PooledInstrument>>();

export interface LoadInstrumentsResult {
  loaded: Partial<Record<Instrument, PooledInstrument>>;
  failed: Instrument[];
}

/**
 * loadInstrumentsCached의 진행 신호. "progress"(로딩 중, 세부 버퍼 단위)와 "done"/"failed"
 * (그 악기 하나의 최종 확정)를 명시적으로 구분한다 — loaded===total만으로 "끝났다"고
 * 추론하면 성공/실패를 구분할 수 없고, smplr이 실패 직전까지 progress를 몇 번 불렀는지도
 * 라이브러리 내부 구현에 달려 있어 신뢰할 수 없다.
 */
export type AssetLoadEvent =
  | { instrument: Instrument; kind: "progress"; loaded: number; total: number }
  | { instrument: Instrument; kind: "done" }
  | { instrument: Instrument; kind: "failed" };

/**
 * 요청한 악기들을 세션 캐시에서 재사용하거나 새로 로드한다. 이미 캐시된 악기는 네트워크 요청
 * 없이 즉시 "done"으로 보고된다 — 실패했던 항목만 다시 시도해도 이미 성공한 항목은 다시 받지
 * 않는다(사실상 "실패 항목만 재시도"가 이 캐시 덕에 별도 로직 없이 저절로 된다).
 *
 * 개별 악기 하나가 실패해도 나머지는 계속 로딩한다(Promise.all이 아니라 각자 try/catch로
 * 감싼다) — 부분 실패 시에도 성공한 악기만으로 세션을 계속 진행할 수 있어야 한다(ROADMAP
 * Task 024 "부분 실패 시 진행 여부 선택 안내").
 */
export async function loadInstrumentsCached(
  instruments: readonly Instrument[],
  context: AudioContext,
  onAssetEvent?: (event: AssetLoadEvent) => void,
): Promise<LoadInstrumentsResult> {
  const loaded: Partial<Record<Instrument, PooledInstrument>> = {};
  const failed: Instrument[] = [];

  await Promise.all(
    instruments.map(async (instrument) => {
      const cached = instrumentCache.get(instrument);
      if (cached) {
        loaded[instrument] = cached;
        onAssetEvent?.({ instrument, kind: "done" });
        return;
      }

      let promise = loadingPromises.get(instrument);
      if (!promise) {
        promise = (async () => {
          const instance = createInstrument(instrument, context, (progress) =>
            onAssetEvent?.({ instrument, kind: "progress", ...progress }),
          );
          await instance.ready;
          return instance;
        })();
        loadingPromises.set(instrument, promise);
      }

      try {
        const instance = await promise;
        instrumentCache.set(instrument, instance);
        onAssetEvent?.({ instrument, kind: "done" });
        loaded[instrument] = instance;
      } catch {
        loadingPromises.delete(instrument);
        failed.push(instrument);
        onAssetEvent?.({ instrument, kind: "failed" });
      }
    }),
  );

  return { loaded, failed };
}
