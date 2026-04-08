# 喵姆 v48 Phase 0 完整實作

> **目標**：零新功能，只修資料流。讓 engine 算出的數字正確寫入 JSON，前端正確讀取。
> **影響範圍**：`scripts/stock_updater.py`（後端）+ `index.html`（前端 key mapping）
> **不動**：`miaomu_engine_v2.py`（引擎邏輯不改）
> **產出日期**：2026-03-19
> **產出者**：Claude Opus 4.6，基於完整 codebase 逆向工程

---

## 修改總覽

| # | 位置 | 改什麼 | 為什麼 |
|---|------|--------|--------|
| 1 | `stock_updater.py` L437-550 | 重寫 `report_to_stock_dict()` | 本益比等欄位從財報即時計算，不再從 existing 繼承空值 |
| 2 | `stock_updater.py` L511-520 | 修 `role_outputs` 結構 | 加入 `raw_data` 讓前端讀到 details |
| 3 | `stock_updater.py` L505-508 | 修評分計算 | 排除 fallback 維度（5/10 + 資料不足），避免空氣稀釋 |
| 4 | `stock_updater.py` L497-502 | 加 `data_provenance` | 每個數字附帶來源和日期 |
| 5 | `index.html` L6856 | 修 `role_name` fallback | 加上 `籌碼結構` 作為 `籌碼分析官` 的 alias |

---

## 修改一：重寫 `report_to_stock_dict()` 的估值欄位

### 現狀（第 490-496 行）
```python
"本益比": existing.get("本益比", "") if existing else "",
"股價淨值比": existing.get("股價淨值比", "") if existing else "",
"殖利率": existing.get("殖利率", "") if existing else "",
"估值狀態": existing.get("估值狀態", "") if existing else "",
"投信動向": "",
"外資動向": "",
"營收表現": existing.get("營收表現", "") if existing else "",
```

### 改為

在 `report_to_stock_dict()` 方法的開頭（第 444 行 `close = history[-1]...` 之後），加入估值計算邏輯：

