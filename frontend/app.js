import * as monaco from 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/+esm';

/* ============================================================
   Editor
============================================================ */

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: `clear()

for x in range(6):
    plant("grass", x, 0)
    water(x, 0)

for x in range(6):
    plant("wheat", x, 1)
    water(x, 1)

for x in range(6):
    plant("carrot", x, 2)
    water(x, 2)

for x in range(6):
    plant("strawberry", x, 3)
    water(x, 3)

for x in range(6):
    plant("eggplant", x, 4)
    water(x, 4)
    
for x in range(6):
    plant("tomato", x, 5)
    water(x, 5)
    
for y in range(6):
    harvest(0, y)`,
  language: 'python',
  theme: 'vs',
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 16,
  lineHeight: 22
});

let currentLineDecoration = [];

function highlightLine(line) {
  currentLineDecoration = editor.deltaDecorations(
    currentLineDecoration,
    [{
      range: new monaco.Range(line, 1, line, 1),
      options: { isWholeLine: true, className: 'current-line-highlight' }
    }]
  );
}

function clearHighlight() {
  currentLineDecoration = editor.deltaDecorations(currentLineDecoration, []);
}

/* ============================================================
   Autocomplete
============================================================ */

monaco.languages.registerCompletionItemProvider('python', {
  provideCompletionItems: () => ({
    suggestions: [
      { label: 'plant', kind: monaco.languages.CompletionItemKind.Function, insertText: 'plant("${1:crop}", ${2:x}, ${3:y})', insertTextRules: 4 },
      { label: 'harvest', kind: monaco.languages.CompletionItemKind.Function, insertText: 'harvest(${1:x}, ${2:y})', insertTextRules: 4 },
      { label: 'water', kind: monaco.languages.CompletionItemKind.Function, insertText: 'water(${1:x}, ${2:y})', insertTextRules: 4 },
      { label: 'wait', kind: monaco.languages.CompletionItemKind.Function, insertText: 'wait(${1:seconds})', insertTextRules: 4 },
      { label: 'clear', kind: monaco.languages.CompletionItemKind.Function, insertText: 'clear()', insertTextRules: 4 }
    ]
  })
});

/* ============================================================
   Console
============================================================ */

const consoleEl = document.getElementById('console');

