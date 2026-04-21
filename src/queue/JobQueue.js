const EventEmitter = require('events');
const scraperEngine = require('../engine/ScraperEngine');
const logger = require('../utils/Logger');
const config = require('../config');
const db = require('../db/Database');

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.activeWorkers = 0;
    this.maxWorkers = config.maxConcurrentJobs || 2;
    // Check queue every 2s
    setInterval(() => this.processQueue(), 2000);
  }

  async addJob(job) {
    logger.info(`[QUEUE] Queuing: ${job.id} — "${job.query}" in "${job.location}"`);
    
    const jobData = {
      id: job.id,
      query: job.query,
      location: job.location,
      limit_count: job.limit_count || 100,
      only_no_web: job.only_no_web ? 1 : 0,
      status: 'queued',
      progress: 0,
      leads_collected: 0
    };

    db.saveJob(jobData);
    this.queue.push(job);
    this.processQueue();
    return job.id;
  }

  async processQueue() {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) return;

    const jobReq = this.queue.shift();
    const job = db.getJob(jobReq.id);
    if (!job) return;

    this.activeWorkers++;
    logger.info(`[QUEUE] Starting: ${job.id} | Workers: ${this.activeWorkers}/${this.maxWorkers}`);
    db.updateJob(job.id, { status: 'scraping' });

    try {
      const leads = await scraperEngine.scrape(
        job.id,
        'maps',
        job.query,
        job.location,
        job.limit_count,
        (progressCount, leadsList) => {
          const latestLead = leadsList[leadsList.length - 1];
          if (latestLead) db.saveLead(job.id, latestLead);
          const pct = Math.min(99, Math.floor((progressCount / job.limit_count) * 100));
          db.updateJob(job.id, { progress: pct, leads_collected: progressCount });
        },
        !!job.only_no_web
      );

      db.updateJob(job.id, { 
        status: 'completed', 
        progress: 100, 
        leads_collected: leads.length 
      });

      logger.info(`[QUEUE] ✅ Completed: ${job.id} — ${leads.length} leads saved in database.`);
    } catch (err) {
      logger.error(`[QUEUE] ❌ Job ${job.id} failed: ${err.message}`);
      db.updateJob(job.id, { 
        status: 'error', 
        error_message: err.message 
      });
    } finally {
      this.activeWorkers--;
      this.processQueue();
    }
  }

  getJob(jobId) {
    return db.getJob(jobId);
  }

  getAllJobs() {
    return db.getAllJobs();
  }

  deleteJob(jobId) {
    db.deleteJob(jobId);
  }
}

module.exports = new JobQueue();
