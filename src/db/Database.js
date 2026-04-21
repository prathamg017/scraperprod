'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/Logger');

class DB {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/scraper.db');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        query TEXT,
        location TEXT,
        limit_count INTEGER,
        only_no_web INTEGER DEFAULT 0,
        status TEXT,
        progress INTEGER DEFAULT 0,
        leads_collected INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        name TEXT,
        phone TEXT,
        website TEXT,
        address TEXT,
        rating TEXT,
        reviews TEXT,
        category TEXT,
        hours TEXT,
        maps_url TEXT,
        type TEXT,
        location TEXT,
        is_new INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );
    `);

    // Add missing columns to existing DBs gracefully
    const alterCols = ['hours TEXT', 'maps_url TEXT'];
    for (const col of alterCols) {
      try { this.db.exec(`ALTER TABLE leads ADD COLUMN ${col}`); } catch (_) {}
    }
    try { this.db.exec('ALTER TABLE jobs ADD COLUMN only_no_web INTEGER DEFAULT 0'); } catch (_) {}

    logger.info('[DB] SQLite Initialized with WAL Mode');
  }

  saveJob(job) {
    this.db.prepare(`
      INSERT OR REPLACE INTO jobs (id, query, location, limit_count, only_no_web, status, progress, leads_collected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.query, job.location, job.limit_count, job.only_no_web || 0, job.status, job.progress, job.leads_collected);
  }

  updateJob(jobId, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE jobs SET ${fields} WHERE id = ?`).run(...Object.values(updates), jobId);
  }

  getJob(jobId) {
    const job = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) return null;
    job.results = this.db.prepare('SELECT * FROM leads WHERE job_id = ? ORDER BY created_at ASC').all(jobId);
    return job;
  }

  getAllJobs() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all().map(j => {
      j.results = this.db.prepare('SELECT * FROM leads WHERE job_id = ? ORDER BY created_at ASC').all(j.id);
      return j;
    });
  }

  saveLead(jobId, lead) {
    this.db.prepare(`
      INSERT OR REPLACE INTO leads
        (id, job_id, name, phone, website, address, rating, reviews, category, hours, maps_url, type, location, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lead.id, jobId, lead.name, lead.phone, lead.website,
      lead.address, lead.rating, lead.reviews, lead.category,
      lead.hours || null, lead.maps_url || null,
      lead.type, lead.location, lead.isNew ? 1 : 0
    );
  }

  deleteJob(jobId) {
    this.db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
  }
}

module.exports = new DB();