function log(msg) {
  consoleEl.textContent += msg + '\n';
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

/* ============================================================
   Canvas / Rendering
============================================================ */

const canvas = document.getElementById('farmCanvas');
const ctx = canvas.getContext('2d');

let canvasCSSWidth = 0;
let canvasCSSHeight = 0;

let GRID = 0;
let FIELD_RATIO = null; // 0~1 相对 canvas 的比例
let field = null;
let EXEC_INTERVAL = 0; // in milliseconds
const floatingTexts = [];

/* ---------- background ---------- */
let bgImg = new Image();
let bgRect = null;
let bgScale = 1;

function fieldPoint(r) {
  if (!bgRect) return { x: 0, y: 0 };

  return {
    x: bgRect.x + r.x * bgRect.w,
    y: bgRect.y + r.y * bgRect.h
  };
}

function updateFieldFromCanvas() {
  if (!FIELD_RATIO || !bgRect) return;

  field = {
    topLeft: fieldPoint({
      x: FIELD_RATIO.topLeft[0],
      y: FIELD_RATIO.topLeft[1]
    }),
    topRight: fieldPoint({
      x: FIELD_RATIO.topRight[0],
      y: FIELD_RATIO.topRight[1]
    }),
    bottomLeft: fieldPoint({
      x: FIELD_RATIO.bottomLeft[0],
      y: FIELD_RATIO.bottomLeft[1]
    }),
    bottomRight: fieldPoint({
      x: FIELD_RATIO.bottomRight[0],
      y: FIELD_RATIO.bottomRight[1]
    })
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  canvasCSSWidth = rect.width;
  canvasCSSHeight = rect.height;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  drawScene(currentFarm);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

/* ---------- grid mapping ---------- */
const EMPTY_FARM = {
  gold: null,
  time: null,
  grid: []
};

let currentFarm = EMPTY_FARM;
const CELL_HIT_RADIUS = 28;
let hoveredCell = null; // {x, y} 或 null

function gridUVToScreen(u, v) { // u 和 v 是“归一化的农田坐标”，表示点在农田平行四边形里的相对位置比例
  const px =
    field.topLeft.x * (1 - u) * (1 - v) +
    field.topRight.x * u * (1 - v) +
    field.bottomLeft.x * (1 - u) * v +
    field.bottomRight.x * u * v;

  const py =
    field.topLeft.y * (1 - u) * (1 - v) +
    field.topRight.y * u * (1 - v) +
    field.bottomLeft.y * (1 - u) * v +
    field.bottomRight.y * u * v;

  return { x: px, y: py, depth: v };
}

// return position of the cell in column x and row y
function gridToScreen(x, y) {
  return gridUVToScreen(
    // shift the relative position to return the cell center for plant
    (x + 0.35) / (GRID-1),
    (y + 0.2) / (GRID-1)
  );
}

/* ---------- draw crop ---------- */
const cropEmoji = {
  grass: "🌿",
  wheat: "🌾",
  carrot: "🥕",
  cabbage: "🥬",
  strawberry: "🍓",
  eggplant: "🍆",
  tomato: "🍅"
};

function drawCrop(cell, p) {  
  const baseSize = 44;
  const depthScale = 1.0 + p.depth * 0.25;
  const maturityScale = 0.6 + cell.maturity * 0.4;
  
  // Crop尺寸跟随背景缩放，但是限制在32到64之间。
  const size = Math.max(32, Math.min(64,
      baseSize * bgScale * depthScale * maturityScale
  ));

  ctx.save();
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cropEmoji[cell.type], p.x, p.y);
  ctx.restore();
}

function drawHarvestIndicator(p, depth) {
  const size = (14 + depth * 4) * bgScale;
  ctx.save();
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🟢", p.x + size, p.y - size);
  ctx.restore();
}

/* ---------- scene drawing ---------- */
function getCellCorners(x, y) { // cell in column x and row y
  const step = 1 / (GRID - 1);

  const u0 = x * step;
  const v0 = y * step;
  const u1 = (x + 1) * step;
  const v1 = (y + 1) * step;

  return [
    gridUVToScreen(u0, v0), // top-left
    gridUVToScreen(u1, v0), // top-right
    gridUVToScreen(u1, v1), // bottom-right
    gridUVToScreen(u0, v1)  // bottom-left
  ];
}

function drawCellHighlight(x, y) { // cell in column x and row y
  const corners = getCellCorners(x, y);

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();

  // 填充
  ctx.fillStyle = "rgba(0, 200, 255, 0.25)";
  ctx.fill();

  // 描边
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
  ctx.stroke();

  ctx.restore();
}

function drawFloatingTexts() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "20px serif";

  for (const ft of floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = "gold";
    ctx.fillText(ft.text, ft.x, ft.y);
  }

  ctx.restore();
}

function drawBackground() {
  const cw = canvasCSSWidth;
  const ch = canvasCSSHeight;

  const iw = bgImg.width;
  const ih = bgImg.height;

  bgScale = Math.min(cw / iw, ch / ih);

  const dw = iw * bgScale;
  const dh = ih * bgScale;

  const dx = (cw - dw) / 2; // 背景图左右居中
  const dy = 0;             // 背景图顶部贴canvas

  bgRect = { x: dx, y: dy, w: dw, h: dh };
  ctx.drawImage(bgImg, dx, dy, dw, dh);
}

function drawScene(farm = EMPTY_FARM) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  drawBackground();
  updateFieldFromCanvas();

  updateResource(farm.gold ?? 0, farm.time ?? 0);
  
  const grid = farm.grid ?? [];
  if (!grid.length) return;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cell = farm.grid[y][x];
      if (!cell) continue;

      const p = gridToScreen(x, y);

      // ⭐ hover highlight in row x and column y
      if (hoveredCell && hoveredCell.x === x && hoveredCell.y === y) {
        drawCellHighlight(x, y);
      }
      
      if (!cell.type) continue;
      drawCrop(cell, p);

      if (cell.maturity >= 1.0) {
        drawHarvestIndicator(p, p.depth);
      }
    }
  }
  
  drawFloatingTexts();
}

/* ---------- draw text animation ---------- */
let lastFrameTime = performance.now();

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];

    ft.y += ft.vy * dt;
    ft.life -= dt;

    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}

