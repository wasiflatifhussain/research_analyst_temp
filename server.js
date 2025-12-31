"use strict";

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// -----------------------------
// Config
// -----------------------------
const PORT = Number(process.env.PORT || 3001);
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY;

const REQUEST_TIMEOUT_MS = 12_000;
const REPORT_CACHE_TTL_MS = 60_000;

// CORS: allow all (dev)
app.use(cors({ origin: "*" }));

// Rate limit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// -----------------------------
// Simple in-memory cache
// -----------------------------
const CACHE = new Map();

function cacheGet(key) {
  const v = CACHE.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAtMs) {
    CACHE.delete(key);
    console.log(`[CACHE] expired ${key}`);
    return null;
  }
  return v.data;
}

function cacheSet(key, data, ttlMs) {
  CACHE.set(key, { expiresAtMs: Date.now() + ttlMs, data });
  console.log(`[CACHE] set ${key} ttl=${ttlMs}ms`);
}

function requireEnv(name, value) {
  if (!value) {
    const err = new Error(`Missing env var: ${name}`);
    err.statusCode = 500;
    throw err;
  }
}

function safeSymbol(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.:_-]/g, "");
}

async function httpGetJson(url, params) {
  const res = await axios.get(url, {
    params,
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (res.status >= 200 && res.status < 300) return res.data;

  const msg =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  const err = new Error(`Upstream error ${res.status}: ${msg}`);
  err.statusCode = res.status;
  throw err;
}

// -----------------------------
// Formatting helpers
// -----------------------------
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeStr(x) {
  const s = String(x ?? "").trim();
  return s.length ? s : null;
}

function pickMetric(metricMap, keys) {
  for (const k of keys) {
    if (metricMap && metricMap[k] != null) return toNum(metricMap[k]);
  }
  return null;
}

function computeMagicScore({ pe, ps, evEbitda, roe, netMargin }) {
  let score = 50;

  // valuation (lower = better)
  if (pe != null) score += Math.max(-15, Math.min(15, (25 - pe) * 0.8));
  if (ps != null) score += Math.max(-10, Math.min(10, (6 - ps) * 2.0));
  if (evEbitda != null)
    score += Math.max(-10, Math.min(10, (18 - evEbitda) * 1.2));

  // quality (higher = better)
  if (roe != null) score += Math.max(-15, Math.min(15, (roe - 0.12) * 120));
  if (netMargin != null)
    score += Math.max(-10, Math.min(10, (netMargin - 0.1) * 80));

  score = Math.round(Math.max(0, Math.min(100, score)));

  let label = "Medium";
  if (score >= 70) label = "High";
  else if (score <= 35) label = "Low";

  return { score, label };
}

// Finnhub date helpers
function formatYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastNDaysRangeUtc(nDays) {
  const to = new Date();
  const from = new Date(Date.now() - nDays * 24 * 60 * 60 * 1000);
  return { fromYmd: formatYmd(from), toYmd: formatYmd(to) };
}

function clampText(s, maxChars) {
  const t = safeStr(s);
  if (!t) return null;
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 1).trimEnd() + "…";
}

function summary2to3Lines(summary) {
  // Keep it short: roughly 2–3 lines in most UIs
  return clampText(summary, 320);
}

// -----------------------------
// Health
// -----------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ===========================================================
// FORMATTED REPORT ENDPOINT
// ===========================================================
app.get("/api/report", async (req, res, next) => {
  const ticker = safeSymbol(req.query.ticker);
  console.log(`[REQ] /api/report ticker=${ticker}`);

  try {
    requireEnv("FINNHUB_API_KEY", FINNHUB_API_KEY);
    requireEnv("ALPHAVANTAGE_API_KEY", ALPHAVANTAGE_API_KEY);

    if (!ticker) return res.status(400).json({ error: "ticker is required" });

    const cacheKey = `report:${ticker}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log(`[CACHE] hit ${cacheKey}`);
      return res.json({ source: "cache", ...cached });
    }

    const { fromYmd, toYmd } = lastNDaysRangeUtc(30);

    const [fhQuote, fhBasic, avOverview, fhNews] = await Promise.all([
      httpGetJson("https://finnhub.io/api/v1/quote", {
        symbol: ticker,
        token: FINNHUB_API_KEY,
      }),
      httpGetJson("https://finnhub.io/api/v1/stock/metric", {
        symbol: ticker,
        metric: "all",
        token: FINNHUB_API_KEY,
      }),
      httpGetJson("https://www.alphavantage.co/query", {
        function: "OVERVIEW",
        symbol: ticker,
        apikey: ALPHAVANTAGE_API_KEY,
      }),
      httpGetJson("https://finnhub.io/api/v1/company-news", {
        symbol: ticker,
        from: fromYmd,
        to: toYmd,
        token: FINNHUB_API_KEY,
      }),
    ]);

    const company = {
      name: safeStr(avOverview?.Name),
      ticker,
      sector: safeStr(avOverview?.Sector),
      industry: safeStr(avOverview?.Industry),
      marketCapUsd: toNum(avOverview?.MarketCapitalization),
    };

    const price = {
      current: toNum(fhQuote?.c),
      changePct: toNum(fhQuote?.dp),
    };

    const m = fhBasic?.metric || {};
    const pe = pickMetric(m, ["peTTM", "peTtm", "pe"]);
    const ps = pickMetric(m, ["psTTM", "psTtm", "ps"]);
    const evEbitda = pickMetric(m, ["evEbitdaTTM", "evToEbitdaTTM"]);
    const roe = pickMetric(m, ["roeTTM", "roe"]);
    const netMargin = pickMetric(m, ["netMarginTTM", "netMargin"]);

    const valuation = {
      metrics: { peTtm: pe, psTtm: ps, evToEbitdaTtm: evEbitda },
      quality: { roeTtm: roe, netMarginTtm: netMargin },
      magicScore: computeMagicScore({ pe, ps, evEbitda, roe, netMargin }),
    };

    // 2–3 news items, headline + short details + url
    const arr = Array.isArray(fhNews) ? fhNews : [];
    const news = arr.slice(0, 3).map((a) => ({
      headline: safeStr(a?.headline),
      date:
        typeof a?.datetime === "number"
          ? new Date(a.datetime * 1000).toISOString().slice(0, 10)
          : null,
      details: summary2to3Lines(a?.summary),
      url: safeStr(a?.url),
    }));

    const payload = {
      ticker,
      company,
      price,
      valuation,
      news,
      missing: {
        priceChart: "Excluded",
        peers: "Excluded",
      },
      meta: {
        newsRange: { from: fromYmd, to: toYmd },
      },
    };

    cacheSet(cacheKey, payload, REPORT_CACHE_TTL_MS);
    res.json({ source: "formatted", ...payload });
  } catch (e) {
    next(e);
  }
});

// -----------------------------
// Error handler
// -----------------------------
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message, status });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
