# 喵姆 V31 升級執行計畫
> 基於實際程式碼讀取的精確差距分析，非估算

---

## 真實差距評估（比你拿到的表格更準確）

### ✅ 已完整實作（不需補）
| 功能 | 位置 | 狀態 |
|---|---|---|
| GitHub Actions 每日 14:30 自動排程 | `.github/workflows/daily_update.yml` | 完整，cron 正確 |
| 四角色分析框架（籌碼/技術/情境/風險） | `modules/role_analyzers.py` | 完整，衝突強度 0-1 |
| 凱利公式倉位建議（Half/Quarter/Zero） | `main.py` `calculate_kelly_bet()` | 完整，含停損聯動 |
| 動態風控紅線（警戒/強制停損） | `main.py` `WATCHDOG_LINES` | 完整 |
| 龍蝦大哥安檢閘門 | `main.py` `lobster_gatekeeper()` | 完整 |
| 股票類型差異化（ETF/大/中/小） | `stock_classifier.py` | 完整 |
| Perplexity 提示生成器 | `perplexity_prompts.py` | 完整，四類型專屬 |
| 三重資料 Fallback（FinMind/TWSE/Yahoo） | `utils/stock_price_fetcher.py` | 完整，含假日容忍 |
| Multi-AI Hub 架構 | `multi_ai_core.py` | 框架完整，4個AI接口 |

---

### ❌ 真正缺的三件事（這才是需要補的）

#### 差距 #1：角色分析是「規則引擎」，不是「真 AI」
**現狀**：`role_analyzers.py` 裡的籌碼官/技術官/情境官，用的是 Python 硬編碼規則（`if foreign_net > 5000`、`if rsi > 70`），**不是 LLM 呼叫**。

**目標**：每個角色把原始數據送進對應 AI 模型，讓 AI 用自然語言推理，而不是 if-else。

**影響**：這是最大差距。解決後，分析品質從「規則庫」升級到「真正的 AI 判斷」。

---

#### 差距 #2：三角色互相看不到對方的結論（無迭代辯論）
**現狀**：三角色並行獨立分析，`ConflictResolver` 只做加權平均，**角色 A 永遠不知道角色 B 說了什麼**。

**目標**：2 輪辯論——第一輪各自輸出→第二輪每個角色看到其他角色的結論後「反駁或確認」→最終仲裁。

**影響**：把「三個獨立報告」升級成「真正的委員會辯論」。

---

#### 差距 #3：Backtrader 有引入但沒有策略
**現狀**：`main.py` 有 `import backtrader as bt`，但沒有任何 bt.Strategy 實作，凱利公式用的勝率/賠率是假設值，不是歷史回測結果。

**目標**：用歷史訊號跑回測，把真實勝率餵進凱利公式。

---

## 三週執行計畫

---

### Week 1：讓角色真的用 AI（最高優先）
**目標分數提升：4.3 → 7.0**

#### Day 1-2：為三角色寫 LLM Prompt Template

```python
# modules/role_prompts.py（新建）

CHIP_ANALYZER_PROMPT = """
你是籌碼分析官。你只看法人行為，不看價格走勢。

【輸入數據】
- 外資今日淨買賣：{foreign_net} 張
- 外資連續買超天數：{positive_days} 天
- 投信淨買賣：{trust_net} 張
- 自營商淨買賣：{dealer_net} 張

【你的任務】
1. 判斷方向：bullish / bearish / neutral
2. 信心度：0-100
3. 關鍵證據：2-3 條，每條 1 句話，用白話文

【禁止事項】
- 不看股價，不推測技術型態
- 不說「建議買賣」

【輸出格式（JSON）】
{{"direction": "bullish", "confidence": 75, "evidence": ["理由1", "理由2"]}}
"""

TECH_ANALYZER_PROMPT = """
你是技術分析官。你只看價格和量能，不猜法人意圖。

【輸入數據】
- 收盤價：{close}，月線：{ma20}，季線：{ma60}
- RSI：{rsi}，MACD OSC：{macd_diff}
- 近 5 日漲跌：{price_change_5d}%

【你的任務】
1. 判斷方向：bullish / bearish / neutral
2. 信心度：0-100
3. 關鍵證據：2-3 條

【輸出格式（JSON）】
{{"direction": "bullish", "confidence": 70, "evidence": ["理由1", "理由2"]}}
"""

CONTEXT_ANALYZER_PROMPT = """
你是情境分析官。你只看產業趨勢和事件背景，不看短線量價。

【輸入數據】
- 最新新聞摘要：{news_summary}
- 產業趨勢：{sector_trend}
- 大盤情緒：{market_sentiment}

【你的任務】
1. 判斷方向：bullish / bearish / neutral
2. 信心度：0-100
3. 關鍵事件：2-3 條

【輸出格式（JSON）】
{{"direction": "bullish", "confidence": 65, "evidence": ["理由1", "理由2"]}}
"""

DEBATE_ROUND2_PROMPT = """
你是{role_name}。

【第一輪其他角色的結論】
{other_roles_summary}

【你第一輪的結論】
方向：{my_direction}，信心度：{my_confidence}

看完其他角色的意見後，你是否要修改立場？
- 如果你認同多數意見，可以提升信心度
- 如果你堅持不同立場，說明你的反駁理由

【輸出格式（JSON）】
{{"direction": "bullish", "confidence": 80, "changed": false, "reason": "維持原判，因為..."}}
"""
```