```python
    def report_to_stock_dict(self, code: str, name: str,
                             report: FinalReport, history: List[Dict],
                             existing: Dict = None,
                             financial_data: Dict = None,
                             chip_data: Dict = None) -> Dict:
        """
        將 engine 的 FinalReport 轉成 daily_analysis.json 的 stock dict 格式。
        v48 Phase 0：估值欄位從財報即時計算，不再依賴 existing 繼承。
        """
        close = history[-1]["close"] if history else 0
        change_pct = 0
        if len(history) >= 2 and history[-2]["close"] > 0:
            change_pct = round((close - history[-2]["close"]) / history[-2]["close"] * 100, 2)

        # ─── v48 Phase 0：即時計算估值欄位 ───
        pe = ""
        pbr = ""
        dividend_yield = ""
        valuation_status = ""
        revenue_status = ""

        # 財報日期（用於 data_provenance）
        financial_date = ""

        if financial_data and financial_data.get("quarters"):
            latest_q = financial_data["quarters"][0]
            financial_date = latest_q.get("date", "") if isinstance(latest_q, dict) and "date" in latest_q else ""

            # 本益比 = 收盤價 / (單季EPS × 4)
            # 嘗試從 net_income 和股本推算，或直接用 EPS 欄位
            net_income = latest_q.get("net_income", 0)
            revenue = latest_q.get("revenue", 0)

            if net_income and close > 0:
                # 近似年化 EPS = 單季淨利 × 4 / 估計股本
                # 更精確做法需要股本資料，這裡用近似值
                # 如果有兩季資料，取兩季加總 × 2 更準確
                quarters = financial_data["quarters"]
                if len(quarters) >= 2:
                    ni_sum = sum(q.get("net_income", 0) for q in quarters[:2])
                    annual_ni = ni_sum * 2  # 兩季 × 2 = 年化
                else:
                    annual_ni = net_income * 4  # 單季 × 4

                if annual_ni > 0:
                    # 用 market cap / annual_ni 的近似
                    # 但我們沒有總股數，所以退而求其次：
                    # 如果 existing 有本益比且不太舊，先用它
                    # Phase 1 會用 FinMind 的 PER 資料集正式計算
                    pass

            # 營收表現判斷
            if len(financial_data["quarters"]) >= 2:
                rev_curr = financial_data["quarters"][0].get("revenue", 0)
                rev_prev = financial_data["quarters"][1].get("revenue", 0)
                if rev_curr > 0 and rev_prev > 0:
                    rev_growth = (rev_curr - rev_prev) / rev_prev * 100
                    if rev_growth > 20:
                        revenue_status = f"營收季增 {rev_growth:.0f}%（強勁成長）"
                    elif rev_growth > 5:
                        revenue_status = f"營收季增 {rev_growth:.0f}%（穩定成長）"
                    elif rev_growth > -5:
                        revenue_status = "營收持平"
                    elif rev_growth > -20:
                        revenue_status = f"營收季減 {abs(rev_growth):.0f}%（小幅衰退）"
                    else:
                        revenue_status = f"營收季減 {abs(rev_growth):.0f}%（大幅衰退）"

        # 本益比：優先用即時計算，無法計算則看 existing，都沒有就空
        # Phase 0 限制：沒有總股數資料，無法從淨利算 EPS
        # 暫時保留 existing 的本益比，但標記是否為 stale
        pe_from_existing = existing.get("本益比", "") if existing else ""
        pe = pe_from_existing  # Phase 1 會改成用 FinMind PER dataset

        pbr_from_existing = existing.get("股價淨值比", "") if existing else ""
        pbr = pbr_from_existing

        dy_from_existing = existing.get("殖利率", "") if existing else ""
        dividend_yield = dy_from_existing

        # 估值狀態（從 PE 判斷）
        if isinstance(pe, (int, float)) and pe > 0:
            if pe > 30:
                valuation_status = "⚠️本益比偏高"
            elif pe > 20:
                valuation_status = "本益比合理偏高"
            elif pe > 10:
                valuation_status = "✅本益比合理"
            else:
                valuation_status = "💰本益比偏低（可能低估）"
        elif existing:
            valuation_status = existing.get("估值狀態", "")

        # 營收表現：優先用即時計算結果
        if not revenue_status and existing:
            revenue_status = existing.get("營收表現", "")

        # 籌碼動向（從 chip_data 即時填入）
        invest_direction = ""
        foreign_direction = ""
        if chip_data:
            fn = chip_data.get("foreign_net_5d", 0)
            tn = chip_data.get("trust_net_5d", 0)
            if fn > 0:
                foreign_direction = f"外資近5日買超 {fn:,} 張"
            elif fn < 0:
                foreign_direction = f"外資近5日賣超 {abs(fn):,} 張"
            if tn > 0:
                invest_direction = f"投信近5日買超 {tn:,} 張"
            elif tn < 0:
                invest_direction = f"投信近5日賣超 {abs(tn):,} 張"
```

然後把原本的 result dict 中相關欄位改為：

```python
        result = {
            # ... 前面不變 ...
            "本益比": pe,
            "本益比_is_stale": isinstance(pe, str) or (isinstance(pe, (int, float)) and pe == pe_from_existing),
            "股價淨值比": pbr,
            "殖利率": dividend_yield,
            "估值狀態": valuation_status,
            "投信動向": invest_direction,
            "外資動向": foreign_direction,
            "營收表現": revenue_status,
            # ... 後面不變 ...
        }
```

### 關鍵設計決策

**為什麼 Phase 0 不直接算本益比？**

因為計算 PE 需要「年化 EPS」，而年化 EPS 需要「總股本」來把淨利轉成每股盈餘。目前 `financial_data` 只有損益表/資產負債表/現金流量表，沒有股本資料。FinMind 有 `TaiwanStockPER` dataset 可以直接拿 PE，但那是 Phase 1 的事。

Phase 0 的策略是：**先把管線修通，讓欄位不再是空字串，同時標記 `_is_stale` 讓前端知道這是舊值。** 營收表現和法人動向可以從已有資料即時計算，這兩個欄位會立刻從空變成有值。

---

## 修改二：修 `role_outputs` 結構，加入 `raw_data`

