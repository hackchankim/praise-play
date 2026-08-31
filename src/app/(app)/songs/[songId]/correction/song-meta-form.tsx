"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditableSong } from "./correction-types";

interface SongMetaFormProps {
  song: EditableSong;
  onChange: (patch: Partial<EditableSong>) => void;
}

/** 곡 메타 확정 폼 — 키(조표) / 템포(BPM) / 박자표 */
export function SongMetaForm({ song, onChange }: SongMetaFormProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-key">키(조표)</Label>
        <Input
          id="song-key"
          value={song.key}
          onChange={(e) => onChange({ key: e.target.value })}
          placeholder="예: G, Bm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-tempo">템포(BPM)</Label>
        <Input
          id="song-tempo"
          type="number"
          min={20}
          max={300}
          value={song.tempo}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (Number.isNaN(raw)) return;
            onChange({ tempo: raw });
          }}
          onBlur={(e) => {
            const raw = Number(e.target.value);
            onChange({ tempo: Math.min(300, Math.max(20, Number.isNaN(raw) ? 20 : raw)) });
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-time-signature">박자표</Label>
        <Input
          id="song-time-signature"
          value={song.timeSignature}
          onChange={(e) => onChange({ timeSignature: e.target.value })}
          placeholder="예: 4/4"
        />
      </div>
    </div>
  );
}