#### Day 3-4：把 LLM 呼叫接入 MultiRoleAnalyzer

```python
# modules/role_analyzers_v31.py（新版）

import json
from multi_ai_core import MultiAIHub
from .role_prompts import CHIP_ANALYZER_PROMPT, TECH_ANALYZER_PROMPT, CONTEXT_ANALYZER_PROMPT, DEBATE_ROUND2_PROMPT

class MultiRoleAnalyzerV31:
    """V31：真正的 LLM 角色 + 兩輪辯論"""
    
    def __init__(self):
        self.ai_hub = MultiAIHub()
        # 角色→AI模型映射
        self.role_models = {
            "籌碼分析官": "gemini",      # 進攻策略
            "技術分析官": "gemini",      # 技術判斷  
            "情境分析官": "perplexity",  # 即時新聞
        }
    
    def _call_role(self, role_name: str, prompt: str) -> dict:
        """呼叫對應 AI 模型"""
        model = self.role_models.get(role_name, "gemini")
        
        if model == "gemini":
            response = self.ai_hub._ask_gemini(prompt)
        elif model == "perplexity":
            response = self.ai_hub._ask_perplexity(prompt)
        else:
            response = self.ai_hub._ask_gemini(prompt)
        
        # 從 AI 回應解析 JSON
        try:
            # 找 JSON 區塊
            import re
            json_match = re.search(r'\{.*?\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass
        return {"direction": "neutral", "confidence": 40, "evidence": ["解析失敗"]}
    
    def analyze(self, chip_data: dict, tech_data: dict, context_data: dict) -> dict:
        """兩輪辯論分析"""
        
        # ── 第一輪：獨立分析 ──────────────────────────
        chip_prompt = CHIP_ANALYZER_PROMPT.format(**chip_data)
        tech_prompt = TECH_ANALYZER_PROMPT.format(**tech_data)
        ctx_prompt = CONTEXT_ANALYZER_PROMPT.format(**context_data)
        
        round1 = {
            "籌碼分析官": self._call_role("籌碼分析官", chip_prompt),
            "技術分析官": self._call_role("技術分析官", tech_prompt),
            "情境分析官": self._call_role("情境分析官", ctx_prompt),
        }
        
        # ── 第二輪：看對手結論後反駁或確認 ──────────────
        round2 = {}
        for role, r1_result in round1.items():
            others = {k: v for k, v in round1.items() if k != role}
            others_summary = "\n".join([
                f"- {k}：{v.get('direction')}（信心 {v.get('confidence')}）— {v.get('evidence', [''])[0]}"
                for k, v in others.items()
            ])
            
            r2_prompt = DEBATE_ROUND2_PROMPT.format(
                role_name=role,
                other_roles_summary=others_summary,
                my_direction=r1_result.get("direction"),
                my_confidence=r1_result.get("confidence"),
            )
            round2[role] = self._call_role(role, r2_prompt)
        
        # ── 仲裁：GPT-4o 整合三角色最終立場 ──────────────
        final_summary = self._final_arbitration(round2)
        
        # ── 計算衝突強度 ──────────────────────────────
        directions = [v.get("direction") for v in round2.values()]
        unique = set(d for d in directions if d != "neutral")
        conflict_intensity = round(len(unique) / 2, 2) if len(unique) > 1 else 0.0
        
        return {
            "round1": round1,
            "round2": round2,
            "conflict_intensity": conflict_intensity,
            "final": final_summary,
        }
    
    def _final_arbitration(self, round2_results: dict) -> dict:
        """GPT-4o 仲裁最終結論"""
        summary_text = "\n".join([
            f"- {role}：{r.get('direction')}（信心 {r.get('confidence')}）— {r.get('reason', r.get('evidence', [''])[0])}"
            for role, r in round2_results.items()
        ])
        
        arbitration_prompt = f"""
你是最終仲裁官。以下是三個獨立分析師的結論（已經過一輪辯論）：

{summary_text}

請整合三方意見，輸出最終投資判斷。

【輸出格式（JSON）】
{{
  "direction": "bullish",
  "confidence": 72,
  "verdict_human": "白話版結論（給不懂股票的人看）",
  "verdict_pro": "專業版結論（含因果推論）",
  "key_risk": "最大風險一句話"
}}
"""
        response = self.ai_hub._ask_chatgpt(arbitration_prompt)
        try:
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass
        return {"direction": "neutral", "confidence": 40, "verdict_human": "無法取得 AI 仲裁結論"}
```

#### Day 5：確認 GitHub Actions LINE 推送正常

```yaml
# .github/workflows/daily_update.yml 新增步驟
- name: 📲 LINE 推送
  if: success()
  env:
    LINE_TOKEN: ${{ secrets.LINE_TOKEN }}
    USER_ID: ${{ secrets.USER_ID }}
  run: |
    python line_notify.py --summary
```

