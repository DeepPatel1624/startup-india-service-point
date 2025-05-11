const express = require('express');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get hackathons
app.get('/api/hackathons', async (req, res) => {
  try {
    const hackathonsPath = path.join(__dirname, 'data', 'hackathons.json');
    const exists = await fs.pathExists(hackathonsPath);
    
    if (exists) {
      const hackathons = await fs.readJson(hackathonsPath);
      res.json(hackathons);
    } else {
      res.status(404).json({ error: 'Hackathons data not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load hackathons data' });
  }
});

// API endpoint to get schemes
app.get('/api/schemes', async (req, res) => {
  try {
    const schemesPath = path.join(__dirname, 'data', 'schemes.json');
    const exists = await fs.pathExists(schemesPath);
    
    if (exists) {
      const schemes = await fs.readJson(schemesPath);
      res.json(schemes);
    } else {
      res.status(404).json({ error: 'Schemes data not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load schemes data' });
  }
});

// API endpoint to get scrape statistics
app.get('/api/stats', async (req, res) => {
  try {
    const statsPath = path.join(__dirname, 'data', 'scrape-stats.json');
    const exists = await fs.pathExists(statsPath);
    
    if (exists) {
      const stats = await fs.readJson(statsPath);
      res.json(stats);
    } else {
      res.status(404).json({ error: 'Scrape statistics not found' });
    }
  } catch (error) {
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
