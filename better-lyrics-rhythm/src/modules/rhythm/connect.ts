/**
 * @fileoverview Wires the lyric rhythm mode to Better Lyrics' own state: the parsed lyrics the side
 * panel renders, the user's offsets, and the player's seek event.
 */

import { PLAYER_TIME_EVENT } from "@constants";
import { AppState } from "@core/appState";
import { getSegmentMapTimeShiftMs, type ParsedLyrics, seekPlayer } from "@modules/lyrics/lyrics";
import type { RhythmLyricLine } from "./notes";
import { initRhythmGame, type RhythmGameController } from "./rhythmGame";

let retimedFor: ParsedLyrics | null = null;
let retimedLines: RhythmLyricLine[] = [];

/**
 * Shifts lines recorded against a song's other version (audio vs. music video) onto the one that is
 * playing, the same way the floating lyrics window does. Cached per parsed-lyrics object, so the game
 * can ask every frame without re-mapping the song.
 */
function linesFor(parsed: ParsedLyrics): RhythmLyricLine[] {
  if (parsed === retimedFor) return retimedLines;
  retimedFor = parsed;
  const { lyrics, segmentMap } = parsed;
  if (!segmentMap || !lyrics.some(line => line.startTimeMs !== 0)) {
    retimedLines = lyrics;
    return retimedLines;
  }
  retimedLines = lyrics.map(line => {
    const shiftMs = getSegmentMapTimeShiftMs(segmentMap, line.startTimeMs);
    return {
      ...line,
      startTimeMs: line.startTimeMs + shiftMs,
      parts: line.parts?.map(part => ({ ...part, startTimeMs: part.startTimeMs + shiftMs })),
    };
  });
  return retimedLines;
}

export function initLyricRhythmMode(): RhythmGameController {
  return initRhythmGame(
    {
      getLyrics() {
        const parsed = AppState.parsedLyrics;
        if (!parsed) return null;
        return { key: parsed, lines: linesFor(parsed) };
      },
      getOffsetMs() {
        // Mirrors the side panel's tick: word-synced and line-synced lyrics each carry their own trim.
        const trim =
          AppState.lyricData?.syncType === "richsync" ? AppState.richsyncOffsetTrim : AppState.lineOffsetTrim;
        return (AppState.globalLyricOffset + AppState.lyricOffset + trim) * 1000;
      },
      seekTo: seekPlayer,
    },
    { playerTimeEvent: PLAYER_TIME_EVENT }
  );
}