---

### Week 2：Backtrader 回測 + ATR 動態紅線
**目標分數提升：7.0 → 8.5**

#### Day 1-3：Backtrader 歷史訊號回測

```python
# backtest_strategy.py（新建）
import backtrader as bt
import pandas as pd
import json

class MiomuStrategy(bt.Strategy):
    """喵姆訊號回測策略"""
    
    def __init__(self):
        self.signals = []  # 從 daily_analysis.json 載入歷史訊號
    
    def next(self):
        date_str = self.data.datetime.date(0).strftime('%Y-%m-%d')
        signal = self.get_signal(date_str)
        
        if signal == "bullish" and not self.position:
            self.buy(size=100)
        elif signal == "bearish" and self.position:
            self.sell(size=100)
    
    def get_signal(self, date_str: str) -> str:
        # 從歷史 daily_analysis.json 讀取該日訊號
        return "neutral"

def run_backtest(stock_code: str, start_date: str, end_date: str) -> dict:
    """執行回測，回傳勝率/Sharpe/最大回撤"""
    cerebro = bt.Cerebro()
    cerebro.addstrategy(MiomuStrategy)
    
    # 從 FinMind 拉歷史數據
    # ... FinMind DataLoader ...
    
    results = cerebro.run()
    analyzer = results[0]
    
    return {
        "win_rate": 0.0,   # 填入實際計算
        "sharpe": 0.0,
        "max_drawdown": 0.0,
        "total_trades": 0,
    }
```

#### Day 4-5：ATR 動態紅線（取代現在的硬編碼價格）

```python
# utils/atr_calculator.py（新建）

def calculate_atr(prices: list, period: int = 14) -> float:
    """計算 ATR（平均真實波幅）"""
    if len(prices) < period + 1:
        return 0.0
    
    true_ranges = []
    for i in range(1, len(prices)):
        high = prices[i]['high']
        low = prices[i]['low']
        prev_close = prices[i-1]['close']
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        true_ranges.append(tr)
    
    return sum(true_ranges[-period:]) / period


def get_dynamic_stop_levels(entry_price: float, atr: float, 
                             risk_multiplier: float = 2.0) -> dict:
    """
    動態紅線計算
    
    Returns:
        {
            "hard_stop": float,   # 強制停損 = 進場價 - ATR × 2
            "warning": float,     # 警戒線 = 進場價 - ATR × 1.2
        }
    """
    hard_stop = round(entry_price - atr * risk_multiplier, 2)
    warning = round(entry_price - atr * 1.2, 2)
    
    return {
        "hard_stop": hard_stop,
        "warning": warning,
        "atr": round(atr, 2),
        "entry": entry_price,
    }
```

---

### Week 3：凱利公式用真實勝率 + 儀表板升級
**目標分數提升：8.5 → 9.5**

#### Day 1-2：凱利公式接回測結果

```python
# 在 calculate_kelly_bet() 中改用回測勝率
def calculate_kelly_bet_v31(
    stock_id: str,
    current_price: float,
    watchdog_alert: str = None,
    use_backtest: bool = True  # 新參數
) -> dict:
    """V31：凱利公式使用真實回測勝率"""
    
    if use_backtest:
        # 從歷史回測結果讀取
        backtest_result = load_backtest_result(stock_id)
        win_rate = backtest_result.get("win_rate", 0.5)
        risk_reward = backtest_result.get("avg_win_loss_ratio", 1.5)
    else:
        # Fallback：保守假設
        win_rate = 0.5
        risk_reward = 1.5
    
    # 凱利公式（保持原邏輯）
    q = 1 - win_rate
    full_kelly = (risk_reward * win_rate - q) / risk_reward
    half_kelly = max(0, min(25, full_kelly / 2 * 100))
    
    # ... 其餘邏輯不變 ...
```

#### Day 3-5：儀表板新增「辯論過程」顯示區塊

在 `templates/index_v31.html` 中新增：
- 第一輪三角色各自說什麼
- 第二輪誰改變立場、誰堅持
- 最終 GPT 仲裁理由
- 衝突強度視覺化（圓環圖）

---

## 執行優先順序（可平行的標紅）

```
Week 1 Day 1-2：寫 role_prompts.py           ← 必須先完成
Week 1 Day 3-4：接 LLM 到角色分析器          ← 依賴 Day 1-2
Week 1 Day 5：  驗證 LINE 推送                ← 可平行

Week 2 Day 1-3：Backtrader 回測              ← 可平行開始
Week 2 Day 4-5：ATR 動態紅線                 ← 可平行

Week 3 Day 1-2：凱利接真實勝率              ← 依賴 Week 2 回測
Week 3 Day 3-5：儀表板升級                  ← 可平行
```

---

## 要開始哪個？

現在最值得做的一個檔案是 `modules/role_prompts.py`，因為它是 Week 1 所有任務的基礎。

寫完這個，才能把四個 AI 真正接進三角色框架。

---

*喵姆 V31 計畫 · 2026-02-27*
