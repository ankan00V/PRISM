// Vercel serverless function handler
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Import RAG engine functions
const { executeRAGPipeline, getUserProfile, checkRBAC, rowIsPermitted, parseCSV } = require('../rag_engine');

const app = express();

// Rate limiter: 30 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/', apiLimiter);

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database path
const dbPath = path.join(__dirname, '..', 'prism.db');

// Helper: Run SQL query
function runQuery(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 1. API: Execute RAG Query
app.post('/api/query', async (req, res) => {
  const { username, query } = req.body;
  if (!username || !query) {
    return res.status(400).json({ error: 'Username and Query are required.' });
  }

  try {
    const result = await executeRAGPipeline(username, query);
    res.json(result);
  } catch (error) {
    console.error('RAG Endpoint error:', error);
    res.status(500).json({ error: 'Internal Server Error during RAG processing.' });
  }
});

// 2. API: Fetch User list
app.get('/api/users', async (req, res) => {
  try {
    const users = await runQuery('SELECT * FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user list.' });
  }
});

// 3. API: Fetch Security Audit Logs
app.get('/api/audit-logs', (req, res) => {
  const auditPath = path.join(__dirname, '..', 'logs', 'audit_logs.json');
  try {
    if (fs.existsSync(auditPath)) {
      const logs = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      return res.json(logs);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read audit logs.' });
  }
});

// 4. API: Fetch Available Data Sources
app.get('/api/data-sources', (req, res) => {
  res.json({
    databases: [
      { name: 'salaries', description: 'Employee salary records', allowed_roles: 'executive, hr', min_clearance: 2 },
      { name: 'contracts', description: 'Enterprise client agreements', allowed_roles: 'executive, finance', min_clearance: 2 },
      { name: 'compliance_records', description: 'Regulatory & safety handbook records', allowed_roles: 'executive, hr, finance, it_ops, analyst', min_clearance: 0 }
    ],
    documents: [
      { name: 'Employee_Handbook_2026.pdf', description: 'PRISM general employee manual', allowed_roles: 'executive, hr, finance, it_ops, analyst, intern', min_clearance: 0 },
      { name: 'Project_Phoenix_Specs.pdf', description: 'Technical specs & API configurations', allowed_roles: 'executive, it_ops', min_clearance: 1 },
      { name: 'Q3_Financial_Projections.pdf', description: 'Confidential corporate strategy and M&A details', allowed_roles: 'executive, finance, analyst', min_clearance: 2 }
    ],
    logs: [
      { name: 'infrastructure_logs.json', description: 'Developer database and cache service alerts', allowed_roles: 'executive, it_ops', min_clearance: 1 },
      { name: 'system_audit.json', description: 'Security access check logs', allowed_roles: 'executive', min_clearance: 3 }
    ]
  });
});

// 5. API: Introspect specific Data Source
app.get('/api/source/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const username = req.headers['x-user-id'];

  if (!username) {
    return res.status(401).json({ error: 'Unauthorized. x-user-id header required.' });
  }

  const user = await getUserProfile(username);
  if (!user) {
    return res.status(403).json({ error: 'Access Denied: Invalid Username.' });
  }

  const rbacCheck = checkRBAC(user, type.toUpperCase(), id);
  if (!rbacCheck.allowed) {
    return res.status(403).json({ error: `Access Denied: ${rbacCheck.reason}` });
  }

  try {
    if (type === 'sql') {
      const validTables = ['salaries', 'contracts', 'compliance_records', 'employees', 'financials'];
      if (!validTables.includes(id)) {
        return res.status(400).json({ error: `Invalid table: ${id}` });
      }
      let query = `SELECT * FROM ${id}`;
      let params = [];
      if (user.role.toLowerCase() !== 'executive') {
        if (id === 'contracts') {
          query += ` WHERE allowed_roles LIKE ?`;
          params.push(`%${user.role}%`);
        } else {
          query += ` WHERE clearance_level <= ?`;
          params.push(user.clearance_level);
        }
      }
      const rows = await runQuery(query, params);
      return res.json(rows);
    } else if (type === 'pdf') {
      const filePath = path.join(__dirname, '..', 'documents', id);
      if (fs.existsSync(filePath)) {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return res.json({ name: id, text: data.text });
      }
    } else if (type === 'json') {
      let filePath = path.join(__dirname, '..', 'logs', id);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', 'documents', id);
      }
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const filteredData = data.filter(entry => rowIsPermitted(user, entry));
        return res.json(filteredData);
      }
    } else if (type === 'csv') {
      const filePath = path.join(__dirname, '..', 'documents', id);
      if (fs.existsSync(filePath)) {
        const records = parseCSV(filePath);
        const filteredRecords = records.filter(record => rowIsPermitted(user, record));
        return res.json(filteredRecords);
      }
    }
    res.status(404).json({ error: 'Source not found.' });
  } catch (error) {
    res.status(500).json({ error: `Introspection failed: ${error.message}` });
  }
});

// 6. API: Update Settings / API Key
app.post('/api/settings/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required.' });
  }

  process.env.NVIDIA_API_KEY = apiKey;

  const envPath = path.join(__dirname, '..', '.env');
  try {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('NVIDIA_API_KEY=')) {
      envContent = envContent.replace(/NVIDIA_API_KEY=.*/, `NVIDIA_API_KEY=${apiKey}`);
    } else {
      envContent += `\nNVIDIA_API_KEY=${apiKey}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    res.json({ message: 'API key updated and saved successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save API key to environment config.' });
  }
});

// 7. API: Re-Seed Database
app.post('/api/settings/reseed', (req, res) => {
  const { exec } = require('child_process');
  console.log('Re-seeding database and documents...');
  exec('node database.js && node pdf_generator.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Reseed error: ${error.message}`);
      return res.status(500).json({ error: `Failed to execute seeding scripts: ${error.message}` });
    }
    console.log('Reseed stdout:', stdout);
    res.json({ message: 'Database and PDF documents successfully seeded.' });
  });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;

// Made with Bob
