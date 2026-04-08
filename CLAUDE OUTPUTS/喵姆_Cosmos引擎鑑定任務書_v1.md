# 喵姆看盤 — Cosmos 概率雲引擎：鑑定與實作任務書

> **用途**：請你（AI 鑑定者）針對本任務書進行評估、修正公式、撰寫程式碼與企劃書章節
> **產生日期**：2026-03-19
> **背景文件**：本任務書是「喵姆看盤 v48 升級邏輯企劃書」的子任務，聚焦 Phase 2.5

---

## 1. 背景：喵姆是什麼

喵姆是一個 **AI 驅動的台股綜合判斷系統**，核心引擎為 `miaomu_engine_v2.py`，用七個維度對每支股票進行評分（1-10 分），最終輸出 BUY / SELL / WAIT 判斷。

### 1.1 七維度現況

| # | 維度名稱 | role_name（JSON key）| 資料狀態 |
|---|---------|---------------------|---------|
| 1 | 財報真實性 | `"財報真實性"` | ✅ 有 2 季 FinMind 財報 |
| 2 | 籌碼結構 | `"籌碼結構"` | ✅ 有 10 日法人/融資融券 |
| 3 | 技術面診斷 | `"技術面診斷"` | ✅ 有 120 日歷史價格 |
| 4 | 市場情緒 | `"市場情緒"` | ❌ 永遠 fallback 5/10 |
| 5 | 惡魔代言人 | `"惡魔代言人"` | ✅ 依賴前四維 |
| 6 | 產業結構 | `"產業結構"` | ❌ 永遠 fallback 5/10 |
| 7 | 先行指標 | `"先行指標"` | ❌ 永遠 fallback 5/10 |

**關鍵事實**：七維中有三維永遠返回 5/10 neutral，使得最終判斷被大量空氣數據稀釋。

### 1.2 提案：Cosmos 概率雲引擎

外部 AI（Grok）提議：把七維分數轉換為 GBM 的 mu（年化漂移率）和 sigma（波動率），跑 Monte Carlo 模擬，輸出「宇宙勝率 + 價格區間 + 失效條件」。

**定位**：七維判斷的輔助概率表達層，不取代原有引擎。

---

## 2. 已驗證的三大問題（用 Python 實際跑過數據）

### 問題一：Fallback 排除機制有斷崖

原始修正版用 `if fin_score == 5.0: fin_weight = 0` 做排除。驗證結果：

| fin_score | mu | 說明 |
|-----------|------|------|
| 5.0 | 0.1061 | 被排除，fin_weight=0 |
| 5.1 | 0.1566 | 沒被排除，跳了 +0.0505 |
| 8.0 | 0.1854 | 比 5.1 只多 0.0287 |

5.0→5.1 的跳躍比 5.1→8.0 還大。engine 如果有 ±0.1 的浮點誤差，Monte Carlo 結果就會劇烈翻轉。

**要求**：用平滑衰減函數取代硬門檻，或在 engine 層加入明確的 `is_fallback` 旗標。

### 問題二：完全忽略估值

同樣的 fin/chip/tech/growth 分數，PE 10 倍和 PE 50 倍的股票算出完全一樣的 mu 和 sigma。

**要求**：必須加入估值因子。方向：估值越高 → mu 越低（預期報酬打折）。

### 問題三：mu 地板導致垃圾股也有 ~46% 勝率

原始修正版 `mu = max(0.02, ...)`，導致全部最差的股票（fin=1, chip=1, tech=1, growth=-30%, PE=99th）仍有 45.5% 勝率。

**要求**：允許 mu 為負值（例如地板 -0.10），或在 mu < 0 時直接觸發 SELL 不跑 Monte Carlo。

### 補充：sigma 與成長率方向已修正

原始版讓「成長越高 → sigma 越低」（反直覺），修正版已改為正向關係。此問題已解決，但請確認你的版本維持此修正。

---

## 3. 認同的三個方向（必須保留）