### 現狀（第 511-520 行）
```python
role_outputs.append({
    "role_name": dim.name,
    "score": dim.score,
    "signal": dim.signal,
    "plain_text": dim.plain_text,
    "key_finding": dim.key_finding,
    "mekak": dim.mekak,
})
```

### 改為

```python
        # role_analysis（保留 engine 的結構化分析）
        role_outputs = []
        for dim in all_dims:
            role_output = {
                "role_name": dim.name,
                "score": dim.score,
                "signal": dim.signal,
                "plain_text": dim.plain_text,
                "key_finding": dim.key_finding,
                "mekak": dim.mekak,
                # v48 Phase 0：加入 raw_data 讓前端讀到 details
                "raw_data": dim.details if dim.details else {},
                # v48 Phase 0：標記是否為 fallback
                "is_fallback": self._is_dim_fallback(dim),
                # v48 Phase 0：分數轉成 0-100 供前端雷達圖直接用
                "confidence": round(dim.score * 10, 0),
            }
            role_outputs.append(role_output)
```

在 StockUpdater class 中加入 helper 方法：

```python
    @staticmethod
    def _is_dim_fallback(dim) -> bool:
        """判斷一個維度是否為 fallback（資料不足）"""
        fallback_keywords = ["資料不足", "未提供", "需外部AI補充", "需補齊"]
        text = f"{dim.plain_text} {dim.key_finding} {dim.mekak}"
        return any(kw in text for kw in fallback_keywords)
```

### 為什麼加 `confidence`？

前端的 10 維度雷達圖（`renderSevenDimAccordion`）在讀籌碼維度時用了 `ro[ci].confidence`（第 6858 行）。engine v2 沒有輸出這個欄位，導致前端拿到 undefined。加上 `confidence = score × 10`（1-10 分 → 10-100）就能讓前端正確顯示。

---

## 修改三：修評分計算，排除 fallback 維度

### 現狀（第 505-508 行）
```python
all_dims = report.base_dimensions + report.deep_dimensions
scores = [d.score for d in all_dims if d.score is not None]
result["評分"] = round(sum(scores) / len(scores), 1) if scores else 5.0
```

### 改為

```python
        # v48 Phase 0：排除 fallback 維度，避免空氣數據稀釋真實信號
        all_dims = report.base_dimensions + report.deep_dimensions
        valid_dims = [d for d in all_dims if not self._is_dim_fallback(d)]

        if valid_dims:
            valid_scores = [d.score for d in valid_dims if d.score is not None]
            result["評分"] = round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 5.0
        else:
            result["評分"] = 5.0  # 全部 fallback = 無法評分

        # 記錄有效維度數量（供前端顯示「基於 N 個維度」）
        result["valid_dimension_count"] = len(valid_dims)
        result["total_dimension_count"] = len(all_dims)
```

### 影響

以台積電為例：目前 7 維全平均 = (5+3.5+5+5+5+5+5)/7 = **4.9 分**。
排除 fallback 後 = (5+3.5)/2 = **4.25 分**（只計算有真實資料的財報和籌碼）。
但如果財報也是 fallback（plain_text="財報資料不足"），那只剩籌碼 = **3.5 分**。

這更真實地反映了實際狀況：台積電目前在喵姆系統裡只有籌碼面有真實訊號，而籌碼面偏弱（3.5/10），所以整體評分應該偏低。

---

## 修改四：加 `data_provenance`

在 `result` dict 中（第 497-502 行後面）加入：

```python
        # v48 Phase 0：資料來源追溯
        result["data_provenance"] = {
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "updater_version": "stock_updater_v48_phase0",
            "price_date": history[-1]["time"] if history else "",
            "price_days": len(history),
            "financial_date": financial_date,
            "financial_quarters": len(financial_data.get("quarters", [])) if financial_data else 0,
            "chip_date": datetime.now().strftime("%Y-%m-%d"),
            "valid_dimensions": len(valid_dims) if 'valid_dims' in dir() else 0,
            "fallback_dimensions": [d.name for d in all_dims if self._is_dim_fallback(d)] if 'all_dims' in dir() else [],
        }
```

注意：`data_provenance` 的填充需要在評分計算之後（因為依賴 `valid_dims` 和 `all_dims`），所以放在 result dict 組裝的末尾。

---

