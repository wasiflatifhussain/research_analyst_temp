# health

curl "http://localhost:3001/api/health"

# finnhub quote

curl "http://localhost:3001/api/finnhub/quote?symbol=AAPL"

# finnhub basic financials

curl "http://localhost:3001/api/finnhub/basic-financials?symbol=AAPL&metric=all"

# alphavantage quote

curl "http://localhost:3001/api/alphavantage/quote?symbol=IBM"

# alphavantage overview

curl "http://localhost:3001/api/alphavantage/overview?symbol=IBM"

# alphavantage news sentiment

curl "http://localhost:3001/api/alphavantage/news-sentiment?tickers=AAPL&limit=20"
