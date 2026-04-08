# 喵姆 V36 → V37 升級指令書（給 Anti-Gravity）

> ⚠️ 這份文件是完整的交接指令。請從頭到尾讀完再開始動作。
> 日期：2026-03-07
> 交接者：Claude (Cowork)
> 接手者：Anti-Gravity (或任何 AI Agent)

---

## 第零步：備份 V36

在做任何修改前，先執行：
```bash
cp index_v36.html archive/index_v36_20260307.html
```
確認 archive 裡有完整備份，再開始 V37 工作。

---

## 一、目前 V36 的完整結構（你需要知道的）

### 檔案
- **主檔案**：`index_v36.html`（1700 行，純前端 HTML/CSS/JS 單檔）
- **無後端**：所有資料靠 JSON API (`https://kirin-api.deno.dev/stock/{code}`) + localStorage
- **圖表庫**：LightweightCharts v4.1.0（CDN）

### 佈局：三欄式 CSS Grid
```
┌────────────────────────────────────────────────┐
│ Topbar (44px)：Logo + 股票導航 + 🔄刷新 + ⚙️後台 │
├──────┬───────────────────────┬──────────────────┤
│ 左欄  │       中欄            │     右欄          │
│180px │       1fr             │     310px         │
│      │                       │                    │
│股票清單│  K線圖 + 工具列      │  裁決英雄卡        │
│(含篩選)│                      │  💼我的持股         │
│      │                       │  收折面板群：        │
│      │                       │   - 基本面          │
│      │                       │   - 技術面          │
│      │                       │   - 籌碼面          │
│      │                       │   - AI怎麼判斷的    │
│      │                       │   - AI運算過程      │
│      │                       │   - 回測績效        │
│      │                       │   - 資金配置建議    │
└──────┴───────────────────────┴──────────────────┘
```

### 關鍵 JS 變數和函數（行號）

**核心資料：**
- `STOCK_INDEX` (L419)：33支股票的陣列 `[{c:"2330",n:"台積電",s:9.5,a:"action-buy"}, ...]`
- `currentCode` (L421)：當前選中的股票代號
- `currentData` (L422)：當前股票的完整 JSON 資料

**載入流程：**
- `loadStock(code)` (L471)：fetch API → 存 currentData → `renderAll()`
- `renderAll()` (L503)：依序呼叫 renderInfoRow → renderChart → renderVerdict → renderAccordions → renderMyHolding

**右側面板渲染：**
- `renderVerdict(s)` (L854)：裁決英雄卡（BUY/SELL/WAIT + 信心分數）
- `renderAccordions(s)` (L1101)：所有收折面板
- `renderMyHolding(s)` (L1115)：💼 我的持股卡片
- `renderAnalystAccordion(s)` (L1156)：三方分析師面板
- `renderSevenDimAccordion(s)` (L1229)：七維雷達圖
- `renderBacktestAccordion(s)` (L1287)：回測績效
- `buildKellyDetails(s)` (L999)：Kelly 公式資金配置
- `kellyAmt(base)` (L1067)：Kelly 金額計算輔助函數

**後台管理（L1402-1700）：**
- `openAdmin()` / `closeAdmin()`：overlay modal 開關
- 四個 tab：持股管理、股票池、投資檔案、風控儀表板
- localStorage keys：`mm_portfolio`、`mm_watchlist`、`mm_profile`
- `getPortfolio()` / `savePortfolioData(arr)`
- `getWatchlist()` / `saveWatchlistData(arr)`
- `getProfile()` / `saveProfile()`
- `applyWatchlistToIndex(list)`：動態重建 STOCK_INDEX + 重新渲染 sidebar

**技術指標計算（L546-635）：**
- `calcMA(data, period)`、`calcRSI(data, period)`、`calcEMA(data, period)`、`calcMACD(data)`

### API 資料格式

`currentData` (即 `s`) 的主要欄位：
```json
{
  "股票代號": "2330",
  "股票名稱": "台積電",
  "收盤價": 1050,
  "漲跌幅": 1.2,
  "成交量": 32456,
  "本益比": 28.5,
  "外資買賣超": 5000,
  "投信買賣超": 200,
  "自營商買賣超": -100,
  "RSI": 62.3,
  "MACD_OSC": 0.45,
  "MA20": 1020,
  "MA60": 980,
  "AI_評分": 9.5,
  "AI_建議": "BUY",
  "AI_信心": 78,
  "分析摘要": "...",
  "price_history": [{"time":"2026-01-01","open":1000,"high":1010,"low":995,"close":1005,"volume":25000}, ...],
  "回測": {"勝率":65,"獲利因子":1.8,"最大回撤":-12,"年化報酬":18},
  "Kelly": {"optimal":15.2,"half":7.6,"win_rate":0.65,"payoff_ratio":1.8}
}
```

