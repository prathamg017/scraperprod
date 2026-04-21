const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
  useProxy: process.env.USE_PROXY === 'true',
  proxyUrl: process.env.PROXY_URL || null, // Format: http://user:pass@host:port
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '2'),
  puppeteerHeadless: process.env.PUPPETEER_HEADLESS !== 'false',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
  timeout: parseInt(process.env.TIMEOUT || '45000'),
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ],
  freeProxies: [
    'http://185.190.38.1:8080',
    'http://45.142.212.1:8080',
    'http://193.233.202.136:80',
    'http://185.61.152.137:8080',
    'http://41.174.179.147:8080',
    'http://41.174.182.200:8080',
  ],
};

module.exports = config;
