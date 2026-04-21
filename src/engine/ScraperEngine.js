'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');
const logger = require('../utils/Logger');

puppeteer.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── KNOWN CITIES – inline neighborhood expansion ───────────────────────────
const CITIES = {
  mumbai:   ['Andheri','Bandra','Borivali','Dadar','Kurla','Malad','Goregaon','Powai','Thane','Navi Mumbai'],
  london:   ['Westminster','Soho','Camden','Shoreditch','Kensington','Chelsea','Greenwich','Hackney','Brixton','Islington'],
  boston:   ['Back Bay','Beacon Hill','North End','South End','Fenway','Dorchester','Charlestown','Allston','Brighton','Roxbury'],
  dubai:    ['Deira','Bur Dubai','Jumeirah','Downtown Dubai','Business Bay','Marina','JLT','Karama','Mirdif','Satwa'],
  sydney:   ['CBD','Surry Hills','Newtown','Parramatta','Bondi','Chatswood','Manly','Glebe','Redfern','Pyrmont'],
  toronto:  ['Downtown','Scarborough','Etobicoke','North York','Mississauga','Brampton','Markham','Vaughan','Oakville','Richmond Hill'],
  delhi:    ['Dwarka','Rohini','Saket','Pitampura','Janakpuri','Laxmi Nagar','Karol Bagh','CP','Noida','Gurgaon'],
  bangalore:['Koramangala','Indiranagar','Whitefield','HSR Layout','Jayanagar','Marathahalli','Electronic City','Bannerghatta','Yelahanka','Hebbal'],
  NYC:      ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','Harlem','SoHo','Astoria','Williamsburg','Flushing'],
};

function getQueries(query, location) {
  const l = location.toLowerCase();
  const q = query.trim();
  let areas = null;
  for (const [city, areaList] of Object.entries(CITIES)) {
    if (l.includes(city.toLowerCase())) { areas = areaList; break; }
  }
  if (!areas) areas = ['Downtown','Central','West','East','North','South','Business District','Old Town'];
  return [q + ' ' + location, ...areas.map(a => `${q} ${a} ${location}`)];
}

// ── STRICT WEBSITE CHECK ────────────────────────────────────────────────────
function hasRealWebsite(page_content_check) {
  // Only check the dedicated "Website" button/link Google shows — not any random <a> tag
  const webLink = document.querySelector('a[data-item-id="authority"]');
  return !!webLink;
}

class LeadScraperEngine {
  constructor() { this.browser = null; }