### CSS 設計系統
```css
:root {
  --bg:#0b0f14; --surface:#111820; --raised:#1a2330; --border:#1e2d3d;
  --cyan:#38bdf8; --green:#34d399; --red:#f87171; --amber:#fbbf24;
  --purple:#a78bfa; --text:#e2e8f0; --sub:#64748b; --dimmer:#475569;
}
```
所有新增元素必須使用這些 CSS 變數，保持視覺一致性。

---

## 二、V37 要新增的東西（按優先順序）

### ✅ 任務 1：殖利率 + EPS 加進右側面板

**位置**：在 `renderAccordions(s)` 函數中，在基本面收折面板裡面新增。

**需要的資料欄位**（如果 API 沒有，先用預設值或從公開資訊觀測站抓）：
- `s['殖利率']` 或 `s['dividend_yield']`：百分比
- `s['EPS']` 或 `s['eps_ttm']`：近四季合計 EPS

**顯示格式**：
```html
<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
  <span style="color:var(--sub)">每年配息回報率</span>
  <span style="color:var(--green);font-weight:700">4.2%</span>
</div>
<div style="display:flex;justify-content:space-between;padding:6px 0;">
  <span style="color:var(--sub)">每股獲利 (EPS)</span>
  <span style="font-weight:700">42.3 元</span>
</div>
```

**白話教學提示**（加在數字下方）：
```html
<div style="color:var(--dimmer);font-size:11px;margin-top:6px;">
  💡 殖利率 > 4% 且 EPS 連續成長 = 體質不錯的標的
</div>
```

---

### ✅ 任務 2：情境式教學提示

在每個收折面板底部加一行淡色教學文字，告訴用戶「這段資料怎麼用」：

| 面板 | 教學提示 |
|------|---------|
| 基本面 | 💡 殖利率和 EPS 是「公司賺不賺錢」的最直接指標，看趨勢比看單一數字重要 |
| 技術面 | 💡 均線之上＝中期趨勢偏多，RSI > 70 不一定要賣，但要提高警覺 |
| 籌碼面 | 💡 外資連續買 ≠ 一定漲，但連續賣 + 技術破線 = 危險信號 |
| 資金配置建議 | 💡 Kelly 公式算的是「最佳」比例，實務上建議只用建議值的 1/4 到 1/2 |
| AI 怎麼判斷的 | 💡 如果三個分析師意見不一致，代表訊號不明確，專業做法是「不動作」|
| 回測績效 | 💡 過去績效不代表未來，但勝率 > 60% + 獲利因子 > 1.5 是不錯的起點 |

**實作方式**：在每個 accordion 的 innerHTML 最後面 append：
```javascript
html += '<div style="color:var(--dimmer);font-size:11px;padding:8px 0 2px;border-top:1px solid var(--border);margin-top:8px;">💡 教學提示文字</div>';
```

---

### ✅ 任務 3：「明日預報」卡片（右側面板最上方）

**位置**：在 `renderAll()` 函數中，在 `renderVerdict(s)` 之前插入。

