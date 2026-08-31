// 더미 찬양콘티(Setlist) 데이터 (Task 006).
// UI 표기는 "찬양콘티"를 쓰지만, 코드/데이터 모델상 엔티티명은 그대로 Setlist를 유지한다
// (docs/PRD.md "용어" 섹션 참고).

import type { Setlist, SetlistItem } from "@/lib/song-model/types";
import { MOCK_USER, SONG_A_ID, SONG_B_ID, SONG_C_ID } from "@/lib/song-model/mock-songs";
import {
  ARRANGEMENT_A_ID,
  ARRANGEMENT_B_ID,
  ARRANGEMENT_C_ID,
} from "@/lib/song-model/arrangement-blueprint";

// ===== 찬양콘티 =====

const SETLIST_ID = "setlist-sunday-service";

export const MOCK_SETLISTS: Setlist[] = [
  {
    id: SETLIST_ID,
    name: "주일 예배 찬양콘티",
    ownerId: MOCK_USER.id,
    createdAt: "2026-08-27T05:00:00.000Z",
  },
];

export const MOCK_SETLIST_ITEMS: SetlistItem[] = [
  {
    id: `${SETLIST_ID}-item-1`,
    setlistId: SETLIST_ID,
    songId: SONG_A_ID,
    arrangementId: ARRANGEMENT_A_ID,
    orderIndex: 0,
  },
  {
    id: `${SETLIST_ID}-item-2`,
    setlistId: SETLIST_ID,
    songId: SONG_B_ID,
    arrangementId: ARRANGEMENT_B_ID,
    orderIndex: 1,
  },
  {
    id: `${SETLIST_ID}-item-3`,
    setlistId: SETLIST_ID,
    songId: SONG_C_ID,
    arrangementId: ARRANGEMENT_C_ID,
    orderIndex: 2,
  },
];
