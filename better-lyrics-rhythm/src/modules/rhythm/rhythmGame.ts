/**
 * @fileoverview Lyric rhythm mode: an osu-style hit-circle game played over YouTube Music, whose
 * notes land on the song's own time-synced lyrics.
 *
 * Deliberately free of AppState and the lyrics pipeline: everything it knows about the song comes
 * through a {@link RhythmGameSource}, and everything it knows about playback comes from the same
 * player-time events the side panel ticks on. That keeps the game testable on a bare page, and keeps
 * the rest of the extension unaware it exists.
 *
 * Nothing here reads, records or re-routes audio. The page's own player keeps playing the song;
 * this only reads the playback position the page already publishes.
 */

import {
  buildNoteChart,
  computeRank,
  HIT_WINDOW_MS,
  isUnsynced,
  type Judgement,
  JUDGEMENT_POINTS,
  judge,
  type NoteChart,
  type NoteMode,
  type RhythmLyricLine,
  type RhythmNote,
} from "./notes";

export interface RhythmGameSource {
  /**
   * The current song's lyric lines, already on the playing video's timeline. `key` changes whenever
   * the lines do (a new song, a provider switch), and is how the game knows to rebuild its chart.
   */
  getLyrics(): { key: unknown; lines: readonly RhythmLyricLine[] } | null;
  /** Milliseconds to subtract from player time to land on the lyric timeline (the user's offsets). */
  getOffsetMs(): number;
  seekTo(timeS: number): void;
}

interface PlayerTimeDetail {
  currentTime: number;
  browserTime: number;
  playing: boolean;
  playbackRate?: number;
  videoId: string;
  duration: number | string;
}

interface ActiveTarget {
  note: RhythmNote;
  hit: boolean;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  bornAt: number;
}

type GameState = "idle" | "playing" | "results";

export interface RhythmGameController {
  destroy(): void;
  /** Test and debugging surface. Not used by the extension itself. */
  debug: {
    open(): void;
    start(): void;
    getState(): {
      state: GameState;
      score: number;
      combo: number;
      maxCombo: number;
      counts: Record<Judgement, number>;
      noteCount: number;
      activeTargets: { x: number; y: number; timeMs: number; label: string }[];
      lyricMs: number;
      status: string;
    };
    hitAt(x: number, y: number): void;
    setAim(x: number, y: number): void;
  };
}