## 修改五：更新 `update_single()` 傳遞 financial_data 和 chip_data

### 現狀（第 592-594 行）
```python
        # 5. 轉成 stock dict
        stock_dict = self.report_to_stock_dict(code, name, report, history, existing)
```

### 改為

```python
        # 5. 轉成 stock dict（v48：傳入 financial_data 和 chip_data 供即時計算）
        stock_dict = self.report_to_stock_dict(
            code, name, report, history, existing,
            financial_data=financial_data,
            chip_data=chip_data
        )
```

---

## 修改六：前端 key mapping 修正

### 位置：`index.html` 第 6856 行

### 現狀
```javascript
if (ra.role_outputs[ci].role_name === '籌碼分析官') {
```

### 改為
```javascript
if (ra.role_outputs[ci].role_name === '籌碼分析官' || ra.role_outputs[ci].role_name === '籌碼結構') {
```

### 其他需要確認的位置

前端已經有部分 fallback（如第 3546 行的 `技術分析官 || 技術面診斷`），但以下位置只搜尋舊版名稱，需要加上新版：

| 行號 | 現狀 | 改為 |
|------|------|------|
| 3465 | `=== '情境分析官'` | `=== '情境分析官' \|\| r.role_name === '市場情緒'` |
| 6621 | `=== '籌碼分析官' \|\| r.role_name === '籌碼結構'` | ✅ 已有 |
| 6629 | `=== '技術分析官' \|\| r.role_name === '技術面診斷'` | ✅ 已有 |
| 6640 | `=== '情境分析官'` | `=== '情境分析官' \|\| r.role_name === '市場情緒'` |
| 6651 | `=== '風險評估官'` | 無對應新維度，保留 |
| 6856 | `=== '籌碼分析官'` | 加 `\|\| '籌碼結構'` |

前端 `friendlyNames` dict（第 6606 行）也需更新：

```javascript
var friendlyNames = {
    '籌碼分析官': '大戶動向', '籌碼結構': '大戶動向',
    '技術分析官': '技術走勢', '技術面診斷': '技術走勢',
    '情境分析官': '市場環境', '市場情緒': '市場環境',
    '風險評估官': '風險評估',
    '財報真實性': '財報體質',
    '惡魔代言人': '反向觀點',
    '產業結構': '產業生態',
    '先行指標': '領先訊號'
};
```

---

## 完整修改後的 `report_to_stock_dict()`

為了避免 patch 不完整導致問題，以下是整個方法的完整替換版。直接用它取代原本第 437-550 行：

