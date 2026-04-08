# 喵姆 Code.gs 部署流程（給 Claude 網頁版執行）

## 背景
喵姆看盤 App 使用 Google Apps Script 作為雲端同步後端。
Code.gs 已更新（新增 settings 工作表支援），需要重新部署。

## 你要操作的目標
- **Google 試算表**：「喵姆持股資料」（已存在，不要新建）
- **Apps Script 專案**：綁定在這份試算表上的 Apps Script（已存在）
- **目前部署 URL**：`https://script.google.com/macros/s/AKfycbw_uO8rsxswzX54KAjCUt563BEMo0lkSqGuq9mVPMLeqCLocFt5NHRCCgwKzdBSdyT-/exec`

---

## 步驟

### Step 1：打開 Google 試算表
1. 打開 Google Drive
2. 搜尋「喵姆持股資料」這份試算表（**已存在，不要建新的**）
3. 打開它

### Step 2：進入 Apps Script 編輯器
1. 在試算表上方選單列點選：**擴充功能** → **Apps Script**
2. 會開啟 Apps Script 編輯器
3. 你會看到已經有一個 `Code.gs` 檔案（裡面是舊版程式碼）

### Step 3：替換程式碼
1. **全選**編輯器裡的所有程式碼（Ctrl+A / Cmd+A）
2. **刪除**全部
3. **貼上**新版 Code.gs 的完整內容（下方附上）
4. 按 **Ctrl+S / Cmd+S** 儲存

### Step 4：執行 initSheets()
1. 在 Apps Script 編輯器頂端的函式選擇器（下拉選單），選擇 `initSheets`
2. 點擊 ▶️ **執行**按鈕
3. 第一次可能會彈出「需要授權」→ 點「審查權限」→ 選你的 Google 帳號 → 「進階」→「前往 喵姆持股資料（不安全）」→「允許」
4. 執行成功後會彈出提示：「✅ 初始化完成！已建立 portfolio、profile、predictions、verifications、_meta 工作表。」
5. 回到試算表確認底部有這些工作表標籤：portfolio、profile、predictions、verifications、settings、_meta

### Step 5：重新部署
1. 回到 Apps Script 編輯器
2. 點右上角 **部署** → **管理部署**
3. 點右上角的 ✏️（編輯）圖示
4. **版本**欄位選：**新版本**
5. 確認「執行身分」是「我」，「存取權限」是「所有人」
6. 點 **部署**
7. ⚠️ **重要**：部署完成後會顯示一個 Web App URL
   - 如果 URL **跟原本一樣**（結尾 `...dBSdyT-/exec`），不需改任何東西
   - 如果 URL **變了**（新的部署），你需要告訴 Kirin 新的 URL

### Step 6：測試
1. 在瀏覽器開新分頁，貼上 Web App URL 後面加 `?action=ping`：
   ```
   https://script.google.com/macros/s/AKfycbw_uO8rsxswzX54KAjCUt563BEMo0lkSqGuq9mVPMLeqCLocFt5NHRCCgwKzdBSdyT-/exec?action=ping
   ```
2. 應該回傳 JSON：`{"status":"ok","time":"...","sheets":["portfolio","profile","predictions","verifications","settings","_meta"]}`
3. 確認 sheets 列表裡有 `settings` — 這就代表更新成功

### Step 7：讓 API Key 寫入雲端
1. 打開喵姆看盤 App（手機或電腦瀏覽器）
2. 進入後台（右上角齒輪）
3. 找到「☁️ 雲端同步」
4. 點一次「☁️ 上傳」
5. 這會把 localStorage 裡的 Gemini API Key 同步到雲端 settings 工作表
6. 之後即使 localStorage 被清空，App 啟動時也會自動從雲端還原

---

## 常見問題

**Q: 我是要「新增部署」還是「編輯現有部署」？**
A: **編輯現有部署**（管理部署 → 編輯），這樣 URL 不會改變。如果用「新增部署」會產生新的 URL，就得去改 index.html 裡的 CLOUD_DEFAULT_URL。

**Q: initSheets() 跑了會不會把現有資料清掉？**
A: 不會。initSheets() 只在工作表不存在時建立新的，已存在的工作表不會動。

**Q: 部署後多久生效？**
A: 立刻。部署完 URL 就會回應新版程式碼。

---

## 新版 Code.gs 完整程式碼

