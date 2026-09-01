// 도메인 열거형에 대한 한글 표시 라벨. 특정 화면(편곡 설정, 실시간 재생 등) 여러 곳에서
// 공통으로 쓰이므로, 어느 한 라우트 폴더에 두지 않고 여기 공유 도메인 모듈에 둔다.

import type { Instrument } from "@/lib/song-model/types";

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  piano: "피아노",
  guitar: "기타",
  bass: "베이스",
  drums: "드럼",
};
