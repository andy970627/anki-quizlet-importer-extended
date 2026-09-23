// 節奏擊點小遊戲 for YouTube Music — content script
//
// 這個擴充套件「不會」擷取、錄製或下載 YouTube Music 播放的音訊或歌詞內容。
// 它只讀取頁面上 <video> 元素本來就公開的播放進度（currentTime / paused），
// 用來把疊加的節奏遊戲畫面跟目前播放進度對齊；音符本身只是通用符號（♪ ★ 等），
// 不會顯示任何受版權保護的歌詞文字。節奏（BPM）由使用者自行輸入或用
// 「Tap Tempo」跟著音樂點出來，因為我們不會分析真正的音訊波形。
(function () {
  "use strict";

  if (window.__rhythmOverlayInjected) return;
  window.__rhythmOverlayInjected = true;

  const CANVAS_W = 320;
  const CANVAS_H = 220;
  const APPROACH_MS = 550;
  const HIT_WINDOW_MS = 300;
  const BASE_RADIUS = 20;
  const MAX_TARGETS = 8;
  const GLYPHS = ["♪", "♫", "★", "●", "◆"];
  const COLORS = [
    ["#ff6fae", "#ff9ecb"],
    ["#6fd8ff", "#9ee9ff"],
    ["#ffd76f", "#ffe9a8"],
    ["#a6ff6f", "#c9ffa0"],
    ["#c88bff", "#e0bfff"]
  ];

  function findVideoElement() {
    return document.querySelector("video");
  }

  function waitForVideo(callback, timeoutMs) {
    const existing = findVideoElement();
    if (existing) {
      callback(existing);
      return;
    }
    const start = Date.now();
    const observer = new MutationObserver(() => {
      const v = findVideoElement();
      if (v) {
        observer.disconnect();
        callback(v);
      } else if (Date.now() - start > timeoutMs) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function buildOverlay(video) {
    const host = document.createElement("div");
    host.id = "rhythm-overlay-host";
    host.style.cssText =
      "all:initial; position:fixed; z-index:2147483647; bottom:16px; right:16px; width:340px;";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; }
      .panel {
        background: linear-gradient(160deg, #241640, #150c28);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        color: #f5f2ff;
        overflow: hidden;
        user-select: none;
      }
      .panel.minimized .body { display: none; }
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: rgba(255,255,255,0.06);
        cursor: grab;
        font-size: 13px;
        font-weight: bold;
      }
      .titlebar:active { cursor: grabbing; }
      .titlebar-btns button {
        background: transparent;
        border: none;
        color: #f5f2ff;
        font-size: 13px;
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 6px;
      }
      .titlebar-btns button:hover { background: rgba(255,255,255,0.15); }
      .body { padding: 10px; }
      .hud {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-bottom: 6px;
        gap: 6px;
      }
      .hud span { white-space: nowrap; }
      .hud b { color: #ff9ecb; }
      canvas {
        width: 100%;
        display: block;
        background: rgba(0,0,0,0.35);
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        cursor: crosshair;
        touch-action: none;
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 12px;
      }
      .controls label { display: flex; align-items: center; gap: 4px; }
      .controls input[type="number"] {
        width: 52px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        color: #f5f2ff;
        padding: 3px 4px;
      }
      .controls button {
        background: linear-gradient(135deg, #ff6fae, #6fd8ff);
        border: none;
        border-radius: 999px;
        color: #1b1030;
        font-weight: bold;
        padding: 5px 12px;
        cursor: pointer;
        font-size: 12px;
      }
      .hint {
        margin-top: 6px;
        font-size: 10.5px;
        color: #b7a6e0;
        line-height: 1.5;
      }
      kbd {
        display: inline-block;
        padding: 0 5px;
        border-radius: 4px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.25);
      }
    `;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "panel";
    root.innerHTML = `
      <div class="titlebar" id="dragHandle">
        <span>♪ 節奏擊點小遊戲</span>
        <div class="titlebar-btns">
          <button id="minimizeBtn" title="最小化">−</button>
          <button id="closeBtn" title="關閉">✕</button>
        </div>
      </div>
      <div class="body">
        <div class="hud">
          <span>分數：<b id="scoreVal">0</b></span>
          <span>連擊：<b id="comboVal">0</b></span>
          <span>BPM：<b id="bpmVal">120</b></span>
        </div>
        <canvas id="rhythmCanvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="controls">
          <label>BPM <input type="number" id="bpmInput" min="40" max="220" value="120"></label>
          <button id="tapBtn" type="button">Tap Tempo</button>
          <button id="startBtn" type="button">開始</button>
        </div>
        <div class="hint">
          這個面板不會擷取或下載任何音訊/歌詞，只根據影片播放進度同步。請根據歌曲拍子自設 BPM，或用 Tap Tempo 跟著拍子點敲。<br>
          滞鼠/觸控點擊，或按 <kbd>Z</kbd> / <kbd>X</kbd> 擊發。
        </div>
      </div>
    `;
    shadow.appendChild(root);

    const canvas = root.querySelector("#rhythmCanvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = root.querySelector("#scoreVal");
    const comboEl = root.querySelector("#comboVal");
    const bpmValEl = root.querySelector("#bpmVal");
    const bpmInput = root.querySelector("#bpmInput");
    const tapBtn = root.querySelector("#tapBtn");
    const startBtn = root.querySelector("#startBtn");
    const minimizeBtn = root.querySelector("#minimizeBtn");
    const closeBtn = root.querySelector("#closeBtn");
    const dragHandle = root.querySelector("#dragHandle");

    let bpm = 120;
    let running = false;
    let nextBeatIndex = 0;
    let score = 0;
    let combo = 0;
    let targets = [];
    let popEffects = [];
    let aimPoint = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
    let tapTimes = [];

    function beatMs() {
      return 60000 / bpm;
    }

    function setBpm(v) {
      bpm = clamp(Math.round(v) || 120, 40, 220);
      bpmValEl.textContent = String(bpm);
      bpmInput.value = String(bpm);
      resync();
    }

    function resync() {
      const ms = video.currentTime * 1000;
      nextBeatIndex = Math.ceil(ms / beatMs());
      targets = [];
    }

    function spawnTarget() {
      const r = BASE_RADIUS;
      const margin = r + 14;
      const x = rand(margin, CANVAS_W - margin);
      const y = rand(margin + 10, CANVAS_H - margin);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      targets.push({ x, y, r, color, glyph, spawnAt: performance.now(), hit: false });
    }

    function addPop(x, y, text, color) {
      popEffects.push({ x, y, text, color, startAt: performance.now(), life: 500 });
    }

    function handleHit(t) {
      t.hit = true;
      combo += 1;
      const gained = 10 + Math.min(combo, 20);
      score += gained;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      addPop(t.x, t.y, "+" + gained, t.color[0]);
    }

    function handleMiss(t) {
      combo = 0;
      comboEl.textContent = "0";
      addPop(t.x, t.y, "MISS", "#8f8899");
    }

    function attemptHit(x, y) {
      if (!running) return;
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t.hit) continue;
        const dx = x - t.x;
        const dy = y - t.y;
        if (Math.sqrt(dx * dx + dy * dy) <= t.r) {
          handleHit(t);
          return;
        }
      }
    }

    function pointerToCanvas(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    canvas.addEventListener("mousedown", (e) => {
      const p = pointerToCanvas(e.clientX, e.clientY);
      aimPoint = p;
      attemptHit(p.x, p.y);
    });
    canvas.addEventListener("mousemove", (e) => {
      aimPoint = pointerToCanvas(e.clientX, e.clientY);
    });
    canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        const p = pointerToCanvas(touch.clientX, touch.clientY);
        aimPoint = p;
        attemptHit(p.x, p.y);
      },
      { passive: false }
    );

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "x") return;
      if (!running) return;
      attemptHit(aimPoint.x, aimPoint.y);
    });

    function drawBackground() {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function drawTarget(t, now) {
      const elapsed = now - t.spawnAt;
      const progress = Math.min(elapsed / APPROACH_MS, 1);
      const outerR = t.r + (1 - progress) * t.r * 1.8;

      ctx.beginPath();
      ctx.arc(t.x, t.y, outerR, 0, Math.PI * 2);
      ctx.strokeStyle = t.color[1];
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const grad = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, t.r);
      grad.addColorStop(0, t.color[1]);
      grad.addColorStop(1, t.color[0]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.fillStyle = "#1b1030";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.glyph, t.x, t.y + 1);
    }

    function drawPops(now) {
      popEffects = popEffects.filter((p) => now - p.startAt < p.life);
      for (const p of popEffects) {
        const t = (now - p.startAt) / p.life;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y - t * 22 - 8);
        ctx.restore();
      }
    }

    function drawAim() {
      if (!running) return;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aimPoint.x, aimPoint.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    function tick() {
      const now = performance.now();

      if (running && !video.paused) {
        const ms = video.currentTime * 1000;
        const bms = beatMs();
        let guard = 0;
        while (ms >= nextBeatIndex * bms && guard < MAX_TARGETS) {
          if (targets.length < MAX_TARGETS) spawnTarget();
          nextBeatIndex++;
          guard++;
        }
      }

      for (const t of targets) {
        if (!t.hit && now - t.spawnAt > APPROACH_MS + HIT_WINDOW_MS) {
          t.expired = true;
          handleMiss(t);
        }
      }
      targets = targets.filter((t) => !t.hit && !t.expired);

      drawBackground();
      for (const t of targets) drawTarget(t, now);
      drawPops(now);
      drawAim();

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    video.addEventListener("seeked", () => {
      if (running) resync();
    });
    video.addEventListener("pause", () => {
      /* 影片暫停時停止產生新音符，但保留畫面上現有的 */
    });

    tapBtn.addEventListener("click", () => {
      const now = performance.now();
      tapTimes.push(now);
      if (tapTimes.length > 6) tapTimes.shift();
      if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        if (avg > 0) setBpm(60000 / avg);
      }
    });

    bpmInput.addEventListener("change", () => {
      setBpm(parseInt(bpmInput.value, 10));
    });

    startBtn.addEventListener("click", () => {
      running = !running;
      startBtn.textContent = running ? "暫停" : "開始";
      if (running) resync();
    });

    minimizeBtn.addEventListener("click", () => {
      root.classList.toggle("minimized");
    });

    closeBtn.addEventListener("click", () => {
      running = false;
      host.remove();
      window.__rhythmOverlayInjected = false;
    });

    // 拖曳面板
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    dragHandle.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = host.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = clamp(e.clientX - dragOffsetX, 0, window.innerWidth - host.offsetWidth);
      const y = clamp(e.clientY - dragOffsetY, 0, window.innerHeight - host.offsetHeight);
      host.style.left = x + "px";
      host.style.top = y + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
    });

    // 提供給測試/除錯使用的最小介面（不影響一般使用）
    window.__rhythmOverlayDebug = {
      getState: () => ({ score, combo, bpm, running, targetCount: targets.length }),
      setBpm,
      resync
    };
  }

  waitForVideo(buildOverlay, 15000);
})();