const FIELD_W = 400;
const FIELD_H = 260;
const TARGET_RADIUS = 26;
const APPROACH_MS = 900;
/** A jump in reported player time bigger than this, beyond what the clock predicted, is a seek. */
const SEEK_THRESHOLD_S = 0.6;
const POPUP_LIFE_MS = 550;
const COMBO_COLORS: [string, string][] = [
  ["#ff6fae", "#ffc2dc"],
  ["#6fd8ff", "#c2f0ff"],
  ["#ffd76f", "#fff0c2"],
  ["#a6ff6f", "#dcffc2"],
  ["#c88bff", "#ead6ff"],
];
const JUDGEMENT_COLORS: Record<Judgement, string> = {
  PERFECT: "#7ff5ff",
  GREAT: "#a6ff6f",
  OK: "#ffd76f",
  MISS: "#ff6f7f",
};

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; }
  .launcher {
    position: fixed; left: 16px; bottom: 88px; z-index: 2147483000;
    border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 8px 14px;
    background: rgba(20, 12, 36, 0.82); color: #f5f2ff; font-size: 13px; font-weight: 700;
    backdrop-filter: blur(12px); cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  .launcher:hover { background: rgba(48, 28, 84, 0.9); }
  .launcher[aria-pressed="true"] { border-color: #ff9ecb; }
  .panel {
    position: fixed; left: 16px; bottom: 134px; z-index: 2147483000; width: 424px;
    background: linear-gradient(160deg, rgba(36,22,64,0.94), rgba(21,12,40,0.94));
    border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; color: #f5f2ff;
    box-shadow: 0 12px 40px rgba(0,0,0,0.55); backdrop-filter: blur(16px); user-select: none;
  }
  .panel[hidden] { display: none; }
  .titlebar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 12px; cursor: grab; font-size: 13px; font-weight: 700;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .titlebar:active { cursor: grabbing; }
  .titlebar button {
    background: transparent; border: none; color: inherit; font-size: 14px; cursor: pointer;
    padding: 2px 8px; border-radius: 6px;
  }
  .titlebar button:hover { background: rgba(255,255,255,0.14); }
  .body { padding: 10px 12px 12px; }
  .hud { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
  .hud b { color: #ff9ecb; font-variant-numeric: tabular-nums; }
  .field { position: relative; }
  canvas {
    display: block; width: 100%; aspect-ratio: ${FIELD_W} / ${FIELD_H}; border-radius: 10px;
    background: radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.35));
    border: 1px solid rgba(255,255,255,0.12); cursor: none; touch-action: none;
  }
  .results {
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px; border-radius: 10px; background: rgba(12,6,24,0.86);
    font-size: 12.5px; text-align: center;
  }
  .results[hidden] { display: none; }
  .rank { font-size: 46px; font-weight: 900; line-height: 1; background: linear-gradient(135deg,#ff6fae,#6fd8ff);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .strip {
    margin-top: 8px; min-height: 22px; font-size: 14px; font-weight: 700; text-align: center;
    color: #fff; text-shadow: 0 0 12px rgba(255,158,203,0.6); overflow: hidden; white-space: nowrap;
    text-overflow: ellipsis;
  }
  .controls { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; flex-wrap: wrap; }
  select {
    background: rgba(255,255,255,0.08); color: inherit; border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px; padding: 4px 6px; font-size: 12px;
  }
  select option { color: #1b1030; }
  .btn {
    border: none; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 700;
    background: linear-gradient(135deg, #ff6fae, #6fd8ff); color: #1b1030;
  }
  .btn.secondary { background: rgba(255,255,255,0.12); color: #f5f2ff; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .status { margin-top: 6px; font-size: 11px; color: #b7a6e0; line-height: 1.5; }
  kbd {
    display: inline-block; padding: 0 5px; border-radius: 4px; font-size: 10.5px;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25);
  }
`;

const TEMPLATE = `
  <button class="launcher" type="button" aria-pressed="false">♪ 歌詞節奏模式</button>
  <section class="panel" hidden aria-label="歌詞節奏模式">
    <div class="titlebar">
      <span>♪ 歌詞節奏模式</span>
      <button type="button" data-action="close" title="關閉">✕</button>
    </div>
    <div class="body">
      <div class="hud">
        <span>分數 <b data-hud="score">0</b></span>
        <span>連擊 <b data-hud="combo">0</b></span>
        <span>準確率 <b data-hud="accuracy">100.00%</b></span>
      </div>
      <div class="field">
        <canvas width="${FIELD_W}" height="${FIELD_H}"></canvas>
        <div class="results" hidden>
          <div class="rank" data-result="rank">S</div>
          <div data-result="score"></div>
          <div data-result="detail"></div>
          <div class="controls" style="justify-content:center">
            <button class="btn" type="button" data-action="retry">從頭再玩</button>
            <button class="btn secondary" type="button" data-action="dismiss">關閉結果</button>
          </div>
        </div>
      </div>
      <div class="strip" data-strip></div>
      <div class="controls">
        <label>音符 <select data-mode>
          <option value="word">逐字（需逐字同步歌詞）</option>
          <option value="line">逐行</option>
        </select></label>
        <button class="btn" type="button" data-action="toggle">開始</button>
        <button class="btn secondary" type="button" data-action="retry">從頭挑戰</button>
      </div>
      <div class="status" data-status></div>
      <div class="status">滑鼠/觸控點擊音符，或把準星移到音符上按 <kbd>Z</kbd> / <kbd>X</kbd>。時間若不準，用 Better Lyrics 的歌詞偏移（offset）調整，遊戲會一起套用。</div>
    </div>
  </section>
`;

function isTypingTarget(event: Event): boolean {
  const origin = event.composedPath()[0];
  if (!(origin instanceof HTMLElement)) return false;
  return origin.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(origin.tagName);
}

export function initRhythmGame(
  source: RhythmGameSource,
  options: { playerTimeEvent?: string; mountTarget?: HTMLElement } = {}
): RhythmGameController {
  const playerTimeEvent = options.playerTimeEvent ?? "blyrics-send-player-time";

  // -- DOM --------------------------

  const host = document.createElement("div");
  host.dataset.blyricsRhythm = "true";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.appendChild(style);
  const template = document.createElement("template");
  template.innerHTML = TEMPLATE;
  shadow.appendChild(template.content);
  (options.mountTarget ?? document.documentElement).appendChild(host);

  const q = <T extends Element>(selector: string): T => {
    const element = shadow.querySelector<T>(selector);
    if (!element) throw new Error(`[BetterLyrics rhythm] missing ${selector}`);
    return element;
  };
  const launcher = q<HTMLButtonElement>(".launcher");
  const panel = q<HTMLElement>(".panel");
  const titlebar = q<HTMLElement>(".titlebar");
  const canvas = q<HTMLCanvasElement>("canvas");
  const resultsEl = q<HTMLElement>(".results");
  const stripEl = q<HTMLElement>("[data-strip]");
  const statusEl = q<HTMLElement>("[data-status]");
  const modeSelect = q<HTMLSelectElement>("[data-mode]");
  const toggleBtn = q<HTMLButtonElement>('[data-action="toggle"]');
  const scoreEl = q<HTMLElement>('[data-hud="score"]');
  const comboEl = q<HTMLElement>('[data-hud="combo"]');
  const accuracyEl = q<HTMLElement>('[data-hud="accuracy"]');
  const ctx = canvas.getContext("2d");

  // -- Playback clock --------------------------
  // Same interpolation the side panel's animation engine uses: the page reports a snapshot a few
  // times a second, and the wall clock fills in between.

  let playerTimeS = 0;
  let snapshotWallMs = 0;
  let playerPlaying = false;
  let playbackRate = 1;
  let playerDurationS = Infinity;
  let videoId = "";
  let seekPending = false;

  function playerNowS(wallMs = Date.now()): number {
    const elapsed = playerPlaying ? (Math.max(0, wallMs - snapshotWallMs) * playbackRate) / 1000 : 0;
    return Math.min(playerTimeS + elapsed, playerDurationS);
  }

  function lyricNowMs(wallMs = Date.now()): number {
    return playerNowS(wallMs) * 1000 - source.getOffsetMs();
  }

  const onPlayerTime = (event: Event): void => {
    const detail = (event as CustomEvent<PlayerTimeDetail>).detail;
    if (!detail) return;
    const predicted = playerNowS(detail.browserTime);
    const songChanged = detail.videoId !== videoId;

    playerTimeS = detail.currentTime;
    snapshotWallMs = detail.browserTime;
    playerPlaying = detail.playing;
    playbackRate = detail.playbackRate ?? 1;
    const duration = Number(detail.duration);
    playerDurationS = Number.isFinite(duration) && duration > 0 ? duration : Infinity;

    if (songChanged) {
      videoId = detail.videoId;
      handleSongChange();
    } else if (Math.abs(detail.currentTime - predicted) > SEEK_THRESHOLD_S) {
      seekPending = true;
    }
  };
  document.addEventListener(playerTimeEvent, onPlayerTime);

  // -- Chart --------------------------

  let mode: NoteMode = "word";
  let chart: NoteChart = { notes: [], hasWordTiming: false };
  let chartKey: unknown = null;
  let chartMode: NoteMode | null = null;
  let lines: readonly RhythmLyricLine[] = [];
  let lyricsState: "waiting" | "unsynced" | "ready" = "waiting";

  function refreshChart(): boolean {
    const lyrics = source.getLyrics();
    const key = lyrics?.key ?? null;
    if (key === chartKey && mode === chartMode) return false;

    chartKey = key;
    chartMode = mode;
    lines = lyrics?.lines ?? [];
    if (!lyrics) {
      lyricsState = "waiting";
      chart = { notes: [], hasWordTiming: false };
    } else if (isUnsynced(lines)) {
      lyricsState = "unsynced";
      chart = { notes: [], hasWordTiming: false };
    } else {
      lyricsState = "ready";
      chart = buildNoteChart(lines, mode, { width: FIELD_W, height: FIELD_H, margin: TARGET_RADIUS + 12 }, videoId);
    }
    renderStatus();
    return true;
  }

  function renderStatus(): void {
    let text: string;
    if (lyricsState === "waiting") {
      text = "等待 Better Lyrics 載入這首歌的歌詞…";
    } else if (lyricsState === "unsynced") {
      text = "這首歌只有未同步的歌詞，沒有時間軸可以產生音符。";
    } else {
      const timing = chart.hasWordTiming ? "逐字同步歌詞" : "逐行同步歌詞";
      const notesKind = mode === "word" && chart.hasWordTiming ? "逐字音符" : "逐行音符";
      const fallback = mode === "word" && !chart.hasWordTiming ? "（沒有逐字時間，改用逐行）" : "";
      text = `${timing}${fallback} · ${notesKind} ${chart.notes.length} 個`;
    }
    statusEl.textContent = text;
    toggleBtn.disabled = state !== "playing" && chart.notes.length === 0;
  }

  // -- Game state --------------------------

  let state: GameState = "idle";
  let nextNoteIndex = 0;
  let active: ActiveTarget[] = [];
  let popups: Popup[] = [];
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let accuracyPoints = 0;
  let counts: Record<Judgement, number> = { PERFECT: 0, GREAT: 0, OK: 0, MISS: 0 };
  let aim = { x: FIELD_W / 2, y: FIELD_H / 2 };
  let lastJudgement: { judgement: Judgement; at: number } | null = null;

  function judgedCount(): number {
    return counts.PERFECT + counts.GREAT + counts.OK + counts.MISS;
  }

  function accuracy(): number {
    const judged = judgedCount();
    return judged === 0 ? 1 : accuracyPoints / (judged * 300);
  }

  function renderHud(): void {
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
    accuracyEl.textContent = `${(accuracy() * 100).toFixed(2)}%`;
  }

  function resetScore(): void {
    score = 0;
    combo = 0;
    maxCombo = 0;
    accuracyPoints = 0;
    counts = { PERFECT: 0, GREAT: 0, OK: 0, MISS: 0 };
    popups = [];
    lastJudgement = null;
    renderHud();
  }

  /** Drops what is on screen and picks up from wherever the song is now, skipping notes already due. */
  function resyncTo(lyricMs: number): void {
    active = [];
    nextNoteIndex = chart.notes.findIndex(note => note.timeMs > lyricMs + 100);
    if (nextNoteIndex === -1) nextNoteIndex = chart.notes.length;
  }

  function setState(next: GameState): void {
    state = next;
    toggleBtn.textContent = state === "playing" ? "停止" : "開始";
    modeSelect.disabled = state === "playing";
    resultsEl.hidden = state !== "results";
    if (state === "results") renderResults();
    renderStatus();
  }

  function startGame(): void {
    refreshChart();
    if (chart.notes.length === 0) return;
    resetScore();
    resyncTo(lyricNowMs());
    seekPending = false;
    setState("playing");
  }

  function stopGame(): void {
    active = [];
    setState(judgedCount() > 0 ? "results" : "idle");
  }

  function restartFromTop(): void {
    refreshChart();
    if (chart.notes.length === 0) return;
    // Land a few seconds before the first note, converted back from the lyric timeline to the player's.
    const firstNoteS = (chart.notes[0].timeMs + source.getOffsetMs()) / 1000;
    source.seekTo(Math.max(0, firstNoteS - 3));
    startGame();
    seekPending = true;
  }

  function handleSongChange(): void {
    if (state === "playing") stopGame();
    chartKey = Symbol("song-changed");
    stripEl.textContent = "";
  }

  function renderResults(): void {
    const judged = judgedCount();
    const acc = accuracy();
    q<HTMLElement>('[data-result="rank"]').textContent = judged === 0 ? "-" : computeRank(acc, counts.MISS);
    q<HTMLElement>('[data-result="score"]').textContent =
      `分數 ${score} · 最大連擊 ${maxCombo} · 準確率 ${(acc * 100).toFixed(2)}%`;
    q<HTMLElement>('[data-result="detail"]').textContent =
      `PERFECT ${counts.PERFECT} · GREAT ${counts.GREAT} · OK ${counts.OK} · MISS ${counts.MISS}`;
  }

  function registerJudgement(target: ActiveTarget, judgement: Judgement): void {
    counts[judgement]++;
    accuracyPoints += JUDGEMENT_POINTS[judgement];
    if (judgement === "MISS") {
      combo = 0;
    } else {
      target.hit = true;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += JUDGEMENT_POINTS[judgement] + Math.min(combo, 20) * 2;
    }
    const now = performance.now();
    lastJudgement = { judgement, at: now };
    popups.push({
      x: target.note.x,
      y: target.note.y,
      text: judgement,
      color: JUDGEMENT_COLORS[judgement],
      bornAt: now,
    });
    renderHud();
  }

  function attemptHit(x: number, y: number): void {
    if (state !== "playing") return;
    const lyricMs = lyricNowMs();
    let best: ActiveTarget | null = null;
    for (const target of active) {
      if (target.hit) continue;
      const delta = lyricMs - target.note.timeMs;
      if (Math.abs(delta) > HIT_WINDOW_MS) continue;
      if (Math.hypot(x - target.note.x, y - target.note.y) > TARGET_RADIUS * 1.15) continue;
      if (!best || target.note.timeMs < best.note.timeMs) best = target;
    }
    if (best) registerJudgement(best, judge(lyricMs - best.note.timeMs));
  }

  // -- Frame loop --------------------------

  let frameRequest: number | null = null;
  let currentStripLine = -1;
  let isOpen = false;

  function updateGame(lyricMs: number): void {
    if (refreshChart()) resyncTo(lyricMs);
    if (seekPending) {
      seekPending = false;
      resyncTo(lyricMs);
    }

    const notes = chart.notes;
    while (nextNoteIndex < notes.length && notes[nextNoteIndex].timeMs - APPROACH_MS <= lyricMs) {
      active.push({ note: notes[nextNoteIndex], hit: false });
      nextNoteIndex++;
    }
    for (const target of active) {
      if (!target.hit && lyricMs - target.note.timeMs > HIT_WINDOW_MS) {
        target.hit = true;
        registerJudgement(target, "MISS");
      }
    }
    active = active.filter(target => !target.hit);

    const lastNote = notes[notes.length - 1];
    if (nextNoteIndex >= notes.length && active.length === 0 && (!lastNote || lyricMs > lastNote.timeMs + 1200)) {
      stopGame();
    }
  }

  function updateStrip(lyricMs: number): void {
    let lineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startTimeMs <= lyricMs) lineIndex = i;
      else break;
    }
    if (lineIndex === currentStripLine) return;
    currentStripLine = lineIndex;
    stripEl.textContent = lineIndex >= 0 && lyricsState === "ready" ? lines[lineIndex].words : "";
  }

  function drawTarget(c: CanvasRenderingContext2D, target: ActiveTarget, lyricMs: number): void {
    const { note } = target;
    const [fill, light] = COMBO_COLORS[note.lineIndex % COMBO_COLORS.length];
    const progress = Math.min(1, Math.max(0, (lyricMs - (note.timeMs - APPROACH_MS)) / APPROACH_MS));
    const late = Math.max(0, lyricMs - note.timeMs) / HIT_WINDOW_MS;
    c.save();
    c.globalAlpha = Math.min(1, progress * 3) * (1 - late * 0.7);

    // Approach ring: shrinks onto the circle exactly when the lyric is sung.
    c.beginPath();
    c.arc(note.x, note.y, TARGET_RADIUS * (1 + 2.2 * (1 - progress)), 0, Math.PI * 2);
    c.strokeStyle = light;
    c.lineWidth = 2.5;
    c.stroke();

    const gradient = c.createRadialGradient(note.x, note.y - 6, 3, note.x, note.y, TARGET_RADIUS);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, fill);
    c.beginPath();
    c.arc(note.x, note.y, TARGET_RADIUS, 0, Math.PI * 2);
    c.fillStyle = gradient;
    c.shadowColor = fill;
    c.shadowBlur = 14;
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 2;
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.stroke();

    c.fillStyle = "#1b1030";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "800 11px system-ui, sans-serif";
    c.fillText(String(note.numberInLine), note.x, note.y - 10);
    let fontSize = 13;
    c.font = `700 ${fontSize}px "Noto Sans TC", system-ui, sans-serif`;
    while (fontSize > 8 && c.measureText(note.label).width > TARGET_RADIUS * 1.8) {
      fontSize--;
      c.font = `700 ${fontSize}px "Noto Sans TC", system-ui, sans-serif`;
    }
    let label = note.label;
    while (label.length > 1 && c.measureText(label).width > TARGET_RADIUS * 1.8) {
      label = `${label.slice(0, -2)}…`;
    }
    c.fillText(label, note.x, note.y + 5);
    c.restore();
  }

  function draw(lyricMs: number): void {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(FIELD_W * dpr)) {
      canvas.width = Math.round(FIELD_W * dpr);
      canvas.height = Math.round(FIELD_H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);

    // Earliest notes are drawn last so the one due next is always on top.
    for (let i = active.length - 1; i >= 0; i--) drawTarget(ctx, active[i], lyricMs);

    const now = performance.now();
    popups = popups.filter(popup => now - popup.bornAt < POPUP_LIFE_MS);
    for (const popup of popups) {
      const t = (now - popup.bornAt) / POPUP_LIFE_MS;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = popup.color;
      ctx.font = "800 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(popup.text, popup.x, popup.y - TARGET_RADIUS - 6 - t * 18);
      ctx.restore();
    }

    if (lastJudgement && combo >= 2 && now - lastJudgement.at < 900) {
      ctx.save();
      ctx.globalAlpha = 1 - (now - lastJudgement.at) / 900;
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 22px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${combo}x`, 10, FIELD_H - 12);
      ctx.restore();
    }

    if (state === "playing" && !playerPlaying) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("已暫停：繼續播放歌曲就會接著玩", FIELD_W / 2, FIELD_H / 2);
      ctx.restore();
    } else if (state === "idle") {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("播放歌曲後按「開始」，音符會跟著歌詞出現", FIELD_W / 2, FIELD_H / 2);
      ctx.restore();
    }

    // Crosshair for Z/X hits.
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 8, 0, Math.PI * 2);
    ctx.moveTo(aim.x - 13, aim.y);
    ctx.lineTo(aim.x - 4, aim.y);
    ctx.moveTo(aim.x + 4, aim.y);
    ctx.lineTo(aim.x + 13, aim.y);
    ctx.moveTo(aim.x, aim.y - 13);
    ctx.lineTo(aim.x, aim.y - 4);
    ctx.moveTo(aim.x, aim.y + 4);
    ctx.lineTo(aim.x, aim.y + 13);
    ctx.stroke();
    ctx.restore();
  }

  function frame(): void {
    frameRequest = null;
    if (!isOpen) return;
    const lyricMs = lyricNowMs();
    if (state === "playing") updateGame(lyricMs);
    else refreshChart();
    updateStrip(lyricMs);
    draw(lyricMs);
    frameRequest = requestAnimationFrame(frame);
  }

  function ensureLoop(): void {
    if (frameRequest === null && isOpen) frameRequest = requestAnimationFrame(frame);
  }

  // -- Input --------------------------

  function toField(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * FIELD_W) / rect.width,
      y: ((clientY - rect.top) * FIELD_H) / rect.height,
    };
  }

  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    aim = toField(event.clientX, event.clientY);
    attemptHit(aim.x, aim.y);
  });
  canvas.addEventListener("pointermove", event => {
    aim = toField(event.clientX, event.clientY);
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (state !== "playing" || !isOpen || event.repeat || isTypingTarget(event)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "x") return;
    event.preventDefault();
    event.stopPropagation();
    attemptHit(aim.x, aim.y);
  };
  document.addEventListener("keydown", onKeyDown, true);

  function setOpen(open: boolean): void {
    isOpen = open;
    panel.hidden = !open;
    launcher.setAttribute("aria-pressed", String(open));
    if (!open && state === "playing") stopGame();
    if (open) {
      refreshChart();
      renderStatus();
      ensureLoop();
    }
  }

  launcher.addEventListener("click", () => setOpen(!isOpen));
  shadow.addEventListener("click", event => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "close") setOpen(false);
    else if (action === "toggle") state === "playing" ? stopGame() : startGame();
    else if (action === "retry") restartFromTop();
    else if (action === "dismiss") setState("idle");
  });
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value === "line" ? "line" : "word";
    refreshChart();
  });

  // Dragging by the title bar; the panel keeps its size and stays on screen.
  let drag: { dx: number; dy: number } | null = null;
  titlebar.addEventListener("pointerdown", event => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    titlebar.setPointerCapture(event.pointerId);
  });
  titlebar.addEventListener("pointermove", event => {
    if (!drag) return;
    const x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, event.clientY - drag.dy));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.bottom = "auto";
  });
  titlebar.addEventListener("pointerup", () => {
    drag = null;
  });

  renderHud();
  renderStatus();

  return {
    destroy(): void {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      document.removeEventListener(playerTimeEvent, onPlayerTime);
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
    },
    debug: {
      open: () => setOpen(true),
      start: startGame,
      getState: () => ({
        state,
        score,
        combo,
        maxCombo,
        counts: { ...counts },
        noteCount: chart.notes.length,
        activeTargets: active
          .filter(target => !target.hit)
          .map(target => ({
            x: target.note.x,
            y: target.note.y,
            timeMs: target.note.timeMs,
            label: target.note.label,
          })),
        lyricMs: lyricNowMs(),
        status: statusEl.textContent ?? "",
      }),
      hitAt: attemptHit,
      setAim: (x: number, y: number) => {
        aim = { x, y };
      },
    },
  };
}
