# 喵姆 v48 — Phase 0 開發衝刺清單

> **目標**：零新功能，只修現有 bug，讓已有的資料正確流通
> **預估工時**：1-2 個工作天
> **前置條件**：無（這是第一步）

---

## 任務 1：修復 report_to_stock_dict() 的估值欄位寫入

**檔案**：`scripts/stock_updater.py` 第 490-496 行

**現狀**：本益比、殖利率等欄位從 `existing.get()` 繼承舊值，不從新抓的財報計算。

**改法**：
```python
# 從 financial_data 計算本益比（若有 EPS 和收盤價）
pe = ""
if financial_data and financial_data.get("quarters"):
    latest_q = financial_data["quarters"][0]
    eps = latest_q.get("eps", 0)
    if eps > 0:
        pe = round(close / (eps * 4), 1)  # 年化 EPS

result["本益比"] = pe if pe else existing.get("本益比", "")
```

**驗收**：跑完 update_single() 後，鴻海的 `本益比` 不再是空字串。

---

## 任務 2：修復 role_outputs 的 key mapping

**檔案**：`scripts/stock_updater.py` 第 511-520 行

**現狀**：engine 輸出 `role_name`/`signal`/`plain_text`/`key_finding`/`mekak`，但前端部分位置期待 `raw_data`。

**改法**：在 `report_to_stock_dict()` 的 role_outputs 生成處，把 `details` dict 映射為 `raw_data`：

```python
role_outputs.append({
    "role_name": dim.name,
    "score": dim.score,
    "signal": dim.signal,
    "plain_text": dim.plain_text,
    "key_finding": dim.key_finding,
    "mekak": dim.mekak,
    "raw_data": dim.details,  # ← 新增這一行
})
```

**驗收**：前端技術面摺疊面板能讀到 MA60、支撐價位等數字（不再是 undefined）。

---

## 任務 3：確認前端讀取邏輯與新 key 一致

**檔案**：`index.html`，搜尋 `role_outputs`

**現狀**：前端搜尋 `技術分析官 || 技術面診斷`，大部分有 fallback，但需逐一確認所有維度名稱都有對應。

**改法**：在前端統一使用 engine v2 的名稱（`財報真實性`、`籌碼結構`、`技術面診斷`），移除對舊版名稱（`技術分析官`、`籌碼分析官`）的依賴。

**驗收**：10 維度雷達圖正確顯示所有維度名稱和分數（不再顯示 `-`）。

---

## 任務 4：加入 data_provenance（輕量版）

**檔案**：`scripts/stock_updater.py` 的 `report_to_stock_dict()`

**改法**：在 result dict 中新增：
```python
result["data_provenance"] = {
    "price_date": history[-1]["time"] if history else "",
    "financial_quarter": financial_data["quarters"][0].get("date", "") if financial_data and financial_data.get("quarters") else "",
    "chip_date": datetime.now().strftime("%Y-%m-%d"),
}
```

**驗收**：JSON 中每支股票有 `data_provenance` 欄位，記錄各資料的時間點。

---

## Phase 0 完成後的狀態

改完這四項後，喵姆的資料流應該是：

```
FinMind → stock_updater（抓+算）→ JSON（完整寫入）→ 前端（正確讀取）
         ↑ 本益比從財報算    ↑ role_outputs 有 raw_data   ↑ 維度名稱一致
```

然後就可以進 Phase 1（接月營收 + 算 PE 百分位）。

---

## 不要在 Phase 0 做的事

- ❌ 不改 engine 評分邏輯
- ❌ 不加新的分析維度
- ❌ 不碰前端 UI 設計
- ❌ 不做 Monte Carlo / Cosmos
- ❌ 不加新的 API 呼叫

Phase 0 的唯一目標：**讓現有的數據正確流通**。