**新函數 `renderForecast()`：**
```javascript
function renderForecast() {
  // 先移除舊卡片
  var old = document.getElementById('forecastCard');
  if (old) old.remove();

  // 從 localStorage 讀取預報資料（由外部 AI 寫入）
  var forecast = null;
  try { forecast = JSON.parse(localStorage.getItem('mm_forecast')); } catch(e){}

  if (!forecast) {
    // 沒有預報資料時，顯示預設的「已知事件日曆」
    forecast = getScheduledEvents(); // 靜態排程事件
  }

  var card = document.createElement('div');
  card.id = 'forecastCard';
  card.style.cssText = 'background:linear-gradient(135deg,#0d1a2f,#1a1040);border:1px solid var(--purple);border-radius:12px;padding:14px;margin-bottom:10px;';

  var riskColor = forecast.risk === '平靜' ? 'var(--green)' :
                  forecast.risk === '微波' ? 'var(--amber)' : 'var(--red)';
  var riskEmoji = forecast.risk === '平靜' ? '🟢' :
                  forecast.risk === '微波' ? '🟡' : '🔴';

  card.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<span style="font-weight:800;font-size:13px;">📅 明日預報</span>' +
      '<span style="font-size:11px;color:var(--dimmer);">' + (forecast.date || '今日') + '</span>' +
    '</div>' +
    '<div style="margin-top:8px;display:flex;gap:8px;">' +
      '<div style="flex:1;background:rgba(0,0,0,.2);border-radius:8px;padding:8px;text-align:center;">' +
        '<div style="font-size:10px;color:var(--sub);">全球風險</div>' +
        '<div style="font-size:16px;margin-top:2px;">' + riskEmoji + '</div>' +
        '<div style="font-size:11px;color:' + riskColor + ';">' + forecast.risk + '</div>' +
      '</div>' +
      '<div style="flex:1;background:rgba(0,0,0,.2);border-radius:8px;padding:8px;text-align:center;">' +
        '<div style="font-size:10px;color:var(--sub);">歷史對照</div>' +
        '<div style="font-size:11px;margin-top:4px;color:var(--purple);">' + (forecast.pattern || '—') + '</div>' +
      '</div>' +
    '</div>' +
    (forecast.events && forecast.events.length > 0 ?
      '<div style="margin-top:8px;font-size:11px;">' +
        '<div style="color:var(--sub);margin-bottom:4px;">⚡ 關鍵事件</div>' +
        forecast.events.map(function(e) {
          return '<div style="color:var(--dimmer);padding:2px 0;">• ' + e + '</div>';
        }).join('') +
      '</div>' : '') +
    (forecast.blindspot ?
      '<div style="margin-top:8px;font-size:11px;color:var(--red);background:rgba(239,68,68,.08);border-radius:6px;padding:6px 8px;">' +
        '😈 ' + forecast.blindspot +
      '</div>' : '') +
    '<details style="margin-top:8px;">' +
      '<summary style="font-size:11px;color:var(--purple);cursor:pointer;">▶ 展開完整預報</summary>' +
      '<div style="font-size:11px;color:var(--sub);margin-top:6px;white-space:pre-line;">' + (forecast.detail || '尚無完整預報') + '</div>' +
    '</details>';

  // 插入到右側面板最上方
  var rightPanel = document.querySelector('.right-panel') || document.getElementById('rightPanel');
  if (rightPanel) rightPanel.insertBefore(card, rightPanel.firstChild);
}

// 靜態排程事件（Phase 1 先用這個）
function getScheduledEvents() {
  var today = new Date();
  var dow = today.getDay(); // 0=Sun
  var events = [];

  // 每月固定事件
  var day = today.getDate();
  if (day >= 1 && day <= 10) events.push('台灣上月營收公布期（1-10 日）');
  if (day >= 10 && day <= 15) events.push('美國 CPI 通常本週公布');

  // 每週固定
  if (dow === 3) events.push('美國 Fed 褐皮書（如有排程）');
  if (dow === 4) events.push('美國初次請領失業金（每週四）');
  if (dow === 5) events.push('台股週五結算日留意波動');

  // 每季固定
  var month = today.getMonth();
  if ([0,3,6,9].indexOf(month) >= 0 && day >= 15) events.push('財報季：留意法說會');

  return {
    date: (month+1) + '/' + day,
    risk: '平靜',
    pattern: '無明顯歷史對照',
    events: events.length > 0 ? events : ['今日無重大已知事件'],
    blindspot: '注意未預期的央行發言或地緣衝突',
    detail: '此為靜態排程事件。接入 GDELT API 後將顯示即時全球風險分析。'
  };
}
```

**在 `renderAll()` 中加入呼叫：**
```javascript
function renderAll() {
  var s = currentData || {};
  renderInfoRow(s);
  renderChart(s);
  renderInvBar(s);
  renderForecast();        // ← 新增：明日預報（最上方）
  renderVerdict(s);
  renderReasons(s);
  renderActionNums(s);
  renderAccordions(s);
  renderMyHolding(s);
}
```

---

### ✅ 任務 4：後台新增「預報設定」Tab

在後台 admin panel 的四個 tab 旁邊加第五個 tab：`預報設定`

內容：
1. **GDELT API Key**（目前免費不需要 key，但預留欄位）
2. **FRED API Key** 輸入框（免費申請：https://fred.stlouisfed.org/docs/api/api_key.html）
3. **手動輸入明日事件** 的文字區域（textarea）
4. **手動貼入 Perplexity 分析結果** 的文字區域
5. **「更新預報」按鈕** → 把輸入的內容存進 `localStorage.setItem('mm_forecast', JSON.stringify({...}))`

這樣用戶在等 API 自動化之前，可以手動貼入 Perplexity 的分析結果，系統會自動顯示在明日預報卡片。

---

### ✅ 任務 5：恐慌/貪婪自動提示

在 `renderVerdict(s)` 函數中，加入情境判斷：