1. **七維分數 → mu/sigma → Monte Carlo** 的整體架構正確
2. **輸出「勝率 + 價格區間」** 比 BUY/SELL/WAIT 更有資訊量
3. **動態產生 reason**（從各維度分數判斷強弱項）優於寫死字串

---

## 4. 真實資料結構（請嚴格按照此結構設計）

### 4.1 role_outputs（來自 miaomu_engine_v2 → stock_updater → daily_analysis.json）

```json
[
  {
    "role_name": "財報真實性",
    "score": 5,
    "signal": "neutral",
    "plain_text": "財報資料不足",
    "key_finding": "資料不足",
    "mekak": "需補齊至少兩季數據"
  },
  {
    "role_name": "籌碼結構",
    "score": 3.5,
    "signal": "neutral",
    "plain_text": "正常回檔",
    "key_finding": "外資-47820444張｜融資0張｜價-1.9%",
    "mekak": "外資淨買力密度 146.9%，堅定"
  },
  {
    "role_name": "技術面診斷",
    "score": 5.0,
    "signal": "neutral",
    "plain_text": "站上季線",
    "key_finding": "RSI 38｜MACD 空｜多頭排列",
    "mekak": "趨勢強度 中，關注 1737.67 支撐"
  },
  {
    "role_name": "市場情緒",
    "score": 5.0,
    "signal": "neutral",
    "plain_text": "情緒面中性。",
    "key_finding": "情緒 +0.0｜stable｜法說會 +0%",
    "mekak": "情緒面中性，無明顯眉角"
  },
  {
    "role_name": "惡魔代言人",
    "score": 5.0,
    "signal": "neutral",
    "plain_text": "...",
    "key_finding": "...",
    "mekak": "..."
  },
  {
    "role_name": "產業結構",
    "score": 5.0,
    "signal": "neutral",
    "plain_text": "資料不足",
    "key_finding": "需外部AI補充",
    "mekak": "..."
  },
  {
    "role_name": "先行指標",
    "score": 5.0,
    "signal": "neutral",
    "plain_text": "資料不足",
    "key_finding": "需外部AI補充",
    "mekak": "..."
  }
]
```

**注意**：
- `role_name` 是中文
- 沒有 `is_fallback` 欄位（需要你的 code 自行判斷，建議邏輯：`plain_text` 包含「資料不足」或 `key_finding` 包含「資料不足」或「未提供」→ 視為 fallback）
- `score` 範圍 1-10，5 分 = neutral/中性
- `signal` 可為 "bullish" / "bearish" / "neutral" / "danger"

### 4.2 stock dict（daily_analysis.json 中每支股票的頂層結構）

```json
{
  "代號": "2330",
  "名稱": "台積電",
  "收盤價": 1850.0,
  "漲跌幅": -2.89,
  "評分": 4.9,
  "建議": "觀望",
  "建議類別": "wait",
  "本益比": 30.1,
  "股價淨值比": 9.55,
  "殖利率": 1.1,
  "估值狀態": "⚠️本益比偏高",
  "營收表現": "營收持平",
  "role_analysis": {
    "final_direction": "wait",
    "confidence": "LOW",
    "role_outputs": [ ... ]
  },
  "price_history": [
    {"time": "2026-03-19", "open": 1875.0, "high": 1880.0, "low": 1850.0, "close": 1850.0, "volume": 38564629}
  ],
  "triggers": ["外資-47820444張｜融資0張｜價-1.9%"],
  "invalidation": "若股價跌破 1737.67，或任一否決條件觸發，裁決失效"
}
```

**注意**：
- `本益比` 目前有值（30.1），但來源不穩定（從舊資料繼承，非即時計算）
- **沒有** `monthly_revenue_growth` 欄位（Phase 1 才會加入）
- **沒有** `pe_percentile_5y` 欄位（需要你的 code 自行從歷史 PE 計算，或作為新增欄位提議）
- `price_history` 有 60 天 OHLCV

### 4.3 market_context.regime（已存在）

```json
{
  "regime": "正常波動",
  "emoji": "📊",
  "confidence": 0.6,
  "action": "依既有策略操作"
}
```

---