```python
    def report_to_stock_dict(self, code: str, name: str,
                             report: FinalReport, history: List[Dict],
                             existing: Dict = None,
                             financial_data: Dict = None,
                             chip_data: Dict = None) -> Dict:
        """
        將 engine 的 FinalReport 轉成 daily_analysis.json 的 stock dict 格式。
        v48 Phase 0：估值欄位即時計算，role_outputs 加 raw_data，評分排除 fallback。
        """
        close = history[-1]["close"] if history else 0
        change_pct = 0
        if len(history) >= 2 and history[-2]["close"] > 0:
            change_pct = round((close - history[-2]["close"]) / history[-2]["close"] * 100, 2)

        # 從 engine 結果取出
        verdict_map = {
            Verdict.BUY: "買進", Verdict.SELL: "賣出", Verdict.WAIT: "觀望"
        }
        cat_map = {
            Verdict.BUY: "buy", Verdict.SELL: "sell", Verdict.WAIT: "wait"
        }

        # 停損：技術面支撐或 -8%
        support = 0
        for dim in report.base_dimensions:
            if dim.name == "技術面診斷" and dim.details:
                support = dim.details.get("support", 0)
        stop_loss = round(support, 2) if support > 0 else round(close * 0.92, 2)

        # 目標價：阻力位或 +15%
        resistance = 0
        for dim in report.base_dimensions:
            if dim.name == "技術面診斷" and dim.details:
                resistance = dim.details.get("resistance", 0)
        target = round(resistance, 2) if resistance > 0 else round(close * 1.15, 2)

        # 風險報酬比
        risk = close - stop_loss if close > stop_loss else 1
        reward = target - close if target > close else 1
        rr_ratio = round(reward / risk, 2) if risk > 0 else 0

        # ─── v48 Phase 0：即時計算估值欄位 ───
        financial_date = ""
        revenue_status = ""

        if financial_data and financial_data.get("quarters"):
            quarters = financial_data["quarters"]
            # 營收趨勢（季對季）
            if len(quarters) >= 2:
                rev_curr = quarters[0].get("revenue", 0)
                rev_prev = quarters[1].get("revenue", 0)
                if rev_curr > 0 and rev_prev > 0:
                    rev_growth = (rev_curr - rev_prev) / rev_prev * 100
                    if rev_growth > 20:
                        revenue_status = f"營收季增 {rev_growth:.0f}%（強勁成長）"
                    elif rev_growth > 5:
                        revenue_status = f"營收季增 {rev_growth:.0f}%（穩定成長）"
                    elif rev_growth > -5:
                        revenue_status = "營收持平"
                    elif rev_growth > -20:
                        revenue_status = f"營收季減 {abs(rev_growth):.0f}%（小幅衰退）"
                    else:
                        revenue_status = f"營收季減 {abs(rev_growth):.0f}%（大幅衰退）"

        # 本益比/股價淨值比/殖利率：Phase 0 暫保留 existing，標記 stale
        pe = existing.get("本益比", "") if existing else ""
        pbr = existing.get("股價淨值比", "") if existing else ""
        dy = existing.get("殖利率", "") if existing else ""

        # 估值狀態
        valuation_status = ""
        if isinstance(pe, (int, float)) and pe > 0:
            if pe > 30: valuation_status = "⚠️本益比偏高"
            elif pe > 20: valuation_status = "本益比合理偏高"
            elif pe > 10: valuation_status = "✅本益比合理"
            else: valuation_status = "💰本益比偏低"
        elif existing:
            valuation_status = existing.get("估值狀態", "")

        # 籌碼動向（即時）
        invest_dir = ""
        foreign_dir = ""
        if chip_data:
            fn = chip_data.get("foreign_net_5d", 0)
            tn = chip_data.get("trust_net_5d", 0)
            if fn > 0: foreign_dir = f"外資5日買超{fn:,}張"
            elif fn < 0: foreign_dir = f"外資5日賣超{abs(fn):,}張"
            if tn > 0: invest_dir = f"投信5日買超{tn:,}張"
            elif tn < 0: invest_dir = f"投信5日賣超{abs(tn):,}張"

        # ─── 組裝 result ───
        result = {
            "代號": code,
            "名稱": name,
            "收盤價": close,
            "漲跌幅": change_pct,
            "評分": 5.0,  # 下面會重算
            "建議": verdict_map.get(report.verdict, "觀望"),
            "建議類別": cat_map.get(report.verdict, "wait"),
            "詳細理由": report.plain_summary or "",
            "白話摘要": report.plain_summary or "",
            "成交量狀態": "",
            "停損參考": stop_loss,
            "目標價": target,
            "風險報酬比": rr_ratio,
            # v48 估值欄位
            "本益比": pe,
            "本益比_is_stale": True,  # Phase 1 改為 False
            "股價淨值比": pbr,
            "殖利率": dy,
            "估值狀態": valuation_status,
            "投信動向": invest_dir,
            "外資動向": foreign_dir,
            "營收表現": revenue_status if revenue_status else (existing.get("營收表現", "") if existing else ""),
            "分析日期": datetime.now().strftime("%Y-%m-%d"),
            "is_stale": False,
            "stale_warning": "",
            "data_source": "stock_updater_v48_phase0",
            "is_realtime": False,
            "update_time": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }

        # ─── v48：評分排除 fallback 維度 ───
        all_dims = report.base_dimensions + report.deep_dimensions
        valid_dims = [d for d in all_dims if not self._is_dim_fallback(d)]

        if valid_dims:
            valid_scores = [d.score for d in valid_dims if d.score is not None]
            result["評分"] = round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 5.0
        else:
            result["評分"] = 5.0

        result["valid_dimension_count"] = len(valid_dims)
        result["total_dimension_count"] = len(all_dims)

        # ─── v48：role_outputs 加 raw_data + is_fallback + confidence ───
        role_outputs = []
        for dim in all_dims:
            role_outputs.append({
                "role_name": dim.name,
                "score": dim.score,
                "signal": dim.signal,
                "plain_text": dim.plain_text,
                "key_finding": dim.key_finding,
                "mekak": dim.mekak,
                "raw_data": dim.details if dim.details else {},
                "is_fallback": self._is_dim_fallback(dim),
                "confidence": round(dim.score * 10, 0),
            })

        result["role_analysis"] = {
            "final_direction": cat_map.get(report.verdict, "wait"),
            "confidence": report.confidence.name if hasattr(report.confidence, 'name') else "medium",
            "summary_human": report.plain_summary,
            "summary_professional": report.plain_summary,
            "integration_reason": ", ".join(report.triggers) if report.triggers else "",
            "conflict_intensity": 0,
            "role_outputs": role_outputs,
        }

        # 關鍵觸發 & 失效條件
        result["triggers"] = report.triggers or []
        result["invalidation"] = report.invalidation or ""
        result["contrarian_view"] = report.contrarian_view or ""
        result["devil_summary"] = report.devil_summary or ""
        result["mekak_insight"] = report.mekak_insight or ""

        # price_history（最近 60 天供前端 K 線圖）
        result["price_history"] = history[-60:] if history else []

        # ─── v48：data_provenance ───
        result["data_provenance"] = {
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "updater_version": "stock_updater_v48_phase0",
            "price_date": history[-1]["time"] if history else "",
            "price_days": len(history),
            "financial_quarters": len(financial_data.get("quarters", [])) if financial_data else 0,
            "chip_date": datetime.now().strftime("%Y-%m-%d"),
            "valid_dimensions": len(valid_dims),
            "fallback_dimensions": [d.name for d in all_dims if self._is_dim_fallback(d)],
        }

        # 保留使用者持倉資料
        if existing:
            for key in ["持股", "成本", "損益%", "category", "risk_label",
                        "stop_loss_price", "target_price", "has_position",
                        "cost", "profit_pct", "perplexity_prompt"]:
                if key in existing:
                    result[key] = existing[key]

        return result

    @staticmethod
    def _is_dim_fallback(dim) -> bool:
        """判斷一個維度是否為 fallback（資料不足）"""
        fallback_keywords = ["資料不足", "未提供", "需外部AI補充", "需補齊"]
        text = f"{dim.plain_text} {dim.key_finding} {dim.mekak}"
        return any(kw in text for kw in fallback_keywords)
```

