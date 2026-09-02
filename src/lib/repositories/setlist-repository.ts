// SetlistRepository — 세트리스트 데이터 액세스 인터페이스와 Supabase 구현체 (Task 006 인터페이스, Task 013 구현체).
// 모든 메서드 시그니처는 src/lib/api/contracts.ts의 세트리스트 계약(ListSetlistsResponse,
// CreateSetlistRequest, UpdateSetlistItemsRequest, GetSetlistResponse — Task020)과 그대로 대응한다.

import type {
  CreateSetlistRequest,
  GetSetlistResponse,
  ListSetlistsResponse,
  UpdateSetlistItemsRequest,
  UpdateSetlistRequest,
} from "@/lib/api/contracts";
import type { Setlist, SetlistItem, SetlistWithItems } from "@/lib/song-model/types";
import { createId } from "@/lib/repositories/mock-utils";
import { NotFoundError } from "@/lib/repositories/errors";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

interface SetlistRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface SetlistItemRow {
  id: string;
  setlist_id: string;
  song_id: string;
  arrangement_id: string;
  order_index: number;
}

function mapSetlist(row: SetlistRow): Setlist {
  return { id: row.id, name: row.name, ownerId: row.owner_id, createdAt: row.created_at };
}

function mapSetlistItem(row: SetlistItemRow): SetlistItem {
  return {
    id: row.id,
    setlistId: row.setlist_id,
    songId: row.song_id,
    arrangementId: row.arrangement_id,
    orderIndex: row.order_index,
  };
}

function mapSetlistWithItems(
  row: SetlistRow & { setlist_items: SetlistItemRow[] },
): SetlistWithItems {
  return {
    ...mapSetlist(row),
    items: [...row.setlist_items].sort((a, b) => a.order_index - b.order_index).map(mapSetlistItem),
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

export class SupabaseSetlistRepository implements SetlistRepository {
  async list(params: ListSetlistsParams = {}): Promise<ListSetlistsResponse> {
    let query = supabaseRepositoryClient
      .from("setlists")
      .select("*")
      .order("created_at", { ascending: false });
    if (params.limit !== undefined) query = query.limit(params.limit);

    const { data, error } = await query;
    if (error) throw new Error(`찬양콘티 목록 조회 실패: ${error.message}`);
    return { setlists: (data ?? []).map(mapSetlist), nextCursor: null };
  }

  async getById(setlistId: string): Promise<GetSetlistResponse | null> {
    const { data, error } = await supabaseRepositoryClient
      .from("setlists")
      .select("*, setlist_items(*)")
      .eq("id", setlistId)
      .maybeSingle<SetlistRow & { setlist_items: SetlistItemRow[] }>();
    if (error) throw new Error(`찬양콘티 조회 실패: ${error.message}`);
    return data ? { setlist: mapSetlistWithItems(data) } : null;
  }

  async create(request: CreateSetlistRequest, ownerId: string): Promise<Setlist> {
    const { data, error } = await supabaseRepositoryClient
      .from("setlists")
      .insert({ id: createId("setlist"), name: request.name, owner_id: ownerId })
      .select()
      .single<SetlistRow>();
    if (error) throw new Error(`찬양콘티 생성 실패: ${error.message}`);
    return mapSetlist(data);
  }

  async updateName(setlistId: string, request: UpdateSetlistRequest): Promise<Setlist> {
    const { data, error } = await supabaseRepositoryClient
      .from("setlists")
      .update({ name: request.name })
      .eq("id", setlistId)
      .select()
      .maybeSingle<SetlistRow>();
    if (error) throw new Error(`찬양콘티 이름 변경 실패: ${error.message}`);
    if (!data) throw new NotFoundError("찬양콘티", setlistId);
    return mapSetlist(data);
  }

  async updateItems(
    setlistId: string,
    request: UpdateSetlistItemsRequest,
  ): Promise<GetSetlistResponse> {
    // 기존 항목 삭제와 신규 항목 삽입을 하나의 함수 호출(=하나의 트랜잭션)로 묶는다 — 따로
    // 두 번 호출하면 삭제만 성공하고 삽입이 실패했을 때 세트리스트가 통째로 비어버린다
    // (code-review 지적, save_song_correction과 동일한 이유).
    const items = request.items.map((item) => ({
      id: createId(`${setlistId}-item`),
      songId: item.songId,
      arrangementId: item.arrangementId,
      orderIndex: item.orderIndex,
    }));
    const { error } = await supabaseRepositoryClient.rpc("replace_setlist_items", {
      p_setlist_id: setlistId,
      p_items: items,
    });
    if (error) {
      if (error.code === "PT404") throw new NotFoundError("찬양콘티", setlistId);
      throw new Error(`찬양콘티 항목 저장 실패: ${error.message}`);
    }

    const result = await this.getById(setlistId);
    if (!result) throw new NotFoundError("찬양콘티", setlistId);
    return result;
  }

  async delete(setlistId: string): Promise<void> {
    const { error } = await supabaseRepositoryClient.from("setlists").delete().eq("id", setlistId);
    if (error) throw new Error(`찬양콘티 삭제 실패: ${error.message}`);
  }
}

export const setlistRepository: SetlistRepository = new SupabaseSetlistRepository();