  async getBrowser() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    const config = require('../config');
    this.browser = await puppeteer.launch({
      headless: config.puppeteerHeadless ? (config.puppeteerHeadless === 'new' ? 'new' : true) : 'new',
      executablePath: config.executablePath,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-zygote']
    });
    return this.browser;
  }

  async scrape(jobId, type, query, location, limit = 100, updateProgress = () => {}, onlyNoWeb = false) {
    logger.info(`[BEAST] ${limit} leads | "${query}" in "${location}" | No-Web: ${onlyNoWeb}`);
    const browser   = await this.getBrowser();
    const collected = [];
    const seenUrls  = new Set();
    const seenNames = new Set();
    const candidates = [];

    // ── PHASE 1: MULTI-QUERY DISCOVERY ───────────────────────────────────────
    const queries = getQueries(query, location);
    logger.info(`[BEAST] Running ${queries.length} sub-queries across neighbourhoods`);

    for (let i = 0; i < queries.length; i += 5) {
      if (candidates.length >= limit * 3) break;
      const batch = queries.slice(i, i + 5);

      await Promise.allSettled(batch.map(async (q) => {
        if (candidates.length >= limit * 3) return;
        let page;
        try {
          page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 900 });
          await page.setUserAgent(UA);
          await page.setRequestInterception(true);
          page.on('request', r => { if (['image','media','font','stylesheet','other'].includes(r.resourceType())) return r.abort(); r.continue(); });

          await page.goto('https://www.google.com/maps/search/' + encodeURIComponent(q), { waitUntil: 'networkidle2', timeout: 30000 });
          await page.waitForSelector('div.Nv2PK', { timeout: 10000 }).catch(() => {});

          let stale = 0, prevCount = 0;
          while (stale < 5 && candidates.length < limit * 3) {
            const found = await page.evaluate(() =>
              Array.from(document.querySelectorAll('div.Nv2PK')).map(el => {
                const a = el.querySelector('a.hfpxzc') || el.querySelector('a[href*="/maps/place/"]');
                if (!a) return null;
                const nameEl = el.querySelector('.qBF1Pd') || el.querySelector('.fontHeadlineSmall');
                // STRICT: only the dedicated Website button counts as "has website"
                const hasWeb = !!el.querySelector('a[aria-label*="Website"]') || !!el.querySelector('[data-value="Website"]');
                return { url: a.href, name: nameEl?.innerText?.trim(), hasWeb };
              }).filter(x => x && x.url && x.name)
            );

            let added = 0;
            for (const c of found) {
              if (!seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                candidates.push(c);
                added++;
              }
            }

            if (candidates.length === prevCount) stale++; else { stale = 0; prevCount = candidates.length; }

            await page.evaluate(() => { const f = document.querySelector('div[role="feed"]'); if (f) f.scrollBy(0, 5000); else window.scrollBy(0, 5000); });
            await new Promise(r => setTimeout(r, 800));

            const ended = await page.evaluate(() => document.body.innerText.includes("reached the end"));
            if (ended) break;
          }
        } catch (e) { logger.warn(`[P1] "${q}": ${e.message}`); }
        finally { if (page && !page.isClosed()) await page.close().catch(() => {}); }
      }));
    }

    logger.info(`[BEAST] Phase 1 done – ${candidates.length} raw candidates`);

    // ── PHASE 2: DEEP CONTACT EXTRACTION ────────────────────────────────────
    // Pre-filter by card-level hasWeb flag first (fast)
    let targets = onlyNoWeb ? candidates.filter(c => !c.hasWeb) : candidates;
    targets = targets.sort(() => Math.random() - 0.5).slice(0, limit * 2);

    const CONCURRENCY = 8;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      if (collected.length >= limit) break;
      const batch = targets.slice(i, i + CONCURRENCY);

      await Promise.allSettled(batch.map(async (c) => {
        if (collected.length >= limit || seenNames.has(c.name)) return;
        let page;
        try {
          page = await browser.newPage();
          await page.setUserAgent(UA);
          await page.setRequestInterception(true);
          page.on('request', r => { if (['image','media','font','stylesheet','other'].includes(r.resourceType())) return r.abort(); r.continue(); });

          await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await new Promise(r => setTimeout(r, 1500));

          const details = await page.evaluate(() => {
            const qt = s => document.querySelector(s)?.innerText?.trim() || null;
            // STRICT website check – ONLY the authority link Google adds
            const webEl   = document.querySelector('a[data-item-id="authority"]');
            const phoneEl = document.querySelector('button[data-item-id*="phone:tel:"]') || document.querySelector('a[href*="tel:"]');
            const phone   = phoneEl?.innerText?.trim() || (phoneEl?.href?.startsWith('tel:') ? phoneEl.href.replace('tel:','') : null);
            const address = qt('button[data-item-id="address"]') || qt('.rogA2c');
            const rating  = qt('span.MW4etd');
            const reviews = qt('span.UY7F9');
            const category= qt('button.DkEaL');
            return { phone, website: webEl?.href || null, address, rating, reviews, category };
          });

          // STRICT no-web enforcement at Phase 2
          if (onlyNoWeb && details.website) {
            logger.info(`[FILTER] ${c.name} has website – skipped`);
            return;
          }

          if (!seenNames.has(c.name) && collected.length < limit) {
            seenNames.add(c.name);
            collected.push({
              id:       crypto.randomBytes(8).toString('hex'),
              name:     c.name,
              phone:    details.phone || 'No Contact Found',
              website:  details.website || null,
              address:  details.address || location,
              type:     !details.website ? 'Hot 🔥' : 'Cold ❄️',
              category: details.category || null,
              rating:   details.rating   || null,
              reviews:  details.reviews  || null,
              location,
            });
            updateProgress(collected.length, collected);
            logger.info(`[BEAST] ✅ #${collected.length}/${limit}: ${c.name} | ${details.phone || 'No Phone'}`);
          }
        } catch (e) {} 
        finally { if (page && !page.isClosed()) await page.close().catch(() => {}); }
      }));
    }

    logger.info(`[BEAST] ✅ Complete – ${collected.length} gold leads delivered.`);
    return collected;
  }
}

module.exports = new LeadScraperEngine();