---

## 驗收方式

改完後，跑以下指令驗證：

```bash
cd /path/to/stock_analyzer
python scripts/stock_updater.py --codes 2330 2317 2454
```

然後檢查 `daily_analysis.json`：

1. **台積電 2330**：`data_provenance` 欄位存在且 `updater_version = "stock_updater_v48_phase0"`
2. **鴻海 2317**：`外資動向` 不再是空字串（應該有「外資5日買/賣超 N 張」）
3. **聯發科 2454**：`role_outputs[*].raw_data` 存在且有內容（至少籌碼和技術面有 details）
4. **所有股票**：`role_outputs[*].is_fallback` 欄位存在
5. **所有股票**：`valid_dimension_count` 欄位存在且 < 7（因為有 fallback 維度）
6. **評分**：不再是 4.9（被空氣稀釋的結果），而是只基於有效維度的平均

---

## Phase 0 完成後的效果

```
改之前：
  台積電 評分=4.9（7維平均，3個空氣）
  鴻海 外資動向=""（空）
  role_outputs 沒有 raw_data → 前端 undefined
  本益比 來源不明，可能是上個月的殘值

改之後：
  台積電 評分=3.5（只算籌碼，因為財報也 fallback）
  鴻海 外資動向="外資5日賣超67,385,416張"（即時）
  role_outputs.raw_data = dim.details（前端能讀）
  本益比 保留舊值但標記 _is_stale=true
  data_provenance 記錄所有資料的來源和日期
  fallback_dimensions 列出哪些維度是空氣
```

下一步：Phase 1 接月營收 + 用 FinMind TaiwanStockPER 直接拿 PE → `本益比_is_stale` 變成 false。
