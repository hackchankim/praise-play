// SetlistRepository — 세트리스트 데이터 액세스 인터페이스와 목 구현체 (Task 006).
// 모든 메서드 시그니처는 src/lib/api/contracts.ts의 세트리스트 계약(ListSetlistsResponse,
// CreateSetlistRequest, UpdateSetlistItemsRequest, GetSetlistResponse — Task020)과 그대로 대응한다.

import type {
  CreateSetlistRequest,
  GetSetlistResponse,
  ListSetlistsResponse,
  UpdateSetlistItemsRequest,
  UpdateSetlistRequest,
} from "@/lib/api/contracts";
import { MOCK_SETLIST_ITEMS, MOCK_SETLISTS } from "@/lib/song-model/mock-setlists";
import type { Setlist, SetlistItem, SetlistWithItems } from "@/lib/song-model/types";
import { createId, delay } from "@/lib/repositories/mock-utils";
import { NotFoundError } from "@/lib/repositories/errors";

let setlists: Setlist[] = [...MOCK_SETLISTS];
let setlistItems: SetlistItem[] = [...MOCK_SETLIST_ITEMS];

function assemble(setlist: Setlist): SetlistWithItems {
  return {
    ...setlist,
    items: setlistItems
      .filter((item) => item.setlistId === setlist.id)
      .sort((a, b) => a.orderIndex - b.orderIndex),
  };
}

export interface ListSetlistsParams {
  cursor?: string | null;
  limit?: number;
}

export interface SetlistRepository {
  list(params?: ListSetlistsParams): Promise<ListSetlistsResponse>;
  getById(setlistId: string): Promise<GetSetlistResponse | null>;
  create(request: CreateSetlistRequest, ownerId: string): Promise<Setlist>;
  /** 세트리스트 이름 변경 */
  updateName(setlistId: string, request: UpdateSetlistRequest): Promise<Setlist>;
  /**
   * 세트리스트 항목 전체 교체. UpdateSetlistItemsRequest 계약 자체가 id 없이 곡/편곡/순서
   * 배열 전체를 받는 형태라, 추가·제거·순서변경을 모두 이 단일 메서드로 표현한다.
   */
  updateItems(setlistId: string, request: UpdateSetlistItemsRequest): Promise<GetSetlistResponse>;
  delete(setlistId: string): Promise<void>;
}

export class MockSetlistRepository implements SetlistRepository {
  async list(params: ListSetlistsParams = {}): Promise<ListSetlistsResponse> {
    await delay();
    const sorted = [...setlists].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = params.limit ?? sorted.length;
    return { setlists: sorted.slice(0, limit), nextCursor: null };
  }

  async getById(setlistId: string): Promise<GetSetlistResponse | null> {
    await delay();
    const found = setlists.find((s) => s.id === setlistId);
    return found ? { setlist: assemble(found) } : null;
  }

  async create(request: CreateSetlistRequest, ownerId: string): Promise<Setlist> {
    await delay(200);
    const newSetlist: Setlist = {
      id: createId("setlist"),
      name: request.name,
      ownerId,
      createdAt: new Date().toISOString(),
    };
    setlists = [...setlists, newSetlist];
    return newSetlist;
  }

  async updateName(setlistId: string, request: UpdateSetlistRequest): Promise<Setlist> {
    await delay(200);
    const target = setlists.find((s) => s.id === setlistId);
    if (!target) {
      throw new NotFoundError("찬양콘티", setlistId);
    }
    const updated: Setlist = { ...target, name: request.name };
    setlists = setlists.map((s) => (s.id === setlistId ? updated : s));
    return updated;
  }

  async updateItems(
    setlistId: string,
    request: UpdateSetlistItemsRequest,
  ): Promise<GetSetlistResponse> {
    await delay(300);
    const target = setlists.find((s) => s.id === setlistId);
    if (!target) {
      throw new NotFoundError("찬양콘티", setlistId);
    }

    const newItems: SetlistItem[] = request.items.map((item) => ({
      id: createId(`${setlistId}-item`),
      setlistId,
      songId: item.songId,
      arrangementId: item.arrangementId,
      orderIndex: item.orderIndex,
    }));
    setlistItems = [...setlistItems.filter((i) => i.setlistId !== setlistId), ...newItems];

    return { setlist: assemble(target) };
  }

  async delete(setlistId: string): Promise<void> {
    await delay(200);
    setlistItems = setlistItems.filter((i) => i.setlistId !== setlistId);
    setlists = setlists.filter((s) => s.id !== setlistId);
  }
}

export const setlistRepository: SetlistRepository = new MockSetlistRepository();
