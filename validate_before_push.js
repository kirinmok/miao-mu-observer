#!/usr/bin/env node
/**
 * 喵姆升級驗證腳本 — 每次迭代升級後、git push 前必須執行
 * 用法: node validate_before_push.js
 * 
 * 檢查項目:
 * 1. index.html 存在且非空
 * 2. 所有 <script> 區塊的 JS 語法正確 (用 new Function 測試)
 * 3. 引號嵌套檢查 (偵測 onclick 等屬性中的引號衝突)
 * 4. 關鍵函式存在性檢查
 * 5. 版本號一致性 (index.html 內的版本 vs sw.js 的 CACHE_NAME)
 * 6. 檔案大小合理性 (不能突然變很小或很大)
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');

let errors = 0;
let warnings = 0;

function fail(msg) { console.error('  ❌ FAIL:', msg); errors++; }
function warn(msg) { console.warn('  ⚠️  WARN:', msg); warnings++; }
function pass(msg) { console.log('  ✅ PASS:', msg); }

console.log('\n🔍 喵姆升級驗證開始...\n');

// ── 1. 檔案存在且大小合理 ──
console.log('【1】檔案存在性與大小');
if (!fs.existsSync(INDEX)) {
  fail('index.html 不存在！');
  process.exit(1);
}
const stat = fs.statSync(INDEX);
if (stat.size < 100000) {
  fail(`index.html 太小 (${stat.size} bytes)，可能被截斷或覆蓋`);
} else if (stat.size > 1000000) {
  warn(`index.html 很大 (${stat.size} bytes)，確認是否正常`);
} else {
  pass(`index.html 大小正常 (${stat.size} bytes)`);
}

const html = fs.readFileSync(INDEX, 'utf8');

// ── 2. JS 語法驗證 ──
console.log('\n【2】JavaScript 語法驗證');
const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let scriptMatch;
let scriptIndex = 0;
let jsErrors = 0;

while ((scriptMatch = scriptRe.exec(html)) !== null) {
  scriptIndex++;
  const code = scriptMatch[1].trim();
  if (!code) continue;
  
  try {
    new Function(code);
    pass(`<script> 區塊 #${scriptIndex} 語法正確`);
  } catch (e) {
    fail(`<script> 區塊 #${scriptIndex} 語法錯誤: ${e.message}`);
    jsErrors++;
    
    // 嘗試定位錯誤行
    const lines = code.split('\n');
    let lo = 0, hi = lines.length;
    while (hi - lo > 20) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        new Function(lines.slice(0, mid).join('\n'));
        lo = mid;
      } catch (e2) {
        hi = mid;
      }
    }
    console.error(`    → 錯誤大約在該區塊的第 ${lo}-${hi} 行`);
    for (let i = Math.max(0, lo - 2); i < Math.min(lines.length, hi + 2); i++) {
      console.error(`    ${i}: ${lines[i].substring(0, 120)}`);
    }
  }
}

if (jsErrors === 0) {
  pass('所有 JS 區塊通過語法檢查');
}

// ── 3. 引號嵌套風險偵測 ──
console.log('\n【3】引號嵌套風險偵測');
const lines = html.split('\n');
let quoteIssues = 0;

lines.forEach((line, idx) => {
  // 偵測: 真正危險的引號衝突 — 單引號字串內有未轉義的單引號
  // 排除 \' (正確轉義) 的情況
  // 只抓: '+= '<...onclick="...closest('xxx')...' 這種內層單引號沒轉義的
  const stripped = line.replace(/\\'/g, ''); // 移除所有 \' 轉義
  const dangerPattern = /= *'[^']*onclick[^']*\.closest\('[^)]*'\)/;
  if (dangerPattern.test(stripped)) {
    fail(`第 ${idx + 1} 行: 疑似引號嵌套衝突 (closest 內單引號未轉義)`);
    console.error(`    → ${line.substring(0, 150)}`);
    quoteIssues++;
  }
});

if (quoteIssues === 0) {
  pass('未偵測到引號嵌套風險');
}

// ── 4. 關鍵函式存在性 ──
console.log('\n【4】關鍵函式存在性');
const requiredFunctions = [
  'renderTechAccordion',
  'renderChipsAccordion',
  'showBacktestResult',
  'runAccBt',
  'aiPredict',
  'showGrokPrediction',
  'loadGrokKey',
  'saveGrokKey',
  'loadStock',
  'renderChart',
];

requiredFunctions.forEach(fn => {
  const re = new RegExp(`function\\s+${fn}\\s*\\(`);
  if (re.test(html)) {
    pass(`函式 ${fn}() 存在`);
  } else {
    fail(`函式 ${fn}() 遺失！`);
  }
});

// ── 5. 版本一致性 ──
console.log('\n【5】版本一致性');
const versionMatch = html.match(/喵姆[^<]*?(\d+)/);
const htmlVersion = versionMatch ? versionMatch[1] : null;

if (fs.existsSync(SW)) {
  const swContent = fs.readFileSync(SW, 'utf8');
  const swMatch = swContent.match(/CACHE_NAME\s*=\s*'miaomu-v(\d+)/);
  const swVersion = swMatch ? swMatch[1] : null;
  
  if (htmlVersion && swVersion) {
    if (htmlVersion === swVersion) {
      pass(`版本一致: index.html v${htmlVersion}, sw.js v${swVersion}`);
    } else {
      warn(`版本可能不一致: index.html v${htmlVersion}, sw.js v${swVersion} (可接受如有 -fix 後綴)`);
    }
  } else {
    warn('無法自動偵測版本號');
  }
} else {
  warn('sw.js 不存在');
}

// ── 6. HTML 結構完整性 ──
console.log('\n【6】HTML 結構完整性');
if (html.includes('<!DOCTYPE html>') && html.includes('</html>')) {
  pass('HTML 文件結構完整');
} else {
  fail('HTML 文件結構不完整（缺少 DOCTYPE 或 </html>）');
}

const openScripts = (html.match(/<script/g) || []).length;
const closeScripts = (html.match(/<\/script>/g) || []).length;
if (openScripts === closeScripts) {
  pass(`<script> 標籤配對正確 (${openScripts} 對)`);
} else {
  fail(`<script> 標籤不配對: 開啟 ${openScripts}, 關閉 ${closeScripts}`);
}

// ── 結果 ──
console.log('\n' + '═'.repeat(50));
if (errors === 0) {
  console.log(`✅ 驗證通過！${warnings > 0 ? ` (${warnings} 個警告)` : ''}`);
  console.log('   可以安全 git push 了。');
  process.exit(0);
} else {
  console.log(`❌ 驗證失敗！${errors} 個錯誤, ${warnings} 個警告`);
  console.log('   請修復所有錯誤後再 push。');
  process.exit(1);
}
