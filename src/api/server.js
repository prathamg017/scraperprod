const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const config = require('../config');
const logger = require('../utils/Logger');
const jobQueue = require('../queue/JobQueue');

const app = express();
app.use(cors());
app.use(express.json());

// Serve dashboard
app.use(express.static(path.join(__dirname, '../../public')));

// ── Health / Stats ────────────────────────────────────────
const getGlobalStats = () => {
  const jobs = jobQueue.getAllJobs();
  return {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    activeWorkers: jobQueue.activeWorkers,
    queueLength: jobQueue.queue.length,
    totalJobs: jobs.length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    totalLeads: jobs.reduce((s, j) => s + (j.leads_collected || 0), 0),
  };
};

app.get('/api/health', (req, res) => res.json(getGlobalStats()));
app.get('/api/stats', (req, res) => res.json(getGlobalStats()));

// ── Start a scrape ────────────────────────────────────────
// Support both /api/scrape and /api/scrape/maps for frontend compatibility
const handleScrapeRequest = async (req, res) => {
  try {
    const { query, location, limit = 100, onlyNoWeb = false } = req.body;
    if (!query || !location) {
      return res.status(400).json({ error: 'query and location are required' });
    }
    const lim = Math.min(Math.max(1, parseInt(limit) || 100), 1000);
    const jobId = crypto.randomUUID();
    await jobQueue.addJob({ id: jobId, query, location, limit_count: lim, only_no_web: onlyNoWeb ? 1 : 0 });
    res.json({ jobId, status: 'queued', message: `Scraping ${lim} ${onlyNoWeb ? 'no-website ' : ''}leads for "${query}" in "${location}"` });
  } catch (err) {
    logger.error(`[API] scrape error: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

app.post('/api/scrape', handleScrapeRequest);
app.post('/api/scrape/maps', handleScrapeRequest);

// ── Get all jobs ──────────────────────────────────────────
app.get('/api/jobs', (req, res) => {
  const jobs = jobQueue.getAllJobs().map(j => ({
    id: j.id,
    query: j.query,
    location: j.location,
    limit_count: j.limit_count,
    status: j.status,
    progress: j.progress || (j.status === 'completed' ? 100 : 0),
    leads_collected: j.leads_collected,
    error_message: j.error_message
  }));
  res.json({ jobs });
});

// ── Get single job status (with results) ──────────────────
app.get('/api/job/:jobId', (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  res.json(job);
});

// ── Export / Results ──────────────────────────────────────
app.get('/api/results/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const leads = job.results || [];
  if (!leads || leads.length === 0) {
    if (job.status !== 'completed') {
      return res.status(202).json({ message: `Job ${job.status}`, collected: job.leads_collected });
    }
    return res.status(404).json({ error: 'No leads collected for this job.' });
  }

  const csv = generateCSV(leads, job);
  const safeQuery = (job.query || 'leads').replace(/[^a-z0-9]/gi, '_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeQuery}_${leads.length}.csv"`);
  res.send(csv);
});

// Global Export
app.get('/api/export', (req, res) => {
  const jobs = jobQueue.getAllJobs();
  const allLeads = jobs.flatMap(j => j.results || []);
  const csv = generateCSV(allLeads, { query: 'all_leads', location: 'global' });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="all_leads_export.csv"');
  res.send(csv);
});

function generateCSV(leads, job) {
  const headers = ['Name', 'Type', 'Phone', 'Website', 'Address', 'Rating', 'Reviews', 'Location'];
  const rows = leads.map(l => [
    l.name || '', l.type || '', l.phone || '', l.website || '', l.address || '', l.rating || '', l.reviews || '', l.location || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// ── Delete a job ──────────────────────────────────────────
app.delete('/api/job/:jobId', (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  jobQueue.deleteJob(req.params.jobId);
  res.json({ success: true });
});

const PORT = config.port || 3000;
const server = app.listen(PORT, () => {
    logger.info(`
╔══════════════════════════════════════╗
║   LEAD SCRAPER PRO v3.0 ACTIVE       ║
║   Port: ${PORT}                         ║
║   Sync: Database + CLI Connected     ║
╚══════════════════════════════════════╝`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.warn(`[API] Port ${PORT} busy, attempting cleanup...`);
        // We'll let nodemon handle the restart, but we've alerted the user
    }
});

