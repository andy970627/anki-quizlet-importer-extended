/**
 * @fileoverview Turns time-synced lyric lines into rhythm-game notes.
 *
 * Pure: no DOM, no AppState. The game module and its tests both build notes through here, so a
 * note chart for a given song is always the same no matter which view asked for it.
 */

export interface RhythmLyricPart {
  startTimeMs: number;
  words: string;
  durationMs: number;
  isBackground?: boolean;
}

export interface RhythmLyricLine {
  startTimeMs: number;
  words: string;
  durationMs: number;
  parts?: RhythmLyricPart[];
  isInstrumental?: boolean;
}

export type NoteMode = "word" | "line";

export interface RhythmNote {
  /** When the note should be hit, on the lyric timeline, in milliseconds. */
  timeMs: number;
  /** Text drawn on the target: one word in word mode, the line's opening words in line mode. */
  label: string;
  /** Index of the lyric line the note came from, used for combo colours and the lyric strip. */
  lineIndex: number;
  /** Position inside its line, starting at 1, drawn as the osu-style combo number. */
  numberInLine: number;
  x: number;
  y: number;
}

export interface NoteChart {
  notes: RhythmNote[];
  /** True when at least one line carried word-level timings and word mode could use them. */
  hasWordTiming: boolean;
}

export interface PlayfieldSize {
  width: number;
  height: number;
  margin: number;
}

/** Two notes closer than this are merged into the first, so fast syllable runs stay playable. */
export const MIN_NOTE_GAP_MS = 140;

const LINE_LABEL_MAX_CHARS = 14;

/** True when every line sits at zero, which is how providers hand over unsynced lyrics. */
export function isUnsynced(lines: readonly RhythmLyricLine[]): boolean {
  return lines.length === 0 || lines.every(line => line.startTimeMs === 0);
}

function lineLabel(words: string): string {
  const trimmed = words.trim();
  if (trimmed.length <= LINE_LABEL_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, LINE_LABEL_MAX_CHARS - 1)}…`;
}

/**
 * A small deterministic PRNG (mulberry32), seeded per song so that seeking back and forth, or
 * replaying a song, lays the targets out in the same places every time.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Lays out note positions like an osu map: each target sits a jump away from the last one, and the
 * jump grows with the time between them, so quick notes stay close and slow ones travel.
 */
function placeNotes(notes: RhythmNote[], size: PlayfieldSize, seed: number): void {
  const random = createRandom(seed);
  const minX = size.margin;
  const maxX = size.width - size.margin;
  const minY = size.margin;
  const maxY = size.height - size.margin;
  let x = size.width / 2;
  let y = size.height / 2;
  let angle = random() * Math.PI * 2;

  notes.forEach((note, index) => {
    if (index > 0) {
      const gapMs = note.timeMs - notes[index - 1].timeMs;
      const distance = Math.max(36, Math.min(150, gapMs * 0.22));
      angle += (random() - 0.5) * Math.PI * 1.2;
      let nextX = x + Math.cos(angle) * distance;
      let nextY = y + Math.sin(angle) * distance;
      // Bounce off the playfield edges instead of clamping, so targets never pile up in a corner.
      if (nextX < minX || nextX > maxX) {
        angle = Math.PI - angle;
        nextX = x + Math.cos(angle) * distance;
      }
      if (nextY < minY || nextY > maxY) {
        angle = -angle;
        nextY = y + Math.sin(angle) * distance;
      }
      x = Math.max(minX, Math.min(maxX, nextX));
      y = Math.max(minY, Math.min(maxY, nextY));
    }
    note.x = x;
    note.y = y;
  });
}

/**
 * Builds the note chart for a song.
 *
 * @param lines - Lyric lines, already shifted onto the playing video's timeline
 * @param mode - "word" makes one note per timed word where the provider gave word timings, and
 *               falls back to one note per line where it did not; "line" always makes one per line
 * @param size - Playfield the notes are laid out on
 * @param seedText - Anything stable per song (the video id), so layouts repeat per song
 */
export function buildNoteChart(
  lines: readonly RhythmLyricLine[],
  mode: NoteMode,
  size: PlayfieldSize,
  seedText: string
): NoteChart {
  const notes: RhythmNote[] = [];
  let hasWordTiming = false;

  if (isUnsynced(lines)) return { notes, hasWordTiming };

  lines.forEach((line, lineIndex) => {
    if (line.isInstrumental || !line.words.trim()) return;

    const timedParts = (line.parts ?? []).filter(part => !part.isBackground && part.words.trim());
    if (timedParts.length > 0) hasWordTiming = true;

    if (mode === "word" && timedParts.length > 0) {
      timedParts.forEach((part, partIndex) => {
        notes.push({
          timeMs: part.startTimeMs,
          label: part.words.trim(),
          lineIndex,
          numberInLine: partIndex + 1,
          x: 0,
          y: 0,
        });
      });
      return;
    }

    notes.push({ timeMs: line.startTimeMs, label: lineLabel(line.words), lineIndex, numberInLine: 1, x: 0, y: 0 });
  });

  notes.sort((a, b) => a.timeMs - b.timeMs);

  const playable: RhythmNote[] = [];
  for (const note of notes) {
    const previous = playable[playable.length - 1];
    if (previous && note.timeMs - previous.timeMs < MIN_NOTE_GAP_MS) continue;
    playable.push(note);
  }

  // Renumber after merging so combo numbers count only the notes the player actually sees.
  let lastLine = -1;
  let counter = 0;
  for (const note of playable) {
    counter = note.lineIndex === lastLine ? counter + 1 : 1;
    lastLine = note.lineIndex;
    note.numberInLine = counter;
  }

  placeNotes(playable, size, hashSeed(seedText));
  return { notes: playable, hasWordTiming };
}

// -- Judgement --------------------------

export const HIT_WINDOW_MS = 280;
export const PERFECT_WINDOW_MS = 90;
export const GREAT_WINDOW_MS = 180;

export type Judgement = "PERFECT" | "GREAT" | "OK" | "MISS";

export function judge(deltaMs: number): Judgement {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_WINDOW_MS) return "PERFECT";
  if (abs <= GREAT_WINDOW_MS) return "GREAT";
  if (abs <= HIT_WINDOW_MS) return "OK";
  return "MISS";
}

export const JUDGEMENT_POINTS: Record<Judgement, number> = { PERFECT: 300, GREAT: 100, OK: 50, MISS: 0 };

export function computeRank(accuracy: number, misses: number): string {
  if (accuracy >= 1) return "SS";
  if (accuracy >= 0.95 && misses === 0) return "S";
  if (accuracy >= 0.9) return "A";
  if (accuracy >= 0.8) return "B";
  if (accuracy >= 0.7) return "C";
  return "D";
}
