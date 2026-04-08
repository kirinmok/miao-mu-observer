# 喵姆看盤 V37 — 系統體檢報告

> 體檢時間：2026-03-09
> 體檢範圍：`/Users/kk/stock_analyzer/`

---

## A. 後端服務

### A1. Flask / serve.py 運行狀態
❌ **未運行**
- `serve.py` 存在，使用 Flask port 5000
- 執行 `lsof -i :5000` 無任何 process
- 影響：本地開發時無法透過 API 取資料（GitHub Pages 部署不受影響）

### A2. daily_analysis.json 更新時間
❌ **嚴重過期 — 10 天未更新**
- 最後更新：`2026-02-27 07:30:28`
- 檔案大小：512 KB
- 內含 33 檔股票，所有 price_history = 60 筆
- **根因：** cron 排程 python3 路徑錯誤（見 E12），或 stock_updater proxy 問題（見 B5）

### A3. market_history.json
⚠️ **有資料但僅 4 筆**
- 最後更新：`2026-03-09 15:35:05`
- 最新一筆：加權指數 22110.42（-4.43%），健康分數 16 (F)，判斷「法人大量出貨型崩盤」
- 僅 4 筆歷史，長期趨勢分析資料量不足

### A4. data/ 資料夾
✅ **正常運作**
- 34 個 JSON 檔案
- 日期範圍：2025-12-02 ~ 2026-03-09
- 最新檔案：`2382.json`（2026-03-09）
- `watchlist.json` 檔案日期較舊（2026-03-03）
- `logs/cron.log` 顯示最後成功執行 33/33 檔於 2026-03-09 15:39:57

---

## B. Python 模組狀態

### B5. stock_updater.py
❌ **執行失敗 — Proxy 被擋**
```
ProxyError('Unable to connect to proxy',
  OSError('Tunnel connection failed: 403 Forbidden'))
```
- FinMind API 無法通過 sandbox proxy 連線
- 這是在 Cowork sandbox 環境測試的結果；在使用者本機（無 proxy）應可正常執行
- 建議：在本機終端機直接執行 `python3 scripts/stock_updater.py --codes 2330` 確認

### B6. LINE Token
❌ **未設定**
- `.env` 檔案不存在
- `LINE_CHANNEL_ACCESS_TOKEN` 環境變數未設定
- LINE 推播功能完全無法使用

### B7. Crontab
⚠️ **無法在 sandbox 中讀取**
- `crontab -l` 回傳 permission denied
- 但從 `run_night.log` 可推斷 cron 有在執行排程
- **問題：** 所有 run_night.log 條目均為 `/bin/sh: /opt/homebrew/bin/python3: No such file or directory`
- **根因：** cron 環境 PATH 不含 Homebrew，需用完整路徑或在 crontab 設 PATH

---

## C. 前端資料（需手動驗證）

### C8. AI 信心分數 NaN 修復
⚠️ **程式碼已修復，需手動驗證**
- commit `8b9b1fe` 已修復 `renderVerdict()` 中的 NaN 問題
- 修復內容：`ra.confidence` 字串（"LOW"/"MED"/"HIGH"）→ 數字映射 + parseFloat 防護
- **驗證方式：** 瀏覽器打開 index.html → 載入任一股票 → 確認信心分數顯示數字而非 NaN%

### C9. 回測面板
⚠️ **程式碼已修復，需手動驗證**
- commit `8b9b1fe` 已修復：門檻 65→40、自動嘗試 5 種策略回測、fallback UI
- 所有股票 price_history = 60 筆（> 40 門檻），理論上應可自動回測
- **驗證方式：** 載入股票 → 展開「回測績效」accordion → 應顯示策略結果而非 0

### C10. AI 委員會
⚠️ **無法在 sandbox 測試**
- `openCommittee()` 函數存在於 index.html
- 委員會面板 UI + 5 位角色分析均有程式碼
- **驗證方式：** 載入股票 → 點擊委員會按鈕 → 確認 5 位角色均有輸出

---

## D. 雲端同步

### D11. Google Sheets 同步
⚠️ **程式碼就緒，尚未完成設定**
- `CLOUD_SETUP.md`（設定教學）✅ 存在
- `Code.gs`（Apps Script 程式碼）✅ 存在
- index.html 中有 12 處雲端同步相關程式碼（cloudUpload, cloudDownload, cloudTestConnection 等）
- **狀態：** 程式碼已寫好，但無證據顯示使用者已完成 Google Apps Script 部署
- **下一步：** 依照 CLOUD_SETUP.md 步驟完成設定

---

## E. 錯誤日誌

### E12. 日誌檔案掃描
發現 17 個 log 檔案，重大問題整理如下：

| 嚴重度 | 檔案 | 問題 |
|--------|------|------|
| ❌ 嚴重 | `run_night.log` | **全部** 條目：`/opt/homebrew/bin/python3: No such file or directory` — cron 中 python3 路徑錯誤 |
| ❌ 嚴重 | `run_day.log` | LINE 推播失敗：`send_market_regime_alert() takes 2 positional arguments but 3 were given` — 函數簽名不匹配 |
| ❌ 嚴重 | `run_rebuild.log` | `ModuleNotFoundError: No module named 'modules.financial_trend'` — 模組已刪除/改名但 rebuild 腳本未更新 |
| ❌ 嚴重 | `run_rebuild.log` | `FileNotFoundError: templates/index_v29.1.html` — 模板檔案路徑過期 |
| ⚠️ 警告 | `run_reanalysis.log` | LINE 月度推播額度已用完（`You have reached your monthly limit`） |
| ⚠️ 警告 | `server.log` | Leaked semaphore objects（Flask 記憶體洩漏警告） |
| ✅ 正常 | `logs/cron.log` | 最後成功：2026-03-09 15:39:57（33/33 檔） |

---

## 總結

| 類別 | 狀態 | 說明 |
|------|------|------|
| 資料更新 | ❌ | daily_analysis.json 已 10 天未更新 |
| 前端修復 | ⚠️ | NaN/回測/產業 已 commit，待推送+手動驗證 |
| 雲端同步 | ⚠️ | 程式碼就緒，待使用者完成 Apps Script 部署 |
| cron 排程 | ❌ | python3 路徑錯誤，夜間排程全部失敗 |
| LINE 推播 | ❌ | Token 未設定 + 函數簽名錯誤 + 月額度用完 |
| rebuild | ❌ | 引用已刪除模組與過期模板路徑 |
| data/ 資料 | ✅ | 34 檔正常，最新 2026-03-09 |

### 優先修復建議

1. **🔴 P0：修復 cron python3 路徑** — 改為 `which python3` 的完整路徑，或在 crontab 加 `PATH=...`
2. **🔴 P0：更新 daily_analysis.json** — 在本機執行 `python3 scripts/stock_updater.py` 確認可用
3. **🟡 P1：修復 run_rebuild.log 錯誤** — 更新 `modules.financial_trend` 引用 + `templates/` 路徑
4. **🟡 P1：修復 LINE 推播** — 設定 `.env` TOKEN + 修正 `send_market_regime_alert()` 函數簽名
5. **🟢 P2：完成雲端同步設定** — 依照 CLOUD_SETUP.md 部署 Apps Script
6. **🟢 P2：git push 部署** — commit `8b9b1fe`（三大修復）尚未推送到 GitHub Pages