```javascript
/**
 * 喵姆持股雲端同步 — Google Apps Script Web App
 *
 * 使用方式：
 * 1. 建立 Google 試算表「喵姆持股資料」
 * 2. 到「擴充功能」→「Apps Script」→ 貼上此程式碼
 * 3. 部署 → 新增部署 → Web 應用程式 → 存取權限：「所有人」→ 部署
 * 4. 複製 Web App URL，貼到喵姆後台「☁️ 雲端同步」設定
 */

// ── GET 請求：讀取資料 ──
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'getPortfolio';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result;

    if (action === 'getPortfolio') {
      result = readSheet(ss, 'portfolio');
    } else if (action === 'getProfile') {
      result = readSheet(ss, 'profile');
    } else if (action === 'getWatchlist') {
      result = readSheet(ss, 'watchlist');
    } else if (action === 'ping') {
      result = { status: 'ok', time: new Date().toISOString(), sheets: ss.getSheets().map(function(s) { return s.getName(); }) };
    } else if (action === 'getPredictions') {
      var allPreds = readSheet(ss, 'predictions');
      var filterDate = (e.parameter && e.parameter.date) || '';
      if (filterDate) {
        result = allPreds.filter(function(r) { return r.date === filterDate; });
      } else {
        result = allPreds;
      }
    } else if (action === 'getVerifications') {
      var allVeri = readSheet(ss, 'verifications');
      var vDate = (e.parameter && e.parameter.date) || '';
      if (vDate) {
        result = allVeri.filter(function(r) { return r.pred_date === vDate; });
      } else {
        result = allVeri;
      }
    } else if (action === 'getAccuracy') {
      var veris = readSheet(ss, 'verifications');
      var total = veris.length;
      var correct = veris.filter(function(r) { return r.hit === 'Y'; }).length;
      var byStock = {};
      veris.forEach(function(r) {
        var code = r.code || 'unknown';
        if (!byStock[code]) byStock[code] = { total: 0, correct: 0 };
        byStock[code].total++;
        if (r.hit === 'Y') byStock[code].correct++;
      });
      var stockAccuracy = {};
      Object.keys(byStock).forEach(function(code) {
        var s = byStock[code];
        stockAccuracy[code] = { total: s.total, correct: s.correct, rate: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 };
      });
      result = { total: total, correct: correct, rate: total > 0 ? Math.round(correct / total * 100) : 0, byStock: stockAccuracy };
    } else if (action === 'getSettings') {
      var settingsData = readSheet(ss, 'settings');
      var settingsObj = {};
      settingsData.forEach(function(row) { if (row.key) settingsObj[row.key] = row.value; });
      result = settingsObj;
    } else if (action === 'getMeta') {
      var metaSheet = getOrCreateSheet(ss, '_meta');
      var data = metaSheet.getDataRange().getValues();
      var meta = {};
      data.forEach(function(row) { if (row[0]) meta[row[0]] = row[1]; });
      result = meta;
    } else {
      result = { error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST 請求：寫入資料 ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || 'savePortfolio';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result;

    if (action === 'savePortfolio') {
      writeSheet(ss, 'portfolio', body.data, ['code','name','shares','cost','currentPrice','target','stopLoss','note']);
      updateMeta(ss, 'portfolio_updated', new Date().toISOString());
      result = { status: 'ok', count: (body.data || []).length };
    } else if (action === 'saveProfile') {
      writeProfileSheet(ss, 'profile', body.data);
      updateMeta(ss, 'profile_updated', new Date().toISOString());
      result = { status: 'ok' };
    } else if (action === 'saveWatchlist') {
      writeSheet(ss, 'watchlist', body.data, ['code','name']);
      updateMeta(ss, 'watchlist_updated', new Date().toISOString());
      result = { status: 'ok', count: (body.data || []).length };
    } else if (action === 'savePrediction') {
      var predHeaders = ['date','code','name','direction','confidence','price_at_pred','target_price','reasons','signals','source'];
      appendToSheet(ss, 'predictions', body.data, predHeaders);
      updateMeta(ss, 'predictions_updated', new Date().toISOString());
      var count = Array.isArray(body.data) ? body.data.length : 1;
      result = { status: 'ok', count: count };
    } else if (action === 'saveVerification') {
      var veriHeaders = ['pred_date','verify_date','code','name','predicted_dir','actual_dir','hit','price_at_pred','price_at_verify','change_pct','confidence','lesson'];
      appendToSheet(ss, 'verifications', body.data, veriHeaders);
      updateMeta(ss, 'verifications_updated', new Date().toISOString());
      var allVeris = readSheet(ss, 'verifications');
      var totalV = allVeris.length;
      var correctV = allVeris.filter(function(r) { return r.hit === 'Y'; }).length;
      updateMeta(ss, 'accuracy_total', totalV);
      updateMeta(ss, 'accuracy_correct', correctV);
      updateMeta(ss, 'accuracy_rate', totalV > 0 ? Math.round(correctV / totalV * 100) + '%' : '0%');
      result = { status: 'ok', accuracy: totalV > 0 ? Math.round(correctV / totalV * 100) : 0 };
    } else if (action === 'saveAll') {
      if (body.portfolio) {
        writeSheet(ss, 'portfolio', body.portfolio, ['code','name','shares','cost','currentPrice','target','stopLoss','note']);
        updateMeta(ss, 'portfolio_updated', new Date().toISOString());
      }
      if (body.profile) {
        writeProfileSheet(ss, 'profile', body.profile);
        updateMeta(ss, 'profile_updated', new Date().toISOString());
      }
      if (body.watchlist) {
        writeSheet(ss, 'watchlist', body.watchlist, ['code','name']);
        updateMeta(ss, 'watchlist_updated', new Date().toISOString());
      }
      if (body.settings && typeof body.settings === 'object') {
        writeProfileSheet(ss, 'settings', body.settings);
        updateMeta(ss, 'settings_updated', new Date().toISOString());
      }
      result = { status: 'ok' };
    } else {
      result = { error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 工具函數 ──

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function readSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    var hasData = false;
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val !== '' && val !== null && val !== undefined) hasData = true;
      obj[headers[j]] = val;
    }
    if (hasData) result.push(obj);
  }
  return result;
}

function writeSheet(ss, name, dataArray, headers) {
  var sheet = getOrCreateSheet(ss, name);
  sheet.clear();

  if (!dataArray || dataArray.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var rows = [headers];
  dataArray.forEach(function(item) {
    var row = headers.map(function(h) {
      var v = item[h];
      return (v !== undefined && v !== null) ? v : '';
    });
    rows.push(row);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e8f0fe');
}

function appendToSheet(ss, name, dataInput, headers) {
  var sheet = getOrCreateSheet(ss, name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  }
  var items = Array.isArray(dataInput) ? dataInput : [dataInput];
  items.forEach(function(item) {
    var row = headers.map(function(h) {
      var v = item[h];
      return (v !== undefined && v !== null) ? v : '';
    });
    sheet.appendRow(row);
  });
}

function writeProfileSheet(ss, name, profileObj) {
  var sheet = getOrCreateSheet(ss, name);
  sheet.clear();

  if (!profileObj) return;

  var headers = ['key', 'value'];
  var rows = [headers];

  Object.keys(profileObj).forEach(function(key) {
    rows.push([key, profileObj[key]]);
  });

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);

  var headerRange = sheet.getRange(1, 1, 1, 2);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e8f0fe');
}

function updateMeta(ss, key, value) {
  var sheet = getOrCreateSheet(ss, '_meta');
  var data = sheet.getDataRange().getValues();
  var found = false;

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow([key, value]);
  }
}

// ── 初始化函數（首次使用時手動執行） ──
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var portfolio = getOrCreateSheet(ss, 'portfolio');
  if (portfolio.getLastRow() === 0) {
    portfolio.getRange(1, 1, 1, 8).setValues([['code','name','shares','cost','currentPrice','target','stopLoss','note']]);
    portfolio.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#e8f0fe');
  }

  var profile = getOrCreateSheet(ss, 'profile');
  if (profile.getLastRow() === 0) {
    profile.getRange(1, 1, 1, 2).setValues([['key','value']]);
    profile.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8f0fe');
  }

  var predictions = getOrCreateSheet(ss, 'predictions');
  if (predictions.getLastRow() === 0) {
    var predH = ['date','code','name','direction','confidence','price_at_pred','target_price','reasons','signals','source'];
    predictions.getRange(1, 1, 1, predH.length).setValues([predH]);
    predictions.getRange(1, 1, 1, predH.length).setFontWeight('bold').setBackground('#fff3cd');
  }

  var verifications = getOrCreateSheet(ss, 'verifications');
  if (verifications.getLastRow() === 0) {
    var veriH = ['pred_date','verify_date','code','name','predicted_dir','actual_dir','hit','price_at_pred','price_at_verify','change_pct','confidence','lesson'];
    verifications.getRange(1, 1, 1, veriH.length).setValues([veriH]);
    verifications.getRange(1, 1, 1, veriH.length).setFontWeight('bold').setBackground('#d4edda');
  }

  var settings = getOrCreateSheet(ss, 'settings');
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 1, 2).setValues([['key','value']]);
    settings.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8f0fe');
  }

  getOrCreateSheet(ss, '_meta');

  var defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch(e) {}
  }

  SpreadsheetApp.getUi().alert('✅ 初始化完成！\n\n已建立 portfolio、profile、predictions、verifications、_meta 工作表。\n\n下一步：部署 → 新增部署 → Web 應用程式');
}
```

---

*最後更新：2026-03-12*
