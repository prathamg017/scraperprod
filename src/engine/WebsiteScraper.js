const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/Logger');
const config = require('../config');

class WebsiteScraper {
  constructor() {
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.phoneRegex = /(\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?[2-9]\d{2}[-.\s]?\d{4}/g;
    this.socialPatterns = {
      facebook: /facebook\.com\/[\w\-\.]+/gi,
      twitter: /twitter\.com\/[\w\-\.]+/gi,
      linkedin: /linkedin\.com\/(company|in)\/[\w\-\.]+/gi,
      instagram: /instagram\.com\/[\w\-\.]+/gi,
    };
  }

  getRandomUserAgent() {
    return config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
  }

  async scrape(url) {
    if (!url || !url.startsWith('http')) return null;

    try {
      logger.debug(`[ENriching] Scraping website: ${url}`);
      const response = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': this.getRandomUserAgent() },
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);
      const content = response.data;
      
      const data = {
        title: $('title').text().trim() || null,
        description: $('meta[name="description"]').attr('content')?.trim() || null,
        emails: this.extractEmails(content),
        phones: this.extractPhones(content),
        social: this.extractSocial(content),
        enriched: true,
      };

      return data;
    } catch (error) {
      logger.warn(`[ENriching] Failed to scrape ${url}: ${error.message}`);
      return null;
    }
  }

  extractEmails(html) {
    const matches = html.match(this.emailRegex) || [];
    return [...new Set(matches)].slice(0, 5);
  }

  extractPhones(html) {
    const matches = html.match(this.phoneRegex) || [];
    return [...new Set(matches)].slice(0, 3);
  }

  extractSocial(html) {
    const social = {};
    Object.keys(this.socialPatterns).forEach(platform => {
      const matches = html.match(this.socialPatterns[platform]);
      if (matches) social[platform] = [...new Set(matches)][0];
    });
    return social;
  }
}

module.exports = new WebsiteScraper();
