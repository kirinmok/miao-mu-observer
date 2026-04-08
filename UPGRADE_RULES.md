# 喵姆迭代升級守則

> V43 事故教訓：升級腳本寫入的 HTML 字串引號嵌套錯誤，導致整頁白屏。

## 根因分析 (V43 事故)

| 項目 | 說明 |
|------|------|
| 現象 | 頁面只顯示 logo「喵姆 43」，所有功能消失 |
| 錯誤 | `Unexpected identifier 'div'` — JS 語法錯誤 |
| 位置 | 第 7268 行，`showGrokPrediction` 函式 |
| 根因 | V41 升級腳本插入的 HTML 字串用單引號包裹，但 `onclick="this.closest('div[...]')"` 內的單引號與外層衝突 |
| 修復 | 外層改用雙引號，內層保持單引號 |

## 為什麼會反覆發生？

1. **字串替換盲區**: Python 升級腳本用 `.replace()` 做大段 HTML/JS 插入，無法偵測語法錯誤
2. **無自動驗證**: push 前沒有語法檢查機制
3. **V43 用 `sed`**: 比 Python 更脆弱，無法處理多行字串

## 升級 SOP（強制執行）

### 每次升級必須遵守：

1. **只用 Python 腳本升級**，禁止直接用 `sed` 改 index.html
2. **升級腳本末尾加驗證**：
   ```python
   import subprocess, sys
   result = subprocess.run(['node', 'validate_before_push.js'], capture_output=True, text=True)
   print(result.stdout)
   if result.returncode != 0:
       print(result.stderr)
       print("❌ 驗證失敗，升級中止！")
       sys.exit(1)
   ```
3. **push 前執行 `node validate_before_push.js`**，必須看到 ✅ 才能推
4. **HTML 字串引號規則**：
   - 外層用雙引號 `"..."` 時，HTML 屬性內用單引號
   - 外層用單引號 `'...'` 時，HTML 屬性內用 `\\'` 轉義
   - **永遠不要**在單引號字串內直接放未轉義的單引號

### 驗證腳本涵蓋：

- ✅ JS 語法正確性 (`new Function` 測試)
- ✅ 引號嵌套風險偵測
- ✅ 關鍵函式存在性
- ✅ 檔案大小合理性
- ✅ HTML 結構完整性
- ✅ 版本號一致性

## 快速指令

```bash
# 升級後驗證
node validate_before_push.js

# 確認無誤後推送
git add -A && git commit -m "feat(vXX): 描述" && git push
```
