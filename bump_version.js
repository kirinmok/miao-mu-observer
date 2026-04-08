#!/usr/bin/env node
/**
 * 喵姆版本同步工具
 * 用法: node bump_version.js <新版本號>
 * 範例: node bump_version.js 45
 *
 * 會自動更新以下所有位置的版本號：
 * 1. index.html — 登入畫面標題
 * 2. index.html — Topbar Logo
 * 3. sw.js — 註解 + CACHE_NAME
 * 4. CLAUDE.md — 專案記憶檔標題 + 版本欄位
 * 5. validate_before_push.js 不需改（它動態讀取）
 *
 * 每次升版只要跑這一行，不用再手動找。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const newVer = process.argv[2];

if (!newVer || !/^\d+$/.test(newVer)) {
  console.error('❌ 用法: node bump_version.js <版本號>');
  console.error('   範例: node bump_version.js 45');
  process.exit(1);
}

const V = newVer;
let changes = 0;

function updateFile(file, replacements) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) {
    console.warn('  ⚠️  跳過（檔案不存在）:', file);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;

  replacements.forEach(function(r) {
    const before = content;
    if (typeof r.from === 'string') {
      content = content.split(r.from).join(r.to);
    } else {
      content = content.replace(r.from, r.to);
    }
    if (content !== before) {
      fileChanged = true;
      console.log('  ✅', file, '—', r.desc);
      changes++;
    }
  });

  if (fileChanged) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log('\n🔄 喵姆版本同步 → V' + V + '\n');

// 1. index.html
updateFile('index.html', [
  {
    desc: '登入畫面標題',
    from: /喵姆看盤 [Vv]\d+/g,
    to: '喵姆看盤 V' + V
  },
  {
    desc: 'Topbar Logo 版本',
    from: /(<span style="font-size:11px;font-weight:600;opacity:0\.7;margin-left:4px;">)[Vv]\d+(<\/span>)/,
    to: '$1V' + V + '$2'
  }
]);

// 2. sw.js
updateFile('sw.js', [
  {
    desc: '註解版本',
    from: /\/\/ 喵姆 [Vv]\d+ Service Worker/,
    to: '// 喵姆 V' + V + ' Service Worker'
  },
  {
    desc: 'CACHE_NAME（加 a 後綴強制刷新快取）',
    from: /CACHE_NAME\s*=\s*'miaomu-v\d+[a-z]?'/,
    to: "CACHE_NAME = 'miaomu-v" + V + "a'"
  }
]);

// 3. CLAUDE.md — 專案記憶檔
updateFile('CLAUDE.md', [
  {
    desc: '專案記憶檔標題',
    from: /喵姆看盤 [Vv]\d+ — 專案記憶檔/,
    to: '喵姆看盤 V' + V + ' — 專案記憶檔'
  },
  {
    desc: '版本欄位',
    from: /版本：[Vv]\d+/,
    to: '版本：V' + V
  }
]);

console.log('\n' + (changes > 0
  ? '✅ 完成！共更新 ' + changes + ' 處。記得跑 validate_before_push.js 驗證。'
  : '⚠️  沒有找到需要更新的地方，請確認版本號是否正確。'
) + '\n');
