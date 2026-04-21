# Unlimited Lead Scraper v2.0 (Production-Ready)

A powerful, unlimited B2B lead generation tool that scrapes Google Maps and enriches data from company websites.

## 🚀 Key Features

- **Unlimited Scraping**: No API keys, no costs, no limits.
- **Data Enrichment**: Automatically extracts emails, phone numbers, and social links from company websites.
- **Production Architecture**:
  - **Modular Logic**: Structured into engine, API, database, and queue layers.
  - **SQLite Persistence**: Jobs and leads are saved to a local database (no data loss).
  - **Job Queue**: Manages concurrent scrapers to prevent server overload.
  - **Anti-Detection**: Uses Stealth mode, rotating User-Agents, and optional proxy support.
- **REST API**: Production-grade Express API with health checks and CSV export.
- **Docker Ready**: Multi-stage Dockerfile optimized for headless browser automation.

## 🛠 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configuration
Create a `.env` file or use environment variables:
```env
PORT=3000
LOG_LEVEL=info
MAX_CONCURRENT_JOBS=2
USE_PROXY=false
# PROXY_URL=http://user:pass@host:port
SCRAPER_API_KEY=your-secret-key
```

### 3. Run
**CLI Mode:**
```bash
node scraper-engine.js --query "restaurants" --location "New York" --limit 100
```

**API Mode:**
```bash
node api-server.js
```

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scrape` | Start a new scraping job |
| GET | `/api/job/:jobId` | Get job status and results |
| GET | `/api/jobs` | List all previous jobs |
| GET | `/api/results/:jobId` | Download leads as CSV |
| GET | `/api/health` | System health and stats |

## 🏗 Directory Structure

```text
├── src/
│   ├── api/            # Express server and routes
│   ├── db/             # SQLite database logic
│   ├── engine/         # Scraper logic (Maps + Website)
│   ├── queue/          # Workload management
│   ├── utils/          # Logger and helpers
│   └── config.js       # Central configuration
├── data/               # SQLite database storage
├── scraper-engine.js   # CLI Entrypoint
└── api-server.js       # API Entrypoint
```

## 🔒 Security & Best Practices

1. **Proxies**: Highly recommended for large-scale operations. Set `USE_PROXY=true` and provide a `PROXY_URL`.
2. **API Key**: In production, always set `SCRAPER_API_KEY` and include `x-api-key` header in requests.
3. **Headless**: Keep `PUPPETEER_HEADLESS=true` for production efficiency.

## ⚖️ Legal Disclaimer

Scraping Google Maps may violate their Terms of Service. This tool is for educational and development purposes. Use responsibly and consider the official Google Maps API for large-scale commercial use.