```javascript
// 在裁決英雄卡下方加入情境提示
var tips = [];
if (s['RSI'] && s['RSI'] < 30) {
  tips.push('📉 RSI 極低（' + s['RSI'].toFixed(0) + '）— 市場可能過度恐慌。歷史上 RSI < 30 時買入，6 個月正報酬機率約 70%');
}
if (s['RSI'] && s['RSI'] > 80) {
  tips.push('📈 RSI 極高（' + s['RSI'].toFixed(0) + '）— 短線可能過熱，獲利了結的紀律比追高重要');
}
if (s['漲跌幅'] && s['漲跌幅'] < -5) {
  tips.push('🔴 今日大跌 ' + s['漲跌幅'].toFixed(1) + '%。如果公司基本面沒變，這可能是機會。建議：分批、用閒錢、確認現金水位');
}
if (s['外資買賣超'] && s['外資買賣超'] < -10000) {
  tips.push('🏦 外資大幅賣超 ' + Math.abs(s['外資買賣超']).toLocaleString() + ' 張。不一定要跟著賣，但要確認是「換股」還是「逃跑」');
}
```

---

## 三、不要動的東西（請保留原樣）

1. ⚙️ 後台 button 和整個 admin overlay（L253, L1402-1700）
2. STOCK_INDEX 的初始值（L419）
3. loadStock / renderAll 的呼叫順序
4. renderMyHolding 函數
5. localStorage keys（mm_portfolio、mm_watchlist、mm_profile）
6. kellyAmt 函數和 Kelly 面板
7. 所有 CSS 變數和配色系統
8. LightweightCharts 相關程式碼

---

## 四、未來 Phase 2-3（先不做，但預留架構）

### GDELT API 接入（Phase 2）
```
Endpoint: https://api.gdeltproject.org/api/v2/doc/doc?query=Taiwan%20semiconductor&mode=artlist&maxrecords=20&format=json
```
- 每 15 分鐘 fetch 一次
- 解析 `articles[].tone`（情緒分數）和 `articles[].themes`（主題標籤）
- 計算衝突分數移動平均

### FRED API 接入（Phase 2）
```
Endpoint: https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key={KEY}&file_type=json
```
- 關鍵 series：VIXCLS（VIX）、T10Y2Y（殖利率曲線）、UNRATE（失業率）

### 歷史模式比對引擎（Phase 3）
- 建立 2008-2026 的「情境指紋」資料庫（JSON）
- 每個指紋包含：VIX 區間、殖利率斜率、外資連續天數、恐慌指數
- 用餘弦相似度找最像的 5 個歷史時期
- 統計那些時期之後 1 週/1 月/3 月的走勢

---

## 五、測試 Checklist

完成 V37 後，請驗證以下功能：

- [ ] V36 備份存在於 `archive/index_v36_20260307.html`
- [ ] 殖利率和 EPS 顯示在基本面面板
- [ ] 每個收折面板底部有教學提示
- [ ] 明日預報卡片顯示在右側面板最上方
- [ ] 後台「預報設定」tab 可以手動輸入事件
- [ ] 手動輸入的預報內容正確顯示在明日預報卡片
- [ ] RSI < 30 或 > 80 時自動顯示情境提示
- [ ] 大跌日（漲跌幅 < -5%）顯示「恐慌時貪婪」提示
- [ ] 所有原有功能正常（K線圖、裁決卡、籌碼面板、後台管理）
- [ ] 手機版 RWD 排版沒壞

---

## 六、完整參考文件位置

| 文件 | 路徑 | 用途 |
|------|------|------|
| V36 主檔案 | `index_v36.html` | 要修改的檔案 |
| AI 分工表 | `AGENT_INSTRUCTIONS.md` | 七維引擎 + AI 代理架構 |
| 產品說明 | `喵姆看盤情報_產品特色完整說明.md` | 產品願景和設計原則 |
| 明日預報藍圖 | `喵姆_明日預報系統_整合藍圖.md` | 完整系統設計（含資料源對應表）|
| 投資委員會 Demo | uploads/`miao_mu_investment_committee_v2.html` | 七個代理投票 UI 參考 |
| 角色 Prompt | `modules/role_prompts.py` | AI 角色的 System Prompt |
| 角色分析器 | `modules/role_analyzers_v31.py` | 角色分析邏輯 |

---

## 七、給 KIRIN 的一句話

> V37 的核心就是：在 V36 已有的分析基礎上，加上「往前看」的能力——明日預報、歷史比對、情境教學。讓你不只知道「現在怎樣」，還知道「接下來可能怎樣」和「歷史上類似的時候怎樣了」。

---

*交接完畢。Anti-Gravity，請開始。*