## 5. 你的任務（請完整交付 A、B、C、D）

### A. 重新設計修正版公式

1. 必須解決第 2 節的三大問題
2. 請用 LaTeX 或清楚的數學符號呈現公式
3. 所有人為設定的係數必須標註「**待校準**：需用 2018-2025 台股歷史資料回測」
4. 說明 fallback 的判斷邏輯（建議：從 `plain_text` / `key_finding` 檢測「資料不足」字串）

### B. 提供完整的 MiaomuCosmosEngine 程式碼

1. 完整可執行的 Python 程式碼（不可只給偽代碼）
2. 直接使用第 4 節的真實資料結構作為輸入
3. 功能必須包含：
   - mu/sigma 從 role_outputs 動態計算
   - Monte Carlo 模擬（建議 2000-5000 次）
   - 輸出：宇宙勝率、P10/P50/P90 價格區間
   - 動態 reason（從各維度分數自動判斷哪些值得提）
   - 失效條件生成（基於最弱維度或最大風險因子）
4. 包含 type hints、詳細中文註解
5. 保留未來回測校準的擴充空間（係數集中定義為常數）
6. 處理缺失資料（例如 `本益比` 為空字串時的 fallback）

### C. 撰寫 Phase 2.5 企劃書章節

以「**Phase 2.5：Cosmos 概率雲引擎**」為標題，撰寫完整 Markdown 章節，需包含：

1. 提出此機制的目的（把七維分數翻譯成普通人的語言）
2. 原始設計的優點（3 點）
3. 已發現的三大問題（含數據驗證結果）
4. 修正版公式的設計原則
5. 待回測校準事項清單
6. 正反意見整理（含對 GBM 簡化假設的風險說明）
7. 在系統中的定位（明確為輔助層）

### D. 整體評估

請明確給出以下三選一結論：
- **值得投入**
- **暫不值得投入**
- **有條件投入**

並說明：
- 潛在優勢
- 潛在風險（特別是「虛假精確度」的問題）
- 最適合的產品定位
- 建議的實作優先級（Phase 2.5 應該在 Phase 0/1/2 的哪個階段之後才做？）

---

## 6. 驗收標準

你的回答必須符合以下條件才算合格：

- [ ] Fallback 維度不以 5/10 有效中性訊號直接參與 mu/sigma 計算
- [ ] 估值因子明確影響 mu（方向：估值越高 → mu 越低）
- [ ] 成長率對 sigma 為正向關係（高成長 → 高波動）
- [ ] mu 允許為負值（垃圾股不應被保護為正報酬預期）
- [ ] 程式碼使用第 4 節的真實資料結構（中文 key、無 is_fallback 欄位）
- [ ] 所有未經回測的係數明確標註「待校準」
- [ ] 輸出包含：宇宙勝率、價格區間、動態 reason、失效條件
- [ ] 提供完整可執行的 Python（非偽代碼）

---

## 7. 額外上下文（非必讀，但有助理解）

### 裁決引擎現有邏輯（VerdictEngineV2）

```
一票否決：
  財報真實性 < 3 → SELL 或 WAIT
  籌碼 danger + anomaly ≥ 8 → SELL
  產業敘事崩塌 → SELL

正常裁決：
  4 基礎維度中 ≥3 bullish → BUY
  ≥3 bearish → SELL
  其他 → WAIT

深度調整：
  惡魔代言人 < 4 且 BUY → 降為 WAIT
  產業結構 ≥ 8 且 BUY → 信心升 HIGH
```

### 目前的最終評分計算

```python
scores = [d.score for d in all_dims if d.score is not None]
result["評分"] = round(sum(scores) / len(scores), 1)
# → 7 維簡單平均，3 個永遠 5 分，拉低所有有效信號
```

### 技術棧限制

- 純 Python（無 ML 框架）
- numpy 可用
- 無付費 API（只有 FinMind + TWSE OpenAPI）
- 部署在 GitHub Pages（靜態），排程用 cron
- 每日更新 20-30 支股票

---

> **請開始作業。交付 A、B、C、D 四項完整輸出。**
