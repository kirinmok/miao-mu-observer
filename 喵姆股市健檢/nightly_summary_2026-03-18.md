# 喵姆看盤 夜間體檢摘要 — 2026-03-18

> **健康度：67% (C)** ｜ ✅ 12 / ❌ 6
> 與昨日比較：**持平**（分數不變、問題項目相同）

---

## 🔴 P0 — 需優先處理

1. **daily_analysis.json 已 19 天未更新**（昨天 18 天）
   持續惡化中。這是使用者開啟看板時最核心的資料來源，目前顯示的分析全部是 2/27 的舊資料。直接影響所有股票的判定結果可信度。建議排查 pipeline 為何停止產出。

2. **AI 判定覆蓋率 0/33**
   所有股票都沒有 AI 判定。搭配 daily_analysis 過期，使用者看到的投資建議基本無效。

3. **日誌錯誤累積未清理**
   10 個 log 檔有 Error，其中 `run_night.log` 有 15 個 "No such file"、`run_rebuild.log` 有 6 個 Traceback。這些可能是 daily_analysis 停止更新的根本原因。

## ⚠️ 次要問題

- Git 有 51 個未提交檔案（昨天 50，+1）— 含 .env，不影響使用者但持續膨脹
- Kelly 公式功能（renderKellySection）缺失 — 前端缺一個功能區塊
- market_history.json 更新時間 unknown，健康分數為 ?

## ✅ 穩定項目

data/ 資料夾個股 JSON 仍在每日更新（最新 2382.json 是今天的），cron job 最後一次有成功記錄，前端 index.html 完整（543KB、205 處 NaN 防護），環境設定正常。

## 📌 建議明天開發重點

**修復 pipeline 資料產出流程**。從 `run_night.log` 和 `run_rebuild.log` 的錯誤開始查，找出 daily_analysis.json 為何從 2/27 後就不再更新。這是目前拉低健康度的主因，修好後預估健康度可回到 80%+。
