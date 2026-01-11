# Research Analyst API

A simple Express API that provides stock research reports by aggregating data from Finnhub and Alpha Vantage.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your API keys:
```
FINNHUB_API_KEY=your_finnhub_key
ALPHAVANTAGE_API_KEY=your_alphavantage_key
PORT=3001
```

3. Start the server:
```bash
node server.js
```

## Endpoints

### Health Check
**GET** `/api/health`

Returns server status.

### Stock Report
**GET** `/api/report?ticker=SYMBOL`

Returns comprehensive stock analysis for a given ticker symbol.

#### Input
- **Query Parameter**: `ticker` (required) - Stock symbol (e.g., AAPL, MSFT, TSLA)

#### Output Structure
```javascript
{
  "source": "formatted" | "cache",
  "ticker": "AAPL",
  "company": {
    "name": "Apple Inc",
    "ticker": "AAPL",
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "marketCapUsd": 3500000000000
  },
  "price": {
    "current": 195.50,
    "changePct": 1.25
  },
  "valuation": {
    "metrics": {
      "peTtm": 30.5,
      "psTtm": 8.2,
      "evToEbitdaTtm": 22.1
    },
    "quality": {
      "roeTtm": 0.45,
      "netMarginTtm": 0.25
    },
    "magicScore": {
      "score": 72,
      "label": "High"
    }
  },
  "news": [
    {
      "headline": "Apple announces new product",
      "date": "2026-01-10",
      "details": "Short summary of the news article...",
      "url": "https://example.com/article"
    }
  ],
  "missing": {
    "priceChart": "Excluded",
    "peers": "Excluded"
  },
  "meta": {
    "newsRange": {
      "from": "2025-12-12",
      "to": "2026-01-11"
    }
  }
}
```

## Example Usage

### HTML Fetch Example
```html
<script>
  fetch('http://localhost:3001/api/report?ticker=AAPL')
    .then(response => response.json())
    .then(data => {
      console.log('Company:', data.company.name);
      console.log('Price:', data.price.current);
      console.log('Magic Score:', data.valuation.magicScore.score);
    })
    .catch(error => console.error('Error:', error));
</script>
```

### Sample Request
```
GET http://localhost:3001/api/report?ticker=AAPL
```

### Sample Response
```json
{
  "source": "formatted",
  "ticker": "AAPL",
  "company": {
    "name": "Apple Inc",
    "ticker": "AAPL",
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "marketCapUsd": 3450000000000
  },
  "price": {
    "current": 195.89,
    "changePct": 1.42
  },
  "valuation": {
    "metrics": {
      "peTtm": 31.2,
      "psTtm": 8.5,
      "evToEbitdaTtm": 23.1
    },
    "quality": {
      "roeTtm": 0.47,
      "netMarginTtm": 0.26
    },
    "magicScore": {
      "score": 73,
      "label": "High"
    }
  },
  "news": [
    {
      "headline": "Apple Vision Pro sales exceed expectations",
      "date": "2026-01-09",
      "details": "Apple's latest mixed reality headset continues to gain traction...",
      "url": "https://example.com/news/apple-vision-pro"
    }
  ],
  "missing": {
    "priceChart": "Excluded",
    "peers": "Excluded"
  },
  "meta": {
    "newsRange": {
      "from": "2025-12-12",
      "to": "2026-01-11"
    }
  }
}
```

## Notes

- Results are cached for 60 seconds
- Rate limited to 60 requests per minute
- News is from the last 30 days (up to 3 items)
- All numeric values may be `null` if data is unavailable