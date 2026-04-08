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
      // 取得預測記錄（可選 ?date=2026-03-10 篩選）
      var allPreds = readSheet(ss, 'predictions');
      var filterDate = (e.parameter && e.parameter.date) || '';
      if (filterDate) {
        result = allPreds.filter(function(r) { return r.date === filterDate; });
      } else {
        result = allPreds;
      }
    } else if (action === 'getVerifications') {
      // 取得驗證記錄（可選 ?date= 篩選）
      var allVeri = readSheet(ss, 'verifications');
      var vDate = (e.parameter && e.parameter.date) || '';
      if (vDate) {
        result = allVeri.filter(function(r) { return r.pred_date === vDate; });
      } else {
        result = allVeri;
      }
    } else if (action === 'getAccuracy') {
      // 取得累積準確率統計
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
      // 各股準確率
      var stockAccuracy = {};
      Object.keys(byStock).forEach(function(code) {
        var s = byStock[code];
        stockAccuracy[code] = { total: s.total, correct: s.correct, rate: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 };
      });
      result = { total: total, correct: correct, rate: total > 0 ? Math.round(correct / total * 100) : 0, byStock: stockAccuracy };
    } else if (action === 'saveAll') {
      // GET 方式寫入（繞過 POST 302 redirect 問題）
      var payload = e.parameter.payload || '';
      if (!payload) {
        result = { error: 'Missing payload parameter' };
      } else {
        var body = JSON.parse(decodeURIComponent(payload));
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
        result = { status: 'ok', method: 'GET' };
      }
    } else if (action === 'getAll') {
      // 一次回傳所有資料（portfolio + profile + settings）
      var allPortfolio = readSheet(ss, 'portfolio');
      var allProfile = readSheet(ss, 'profile');
      var allSettingsData = readSheet(ss, 'settings');
      var allSettingsObj = {};
      allSettingsData.forEach(function(row) { if (row.key) allSettingsObj[row.key] = row.value; });
      result = { portfolio: allPortfolio, profile: allProfile, settings: allSettingsObj };
    } else if (action === 'getSettings') {
      // 讀取使用者設定（Gemini Key 等）
      var settingsData = readSheet(ss, 'settings');
      var settingsObj = {};
      settingsData.forEach(function(row) { if (row.key) settingsObj[row.key] = row.value; });
      result = settingsObj;
    } else if (action === 'getMeta') {
      // 回傳最後更新時間（用於衝突偵測）
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
      // 儲存一筆預測：append 模式（不清除舊資料）
      var predHeaders = ['date','code','name','direction','confidence','price_at_pred','target_price','reasons','signals','source'];
      appendToSheet(ss, 'predictions', body.data, predHeaders);
      updateMeta(ss, 'predictions_updated', new Date().toISOString());
      var count = Array.isArray(body.data) ? body.data.length : 1;
      result = { status: 'ok', count: count };
    } else if (action === 'saveVerification') {
      // 儲存驗證結果：append 模式
      var veriHeaders = ['pred_date','verify_date','code','name','predicted_dir','actual_dir','hit','price_at_pred','price_at_verify','change_pct','confidence','lesson'];
      appendToSheet(ss, 'verifications', body.data, veriHeaders);
      updateMeta(ss, 'verifications_updated', new Date().toISOString());
      // 更新累積統計到 _meta
      var allVeris = readSheet(ss, 'verifications');
      var totalV = allVeris.length;
      var correctV = allVeris.filter(function(r) { return r.hit === 'Y'; }).length;
      updateMeta(ss, 'accuracy_total', totalV);
      updateMeta(ss, 'accuracy_correct', correctV);
      updateMeta(ss, 'accuracy_rate', totalV > 0 ? Math.round(correctV / totalV * 100) + '%' : '0%');
      result = { status: 'ok', accuracy: totalV > 0 ? Math.round(correctV / totalV * 100) : 0 };
    } else if (action === 'saveAll') {
      // 一次同步全部
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
  if (data.length < 2) return []; // 只有標題列或空

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
    // 只寫標題列
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  // 寫標題 + 資料
  var rows = [headers];
  dataArray.forEach(function(item) {
    var row = headers.map(function(h) {
      var v = item[h];
      return (v !== undefined && v !== null) ? v : '';
    });
    rows.push(row);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  // 格式化標題列
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e8f0fe');
}

// append 模式：不清除舊資料，只在底部追加新行
function appendToSheet(ss, name, dataInput, headers) {
  var sheet = getOrCreateSheet(ss, name);
  // 如果是空 sheet，先寫標題列
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  }
  // 支援單筆物件或陣列
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

  // portfolio 工作表
  var portfolio = getOrCreateSheet(ss, 'portfolio');
  if (portfolio.getLastRow() === 0) {
    portfolio.getRange(1, 1, 1, 8).setValues([['code','name','shares','cost','currentPrice','target','stopLoss','note']]);
    portfolio.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#e8f0fe');
  }

  // profile 工作表
  var profile = getOrCreateSheet(ss, 'profile');
  if (profile.getLastRow() === 0) {
    profile.getRange(1, 1, 1, 2).setValues([['key','value']]);
    profile.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8f0fe');
  }

  // predictions 工作表（AI 每日預測記錄）
  var predictions = getOrCreateSheet(ss, 'predictions');
  if (predictions.getLastRow() === 0) {
    var predH = ['date','code','name','direction','confidence','price_at_pred','target_price','reasons','signals','source'];
    predictions.getRange(1, 1, 1, predH.length).setValues([predH]);
    predictions.getRange(1, 1, 1, predH.length).setFontWeight('bold').setBackground('#fff3cd');
  }

  // verifications 工作表（隔日驗證結果）
  var verifications = getOrCreateSheet(ss, 'verifications');
  if (verifications.getLastRow() === 0) {
    var veriH = ['pred_date','verify_date','code','name','predicted_dir','actual_dir','hit','price_at_pred','price_at_verify','change_pct','confidence','lesson'];
    verifications.getRange(1, 1, 1, veriH.length).setValues([veriH]);
    verifications.getRange(1, 1, 1, veriH.length).setFontWeight('bold').setBackground('#d4edda');
  }

  // settings 工作表（Gemini Key 等使用者設定）
  var settings = getOrCreateSheet(ss, 'settings');
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 1, 2).setValues([['key','value']]);
    settings.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8f0fe');
  }

  // _meta 工作表
  getOrCreateSheet(ss, '_meta');

  // 刪除預設的 Sheet1（如果存在且不是我們要的）
  var defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch(e) {}
  }

  SpreadsheetApp.getUi().alert('✅ 初始化完成！\n\n已建立 portfolio、profile、predictions、verifications、_meta 工作表。\n\n下一步：部署 → 新增部署 → Web 應用程式');
}
