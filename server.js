const express = require('express');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Check if we are in production (Vercel) environment
const isProduction = process.env.NODE_ENV === 'production';

// Pre-load data for Vercel environment since file access is limited in serverless
let cachedHackathons = null;
let cachedSchemes = null;
let cachedStats = null;

// Function to load data from JSON files
async function loadData() {
  try {
    const hackathonsPath = path.join(__dirname, 'data', 'hackathons.json');
    const schemesPath = path.join(__dirname, 'data', 'schemes.json');
    const statsPath = path.join(__dirname, 'data', 'scrape-stats.json');

    if (await fs.pathExists(hackathonsPath)) {
      cachedHackathons = await fs.readJson(hackathonsPath);
    }

    if (await fs.pathExists(schemesPath)) {
      cachedSchemes = await fs.readJson(schemesPath);
    }

    if (await fs.pathExists(statsPath)) {
      cachedStats = await fs.readJson(statsPath);
    }

    console.log('Data loaded successfully');
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Load data at startup
loadData();

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get hackathons
app.get('/api/hackathons', async (req, res) => {
  try {
    // In production (Vercel), use cached data
    if (isProduction && cachedHackathons) {
      return res.json(cachedHackathons);
    }

    // Otherwise try to read from file system (local development)
    const hackathonsPath = path.join(__dirname, 'data', 'hackathons.json');
    const exists = await fs.pathExists(hackathonsPath);
    
    if (exists) {
      const hackathons = await fs.readJson(hackathonsPath);
      // Update cache
      cachedHackathons = hackathons;
      res.json(hackathons);
    } else {
      res.status(404).json({ error: 'Hackathons data not found' });
    }
  } catch (error) {
    console.error('Error serving hackathons:', error);
    res.status(500).json({ error: 'Failed to load hackathons data' });
  }
});

// API endpoint to get schemes
app.get('/api/schemes', async (req, res) => {
  try {
    // In production (Vercel), use cached data
    if (isProduction && cachedSchemes) {
      return res.json(cachedSchemes);
    }

    // Otherwise try to read from file system (local development)
    const schemesPath = path.join(__dirname, 'data', 'schemes.json');
    const exists = await fs.pathExists(schemesPath);
    
    if (exists) {
      const schemes = await fs.readJson(schemesPath);
      // Update cache
      cachedSchemes = schemes;
      res.json(schemes);
    } else {
      res.status(404).json({ error: 'Schemes data not found' });
    }
  } catch (error) {
    console.error('Error serving schemes:', error);
    res.status(500).json({ error: 'Failed to load schemes data' });
  }
});

// API endpoint to get scrape statistics
app.get('/api/stats', async (req, res) => {
  try {
    // In production (Vercel), use cached data
    if (isProduction && cachedStats) {
      return res.json(cachedStats);
    }

    // Otherwise try to read from file system (local development)
    const statsPath = path.join(__dirname, 'data', 'scrape-stats.json');
    const exists = await fs.pathExists(statsPath);
    
    if (exists) {
      const stats = await fs.readJson(statsPath);
      // Update cache
      cachedStats = stats;
      res.json(stats);
    } else {
      res.status(404).json({ error: 'Scrape statistics not found' });
    }
  } catch (error) {
    console.error('Error serving stats:', error);
    res.status(500).json({ error: 'Failed to load scrape statistics' });
  }
});

// Serve the dashboard for any other route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle all other routes
app.use((req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
