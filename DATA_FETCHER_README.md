# Taiwan Stock Exchange Data Fetcher Module

A comprehensive Python module for fetching real-time Taiwan stock market data from TWSE and MOPS APIs with built-in caching and technical analysis capabilities.

## Files Created

- **`scripts/data_fetcher.py`** (657 lines) - Main module with DataFetcher and TechnicalCalculator classes
- **`tests/test_fetcher.py`** (312 lines) - Comprehensive test suite (17 tests, all passing)

## Module Overview

### DataFetcher Class

Handles data retrieval from Taiwan Stock Exchange (TWSE) and MOPS APIs with automatic caching.

#### Initialization
```python
from scripts.data_fetcher import DataFetcher

fetcher = DataFetcher(cache_dir="data/cache", cache_ttl_hours=4)
```

#### TWSE API Methods

1. **fetch_daily_prices(date=None)**
   - Fetches daily stock prices for all stocks
   - Returns: List of dicts with Code, Name, TradeVolume, TradeValue, OpeningPrice, HighestPrice, LowestPrice, ClosingPrice, Change, Transaction
   - Endpoint: `/exchangeReport/STOCK_DAY_ALL`

2. **fetch_institutional_trading(date=None)**
   - Fetches 三大法人買賣超 (three major institutional investors trading)
   - Returns: List with foreign investors, investment trust, and dealer buy/sell/net data
   - Endpoint: `/exchangeReport/TWTASU_DAY`

3. **fetch_margin_trading(date=None)**
   - Fetches 融資融券 (margin trading) data
   - Returns: List with margin buy/sell balance and short selling data
   - Endpoint: `/exchangeReport/MI_MARGN`

#### MOPS API Methods

4. **fetch_monthly_revenue(year, month)**
   - Fetches monthly revenue data from MOPS (公開資訊觀測站)
   - Args: year (ROC year, e.g., 114 for 2025), month (1-12)
   - Returns: List of revenue records parsed from HTML response
   - Endpoint: `/mops/web/ajax_t21sc04_ifrs` (POST)

#### Aggregation Methods

5. **get_stock_data(code, date=None)**
   - Fetches comprehensive data for a single stock
   - Aggregates price, institutional, and margin data
   - Returns: Dict ready for analysis engine

#### Cache Management

- **_cache_get(key)** - Retrieve cached data (returns None if expired)
- **_cache_set(key, data)** - Store data in cache
- **_cache_path(key)** - Get cache file path
- Automatic TTL-based expiration
- JSON file-based storage

### TechnicalCalculator Class

Static methods for technical analysis calculations using standard library only.

#### Methods

1. **sma(data, period)** - Simple Moving Average
   - Returns list with SMA values (None for insufficient data)

2. **ema(data, period)** - Exponential Moving Average
   - Returns list with EMA values
   - Multiplier: 2/(period + 1)

3. **rsi(data, period=14)** - Relative Strength Index
   - Returns float (0-100)
   - Calculates average gains and losses over period

4. **macd(data, fast=12, slow=26, signal=9)** - MACD Indicator
   - Returns dict: {'macd': float, 'signal': float, 'histogram': float}
   - MACD line = fast EMA - slow EMA

5. **bollinger(data, period=20, num_std=2)** - Bollinger Bands
   - Returns dict: {'upper': float, 'middle': float, 'lower': float, 'bandwidth': float}
   - Upper/Lower = SMA +/- (num_std * std_dev)

6. **kdj(high, low, close, period=9)** - KDJ Stochastic
   - Returns dict: {'k': float, 'd': float, 'j': float}
   - RSV-based stochastic oscillator

## Usage Examples

### Basic Stock Data Fetching

```python
from scripts.data_fetcher import DataFetcher

# Initialize with custom cache settings
fetcher = DataFetcher(cache_dir="my_cache", cache_ttl_hours=2)

# Fetch today's daily prices (uses TWSE OpenAPI)
prices = fetcher.fetch_daily_prices()  # date defaults to today
for stock in prices[:5]:
    print(f"{stock['Code']}: {stock['ClosingPrice']}")

# Fetch institutional trading data
inst_data = fetcher.fetch_institutional_trading()

# Fetch margin trading data
margin_data = fetcher.fetch_margin_trading()

# Get comprehensive data for single stock
stock_data = fetcher.get_stock_data('2330')  # TSMC
print(stock_data)
```