function animate(now) {
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  updateFloatingTexts(dt);
  drawScene(currentFarm);

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

async function bootstrap() {
  const res = await fetch("/api/bootstrap");
  const data = await res.json();

  GRID = data.config.grid;
  FIELD_RATIO = data.config.field_ratio;
  bgImg.src = data.config.background;
  EXEC_INTERVAL = data.config.exec_interval;
  
  currentFarm = data.farm;

  resizeCanvas();
}

bootstrap();

/* ============================================================
   Resource Display
============================================================ */

const resourceEl = document.getElementById("resource");

function updateResource(gold, time) {
  resourceEl.textContent = `💰 ${gold} | 🕒 ${time}`;
}

/* ============================================================
   WebSocket
============================================================ */

const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}/ws/run`);

let executionActive = false;
let executionMode = null;
let autoPaused = false;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function showScriptResult(r) {
  const roiPct = Math.round(r.roi * 100);

  let text = `
📊 Script Result
💸 Cost: ${r.cost}
💰 Gain: ${r.gain}
📈 ROI: ${roiPct}%
`;

  if (r.new_record) {
    text += "\n🏆 New Best ROI!";
  } else {
    text += `\n⭐ Best ROI: ${Math.round(r.best_roi * 100)}%`;
  }

  log(text);
}


ws.onopen = () => log("[system] connected");

ws.onmessage = async e => {
  const msg = JSON.parse(e.data);

  if (msg.type === "event") {
    highlightLine(msg.event.line);
    
    // draw floating text if gold is updated
    const goldDelta = msg.event.gold - currentFarm.gold
    if(goldDelta !== 0) {
        const p = gridToScreen(msg.event.x, msg.event.y);
        const sign = (goldDelta > 0) ? '+' :'';
        
        floatingTexts.push({
          x: p.x,
          y: p.y - 20,
          text: `${sign}${goldDelta} 💰`,
          life: 1.0,
          vy: -40
        });
    }

    if (executionMode === "auto_step" && !autoPaused) {
      await sleep(EXEC_INTERVAL);
      ws.send(JSON.stringify({ type: "ack" }));
    }
  }

  if (msg.type === "farm_state") {
    currentFarm = msg.farm;
    drawScene(currentFarm);
  }

  if (msg.type === "done") {
    executionActive = false;
    autoPaused = false;
    executionMode = null;
    
    clearHighlight();
    setButtonsIdle();
    
    if (msg.result) {
      showScriptResult(msg.result);
    }
  
    log("[system] done");
  }

  if (msg.type === "error") {
    log("[error] " + msg.message);
  }
};

/* ============================================================
   Buttons
============================================================ */

const runAllBtn = document.getElementById("runAllBtn");
const stepBtn = document.getElementById("stepBtn");
const stopBtn = document.getElementById("stopBtn");

function setButtonsRunning() {
  runAllBtn.disabled = false;
  stopBtn.disabled = false;
}

function setButtonsIdle() {
  runAllBtn.disabled = false;
  stopBtn.disabled = true;
  runAllBtn.textContent = "▶ Run";
}

function startExecution(mode) {
  executionActive = true;
  executionMode = mode;
  autoPaused = false;
  
  consoleEl.textContent = '';
  clearHighlight();
  setButtonsRunning();
}

runAllBtn.onclick = () => {
  // ① 还没执行 → Start
  if (!executionActive) {
    startExecution("auto_step");
    runAllBtn.textContent = "⏸ Pause";

    ws.send(JSON.stringify({
      type: "start",
      mode: "auto_step",
      code: editor.getValue()
    }));
    return;
  }

  // ② 正在执行 → Pause
  if (executionActive && !autoPaused) {
    autoPaused = true;
    runAllBtn.textContent = "▶ Resume";
    log("[system] paused");
    return;
  }

  // ③ 暂停中 → Resume
  if (executionActive && autoPaused) {
    autoPaused = false;
    runAllBtn.textContent = "⏸ Pause";
    log("[system] resumed");

    // 关键：恢复后立刻 ack 一次
    ws.send(JSON.stringify({ type: "ack" }));
  }
};


stepBtn.onclick = () => {
  if (!executionActive) {
    startExecution("manual_step");
    ws.send(JSON.stringify({
      type: "start",
      mode: "manual_step",
      code: editor.getValue()
    }));
  } else {
    ws.send(JSON.stringify({ type: "step" }));
  }
};

stopBtn.onclick = () => {
  if (!executionActive) return;
  ws.send(JSON.stringify({ type: "abort" }));
  
  executionActive = false;
  autoPaused = false;
  executionMode = null;
  
  clearHighlight();
  setButtonsIdle();
  log("[system] aborted");
};

/* ============================================================
   Draggable Divider (Left / Right Resize)
============================================================ */

const divider = document.getElementById("divider");
const leftPanel = document.getElementById("leftPanel");
const rightPanel = document.getElementById("rightPanel");

let dragging = false;

divider.addEventListener("mousedown", e => {
  dragging = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
});

window.addEventListener("mouseup", () => {
  dragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

window.addEventListener("mousemove", e => {
  if (!dragging) return;

  const minLeft = 280;
  const maxLeft = window.innerWidth - 300;

  let newLeftWidth = e.clientX;

  newLeftWidth = Math.max(minLeft, Math.min(maxLeft, newLeftWidth));

  leftPanel.style.width = newLeftWidth + "px";

  // ⭐ 很重要：Monaco + Canvas 都需要 resize
  editor.layout();
  resizeCanvas();
});

/* ============================================================
   Farm tooltip
============================================================ */
const tooltip = document.getElementById("cellTooltip");

// 二维叉积
function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

// 判断点是否在凸四边形内
function pointInQuad(p, quad) {
  let sign = 0;

  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;

    const c = cross(abx, aby, apx, apy);

    if (c === 0) continue; // 在边上，认为命中

    if (sign === 0) {
      sign = Math.sign(c);
    } else if (Math.sign(c) !== sign) {
      return false;
    }
  }
  return true;
}

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();

  const mx = (e.clientX - rect.left);
  const my = (e.clientY - rect.top);

  hoveredCell = null;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const quad = getCellCorners(x, y);

      if (pointInQuad({ x: mx, y: my }, quad)) {
        hoveredCell = { x, y };  // mouse hovers on a cell in column x and row y
        drawScene(currentFarm); // 触发重绘
        
        showTooltip({x: mx, y: my}, x, y);
        return;
      }
    }
  }

  hideTooltip();
  drawScene(currentFarm); // 移出所有格子
});

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function showTooltip(p, x, y) { // show info of a cell in column x and row y
  const cell = currentFarm.grid[y][x];

  let html = "";
  if (!cell || !cell.type) {
    html = `
      <b>Empty Plot</b><br>
      📍 Position: (${x}, ${y})<br>
      💧 Water: ${Math.round((cell?.water ?? 0) * 100)}%<br>
      🌱 Nutrition: ${Math.round((cell?.nutrition ?? 0) * 100)}%
    `;
  } else {
    const waterPct = Math.round((cell.water ?? 0) * 100);
    const nutritionPct = Math.round((cell.nutrition ?? 0) * 100);

    let maturityDisplay = "";
    if ((cell.maturity ?? 0) >= 1) {
      maturityDisplay = ` <span class="tick">✔</span>`;
    } else {
      maturityDisplay = ` (${Math.round((cell.maturity ?? 0) * 100)}%)`;
    }

    html = `
      <b>${capitalize(cell.type)}${maturityDisplay}</b><br>
      📍 Position: (${x}, ${y})<br>
      💧 Water: ${waterPct}%<br>
      🌱 Nutrition: ${nutritionPct}%
    `;
  }

  tooltip.innerHTML = html;
  tooltip.style.left = `${p.x}px`;
  tooltip.style.top = `${p.y - 12}px`;  // tooltip above mouse cursor icon
  tooltip.classList.remove("hidden");
}

function hideTooltip() {
  tooltip.classList.add("hidden");
}

canvas.addEventListener("mouseleave", () => {
  hoveredCell = null;
  hideTooltip();
  drawScene(currentFarm);
});

/* ============================================================
   About Panel
============================================================ */
const aboutBtn = document.getElementById("aboutBtn");
const aboutPanel = document.getElementById("aboutPanel");

aboutBtn.onclick = (e) => {
  e.stopPropagation();
  aboutPanel.classList.toggle("hidden");
};

// 点击页面其它地方自动关闭
document.addEventListener("click", () => {
  aboutPanel.classList.add("hidden");
});

/* ============================================================
   Init
============================================================ */

bgImg.onload = () => drawScene(currentFarm);