### Monthly Revenue from MOPS

```python
# Fetch January 2025 revenue (ROC year 114 = 2025)
revenue = fetcher.fetch_monthly_revenue(year=114, month=1)
for item in revenue:
    print(f"{item['Code']}: {item['Name']} - {item['MonthlyRevenue']}")
```

### Technical Analysis

```python
from scripts.data_fetcher import TechnicalCalculator

# Example price data
prices = [100, 102, 101, 105, 107, 106, 110, 112, 111, 115]

# Calculate indicators
sma_5 = TechnicalCalculator.sma(prices, 5)
ema_5 = TechnicalCalculator.ema(prices, 5)
rsi_14 = TechnicalCalculator.rsi(prices, 14)

# MACD analysis
macd_data = TechnicalCalculator.macd(prices)
print(f"MACD: {macd_data['macd']:.4f}")
print(f"Signal: {macd_data['signal']:.4f}")
print(f"Histogram: {macd_data['histogram']:.4f}")

# Bollinger Bands
bb = TechnicalCalculator.bollinger(prices, period=5)
print(f"Upper Band: {bb['upper']}")
print(f"Middle: {bb['middle']}")
print(f"Lower Band: {bb['lower']}")

# KDJ
high_prices = [p + 2 for p in prices]
low_prices = [p - 2 for p in prices]
kdj = TechnicalCalculator.kdj(high_prices, low_prices, prices, 9)
print(f"K: {kdj['k']}, D: {kdj['d']}, J: {kdj['j']}")
```

## Features

### Caching
- Automatic JSON file-based caching
- Configurable TTL (time-to-live)
- Cache expiration checking
- Graceful degradation on network errors (returns cached data if available)
- Filename sanitization for cache keys

### Error Handling
- Network timeout protection (10 second timeout)
- JSON parsing error handling
- Rate limiting between requests (0.5s delay)
- Logging for debugging
- Fallback to cached data on errors

### API Compatibility
- TWSE OpenAPI (JSON responses)
- MOPS HTML parsing (regex-based, no external libraries)
- Session headers with proper User-Agent
- Support for ROC year format conversion (民國年)

### No External Dependencies
- Uses only `requests` (already available)
- All other dependencies from Python standard library
- HTML parsing via regex (no BeautifulSoup needed)

## Testing

Run the comprehensive test suite:

```bash
python tests/test_fetcher.py
```

### Test Coverage (17 tests)

**TestCache** (4 tests)
- Cache set/get functionality
- TTL-based expiration
- Missing key handling
- Path sanitization

**TestTechnicalCalculator** (11 tests)
- SMA/EMA calculation
- RSI uptrend/downtrend/insufficient data
- MACD calculation
- Bollinger Bands with sufficient/insufficient data
- KDJ calculation

**TestDataFetcher** (2 tests)
- Initialization
- Rate limiting

All tests pass without requiring network access or API calls.

## Configuration Reference

From your `config.py`:
```python
TWSE_BASE_URL = "https://openapi.twse.com.tw/v1"
MOPS_BASE_URL = "https://mops.twse.com.tw"
CACHE_DIR = "data/cache"
CACHE_TTL_HOURS = 4
```

## API Notes

### TWSE OpenAPI Quirks
- Date format: YYYYMMDD (e.g., "20250301")
- Returns JSON arrays (not objects)
- Rate limit: Be respectful, 0.5s delay implemented
- Field order matters in array parsing

### MOPS Quirks
- Uses POST with form data
- Returns HTML tables (not JSON)
- Year format: ROC year (民國年 = 西元年 - 1911)
  - 2025 = 114 (2025 - 1911)
  - 2024 = 113 (2024 - 1911)
- HTML parsing via regex

## Error Recovery

The module implements graceful error handling:

```
1. Network Error → Return cached data (if available)
2. Parse Error → Log warning, return empty list
3. Timeout → After 10 seconds, fail gracefully
4. Rate Limiting → Automatic 0.5s delay between requests
```

## Future Enhancements

Possible additions (keeping stdlib-only constraint):
- Historical price data aggregation
- Volume-weighted moving averages (VWMA)
- Standard deviation for volatility analysis
- Moving average convergence
- Support for intraday minute/hour data
- Multi-day aggregation helpers
