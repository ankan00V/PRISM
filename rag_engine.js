const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const pdf = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();

const dbPath = path.join(__dirname, 'prism.db');
// Read API key dynamically so runtime updates via /api/settings/apikey take effect
function getNvidiaApiKey() { return process.env.NVIDIA_API_KEY || ''; }
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = 'google/gemma-3n-e2b-it';

// Cache for extracted PDF contents to optimize speed
let pdfCache = {};

// In-memory query cache to protect security credentials and improve performance
const queryCache = new Map();

// Helper: check if text contains word as a whole word (case-insensitive)
const STOP_WORDS = new Set([
  'show', 'details', 'what', 'where', 'when', 'how', 'many', 'much', 'about', 'with', 'this', 'that', 'here', 'there', 'were', 'been', 'have',
  'the', 'and', 'for', 'are', 'was', 'but', 'not', 'out', 'you', 'your', 'his', 'her', 'their', 'them', 'they', 'our', 'its', 'from', 'in', 'on', 'at'
]);

// Document and Silo security registry
const DOCUMENT_REGISTRY = {
  'compliance_report_2024.pdf': {
    allowed_roles: ['executive', 'compliance'],
    min_clearance: 3,
    classification: 'CONFIDENTIAL'
  },
  'hr_handbook_v3.pdf': {
    allowed_roles: ['executive', 'hr', 'compliance'],
    min_clearance: 2,
    classification: 'INTERNAL'
  },
  'board_deck_Q3_2024.pdf': {
    allowed_roles: ['executive', 'compliance'],
    min_clearance: 3,
    classification: 'CONFIDENTIAL'
  },
  'it_security_policy.pdf': {
    allowed_roles: ['executive', 'it_ops', 'compliance', 'analyst'],
    min_clearance: 1,
    classification: 'INTERNAL'
  },
  'sales_kpi_2026.csv': {
    allowed_roles: ['executive', 'finance', 'analyst'],
    min_clearance: 1,
    classification: 'RESTRICTED'
  },
  'compliance_records.csv': {
    allowed_roles: ['executive', 'compliance'],
    min_clearance: 3,
    classification: 'CONFIDENTIAL'
  },
  // Legacy PDF support for tests
  'Employee_Handbook_2026.pdf': {
    allowed_roles: ['executive', 'hr', 'finance', 'it_ops', 'analyst', 'intern'],
    min_clearance: 0,
    classification: 'PUBLIC'
  },
  'Project_Phoenix_Specs.pdf': {
    allowed_roles: ['executive', 'it_ops'],
    min_clearance: 1,
    classification: 'RESTRICTED'
  },
  'Q3_Financial_Projections.pdf': {
    allowed_roles: ['executive', 'finance', 'analyst'],
    min_clearance: 2,
    classification: 'CONFIDENTIAL'
  }
};

const INJECTION_PATTERNS = [
  /ignore (all |previous |above |prior )?instructions/i,
  /you are (now |actually |really )?a/i,
  /forget (everything|your|all)/i,
  /\bsystem prompt\b/i,
  /\bjailbreak\b/i
];

function sanitizeQuery(q) {
  // Strip SQL keywords and truncate to prevent memory buffer issues
  return q.replace(/(\bDROP\b|\bDELETE\b|--|;)/gi, '[FILTERED]').slice(0, 500);
}

function detectPromptInjection(query) {
  return INJECTION_PATTERNS.some(pattern => pattern.test(query));
}

function rowIsPermitted(user, record) {
  if (!user) return false;
  const clearance = parseInt(record.clearance_level ?? record.clearance ?? '0', 10);
  return (user.clearance_level ?? 0) >= clearance;
}

// TF-IDF & Keyword Hybrid Scoring
function tfidfScore(query, text) {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0 && !STOP_WORDS.has(t));
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  if (wordCount === 0 || queryTerms.length === 0) return 0;
  
  return queryTerms.reduce((score, term) => {
    // Term Frequency (TF)
    const tf = words.filter(w => w === term).length / wordCount;
    // Simple Inverse Document Frequency (IDF) mock
    const containsTermCount = text.toLowerCase().includes(term) ? 1 : 0;
    const idf = Math.log(1 + 1 / (1 + containsTermCount));
    return score + (tf * idf);
  }, 0);
}

function keywordScore(query, text) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0 && !STOP_WORDS.has(t));
  if (terms.length === 0) return 0;
  const matched = terms.filter(t => text.toLowerCase().includes(t));
  return matched.length / terms.length;
}

function hybridScore(query, text) {
  const tfidfVal = tfidfScore(query, text);
  const keywordVal = keywordScore(query, text);
  return (0.6 * tfidfVal) + (0.4 * keywordVal);
}

function hasWord(text, word) {
  if (!word) return false;
  const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp('\\b' + escaped + '\\b', 'i');
  return regex.test(text);
}

// Helper: Open SQLite database connection
function getDbConnection() {
  return new sqlite3.Database(dbPath);
}

// Helper: Run SQL query asynchronously
function runSqlQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper: Fetch User Profile from SQLite
async function getUserProfile(username) {
  const db = getDbConnection();
  try {
    const rows = await runSqlQuery(db, `SELECT * FROM users WHERE username = ?`, [username]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  } finally {
    db.close();
  }
}

// Helper: Extract text from PDF
async function readPdfText(filename) {
  if (pdfCache[filename]) return pdfCache[filename];
  const filePath = path.join(__dirname, 'documents', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document ${filename} not found.`);
  }
  const dataBuffer = fs.readFileSync(filePath);
  const parsedData = await pdf(dataBuffer);
  pdfCache[filename] = parsedData.text;
  return parsedData.text;
}

// Helper: Call Nvidia LLM API
async function callLLM(systemPrompt, userPrompt) {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY not configured. Using offline fallback.');
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const payload = {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 1024,
    temperature: 0.1,
    top_p: 0.7
  };

  try {
    const response = await axios.post(API_URL, payload, { headers, timeout: 15000 });
    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content.trim();
    }
    throw new Error('Invalid response structure from Nvidia API.');
  } catch (error) {
    console.error('Nvidia API call failed:', error.message);
    throw error;
  }
}

// Rule-based Fallback Router (if API is down or Key is missing)
function fallbackRoute(query) {
  const q = query.toLowerCase();
  const sources = [];

  if (q.includes('salary') || q.includes('salaries') || q.includes('pay') || q.includes('earn') || q.includes('ceo') || q.includes('employee') || q.includes('contract') || q.includes('client') || q.includes('deal') || q.includes('revenue') || q.includes('financial') || q.includes('compliance') || q.includes('workplace') || q.includes('safety') || q.includes('reimbursement') || q.includes('ebitda') || q.includes('net_income') || q.includes('headcount')) {
    sources.push('SQL');
  }
  if (q.includes('handbook') || q.includes('policy') || q.includes('vacation') || q.includes('remote') || q.includes('specs') || q.includes('technical') || q.includes('architecture') || q.includes('merger') || q.includes('acquisition') || q.includes('q3') || q.includes('phoenix') || q.includes('board') || q.includes('summary') || q.includes('onboarding') || q.includes('report') || q.includes('soc2') || q.includes('gdpr') || q.includes('password') || q.includes('vpn') || q.includes('incident')) {
    sources.push('PDF');
  }
  if (q.includes('log') || q.includes('alert') || q.includes('ip') || q.includes('cpu') || q.includes('spike') || q.includes('connections') || q.includes('audit')) {
    sources.push('JSON');
  }
  if (q.includes('sales') || q.includes('kpi') || q.includes('target') || q.includes('actual') || q.includes('region') || q.includes('quarter') || q.includes('east') || q.includes('west') || q.includes('spreadsheet')) {
    sources.push('CSV');
  }

  // Default fallback if no keywords found
  if (sources.length === 0) {
    sources.push('PDF');
  }

  return {
    sources,
    keywords: query.split(/\s+/).filter(w => w.length > 3).map(w => w.replace(/[^a-zA-Z]/g, ''))
  };
}

// Perform Query Routing via LLM
async function routeQuery(query, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'Routing & Intent Analysis',
    status: 'IN_PROGRESS',
    message: 'Analyzing user query to determine target datasets...'
  });

  const systemPrompt = `You are an AI Query Router for an enterprise database/document search system.
Analyze the user's natural language query and decide which data sources are relevant.
Available sources:
1. "SQL": Structured data about employees, salaries, contracts, compliance policies, or quarterly financials.
2. "PDF": Internal documents, specifications, handbooks, board decks, compliance audits, or security policies.
3. "JSON": Infrastructure logs, server alerts, or security audit logs.
4. "CSV": Sales performance KPIs, compliance spreadsheets, and targets.

You must output a valid JSON object ONLY. Do not write markdown blocks or any other explanation.
Format:
{
  "intent": "factual_lookup|trend_analysis|compliance_check|incident_review|comparison|summarization",
  "primary_source": "SQL|PDF|JSON|CSV",
  "sources": ["SQL", "PDF", "JSON", "CSV"],
  "keywords": ["search", "keywords", "here"]
}`;

  try {
    const rawResult = await callLLM(systemPrompt, `Query: "${query}"`);
    const cleanResult = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
    const routeInfo = JSON.parse(cleanResult);

    steps.push({
      phase: 'Routing & Intent Analysis',
      status: 'COMPLETED',
      message: `Routed query to data sources: ${routeInfo.sources.join(', ')}`,
      details: routeInfo
    });

    return routeInfo;
  } catch (error) {
    const fallback = fallbackRoute(query);
    const intent = query.toLowerCase().includes('trend') ? 'trend_analysis' : 'factual_lookup';
    const fallbackInfo = {
      intent,
      primary_source: fallback.sources[0] || 'PDF',
      sources: fallback.sources,
      keywords: fallback.keywords
    };
    steps.push({
      phase: 'Routing & Intent Analysis',
      status: 'FALLBACK',
      message: `Nvidia Routing API unavailable. Triggered keyword-based fallback router: Routed to ${fallback.sources.join(', ')}`,
      details: fallbackInfo
    });
    return fallbackInfo;
  }
}

// Programmatic RBAC Enforcement Check
function checkRBAC(user, source, identifier) {
  const role = (user.role || '').toLowerCase();

  // Executive has access to ALL
  if (role === 'executive') return { allowed: true };

  // Check registry if present
  if (identifier) {
    const regEntry = DOCUMENT_REGISTRY[identifier];
    if (regEntry) {
      if (!regEntry.allowed_roles.includes(role)) {
        return { allowed: false, reason: `Role '${role}' is not permitted to access resource [${identifier}].` };
      }
      if (user.clearance_level < regEntry.min_clearance) {
        return { allowed: false, reason: `Clearance level ${user.clearance_level} is insufficient for [${identifier}] (requires Level ${regEntry.min_clearance}).` };
      }
      return { allowed: true };
    }
  }

  // Silo level access checks
  const SILO_PERMISSIONS = {
    pdf:  ['executive', 'hr', 'finance', 'compliance', 'analyst', 'intern'],
    sql:  ['executive', 'finance', 'compliance', 'hr', 'it_ops'],
    json: ['executive', 'it_ops', 'compliance'],
    csv:  ['executive', 'finance', 'analyst', 'compliance'],
  };

  const allowedRoles = SILO_PERMISSIONS[source.toLowerCase()];
  if (!allowedRoles || !allowedRoles.includes(role)) {
    return { allowed: false, reason: `Role '${role}' is not permitted to access ${source} silo.` };
  }

  // Row/Identifier specific checks for databases/logs if not in registry
  if (source.toUpperCase() === 'SQL') {
    if (identifier === 'salaries' && !['executive', 'hr'].includes(role)) {
      return { allowed: false, reason: `Table 'salaries' requires executive or hr roles.` };
    }
    if (identifier === 'employees' && !['executive', 'hr', 'finance'].includes(role)) {
      return { allowed: false, reason: `Table 'employees' requires executive, hr, or finance roles.` };
    }
    if (identifier === 'contracts' && !['executive', 'finance'].includes(role)) {
      return { allowed: false, reason: `Table 'contracts' requires executive or finance roles.` };
    }
    if (identifier === 'financials' && !['executive', 'finance'].includes(role)) {
      return { allowed: false, reason: `Table 'financials' requires executive or finance roles.` };
    }
  }

  if (source.toUpperCase() === 'JSON') {
    if (identifier === 'system_audit.json' && role !== 'executive') {
      return { allowed: false, reason: `Log file 'system_audit.json' is restricted to executives only.` };
    }
    if (identifier === 'infrastructure_logs.json' && !['executive', 'it_ops'].includes(role)) {
      return { allowed: false, reason: `Log file 'infrastructure_logs.json' requires executive or it_ops roles.` };
    }
  }

  // Intern only has access to Public PDFs (min_clearance = 0)
  if (role === 'intern') {
    if (source.toUpperCase() === 'PDF') {
      if (!identifier) {
        return { allowed: true };
      }
      const reg = DOCUMENT_REGISTRY[identifier];
      if (reg && reg.min_clearance === 0) {
        return { allowed: true };
      }
    }
    return { allowed: false, reason: 'Interns are restricted to public PDF handbooks only.' };
  }

  return { allowed: true };
}

// Enforce SQL security: intercept SQL queries, apply parameterized security
function enforceSQLSecurity(sql, user) {
  let upper = sql.toUpperCase();
  let modifiedSql = sql;
  let params = [];

  const hasEmployees = upper.includes('EMPLOYEES');
  const hasFinancials = upper.includes('FINANCIALS');
  const hasSalaries = upper.includes('SALARIES');
  const hasCompliance = upper.includes('COMPLIANCE_RECORDS');
  const hasContracts = upper.includes('CONTRACTS');

  // Inject RLS for contracts using allowed_roles check
  if (hasContracts) {
    if (upper.includes('WHERE')) {
      modifiedSql = modifiedSql.replace(/\bWHERE\b/i, `WHERE allowed_roles LIKE ? AND `);
    } else {
      modifiedSql += ` WHERE allowed_roles LIKE ?`;
    }
    params.push(`%${user.role}%`);
  }

  // Inject RLS clearance filters
  const clearanceTables = [];
  if (hasEmployees) clearanceTables.push('employees');
  if (hasFinancials) clearanceTables.push('financials');
  if (hasSalaries) clearanceTables.push('salaries');
  if (hasCompliance) clearanceTables.push('compliance_records');

  for (const tbl of clearanceTables) {
    if (user.role.toLowerCase() !== 'executive') {
      const whereRegex = /\bWHERE\b/i;
      if (whereRegex.test(modifiedSql)) {
        modifiedSql = modifiedSql.replace(whereRegex, `WHERE ${tbl}.clearance_level <= ? AND `);
      } else {
        modifiedSql += ` WHERE ${tbl}.clearance_level <= ?`;
      }
      params.push(user.clearance_level);
    }
  }

  return { sql: modifiedSql, params };
}

// Retrieve context from SQLite (SQL)
async function retrieveSQLContext(query, user, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'SQL Retrieval',
    status: 'IN_PROGRESS',
    message: 'Translating query to SQL database lookup...'
  });

  const db = getDbConnection();
  try {
    const systemPrompt = `You are a database query generator for SQLite.
Generate a safe, read-only SQL SELECT statement to retrieve records that answer the user query.
Database schema:
1. employees (emp_id, name, department, role, salary, clearance_level)
2. financials (fiscal_year, quarter, revenue, ebitda, net_income, clearance_level)
3. salaries (id, name, department, role, base_salary, bonus, clearance_level)
4. contracts (id, client_name, project_name, contract_value, status, allowed_roles)
5. compliance_records (id, policy_name, category, content, clearance_level)

Output ONLY the raw SQL code. Do not wrap in markdown, do not write comments, and do not use semicolon.`;

    let sqlQuery = '';
    try {
      sqlQuery = await callLLM(systemPrompt, `Query: "${query}"`);
      sqlQuery = sqlQuery.replace(/```sql/g, '').replace(/```/g, '').replace(/;/g, '').trim();
    } catch (e) {
      const q = query.toLowerCase();
      if (q.includes('employee') || q.includes('staff')) {
        sqlQuery = 'SELECT emp_id, name, department, role, salary FROM employees';
      } else if (q.includes('salary') || q.includes('salaries') || q.includes('pay') || q.includes('earn')) {
        sqlQuery = 'SELECT name, department, role, base_salary, bonus FROM salaries';
      } else if (q.includes('revenue') || q.includes('financial') || q.includes('ebitda') || q.includes('net_income') || q.includes('income')) {
        sqlQuery = 'SELECT fiscal_year, quarter, revenue, ebitda, net_income FROM financials';
      } else if (q.includes('contract') || q.includes('deal') || q.includes('client')) {
        sqlQuery = 'SELECT client_name, project_name, contract_value, status FROM contracts';
      } else {
        sqlQuery = 'SELECT policy_name, category, content FROM compliance_records';
      }
    }

    // Safety checks
    const upperSQL = sqlQuery.toUpperCase();
    if (upperSQL.includes('DELETE') || upperSQL.includes('UPDATE') || upperSQL.includes('INSERT') || upperSQL.includes('DROP') || upperSQL.includes('ALTER')) {
      throw new Error('Unauthorized write command detected in SQL generation!');
    }

    // Determine target tables
    const targetTables = [];
    if (upperSQL.includes('EMPLOYEES')) targetTables.push('employees');
    if (upperSQL.includes('FINANCIALS')) targetTables.push('financials');
    if (upperSQL.includes('SALARIES')) targetTables.push('salaries');
    if (upperSQL.includes('CONTRACTS')) targetTables.push('contracts');
    if (upperSQL.includes('COMPLIANCE_RECORDS')) targetTables.push('compliance_records');

    if (targetTables.length === 0) {
      targetTables.push('compliance_records');
      sqlQuery = 'SELECT policy_name, category, content FROM compliance_records';
    }

    let records = [];
    let rbacWarnings = [];
    let totalRlsFiltered = 0;

    for (const table of targetTables) {
      const rbacCheck = checkRBAC(user, 'SQL', table);
      if (!rbacCheck.allowed) {
        rbacWarnings.push(`Blocked access to database table [${table}]: ${rbacCheck.reason}`);
        continue;
      }

      // Enforce parameterized row level filters
      const { sql: finalSQL, params } = enforceSQLSecurity(sqlQuery, user);

      // Execute SQL query
      const rows = await runSqlQuery(db, finalSQL, params);

      // Count RLS filtered rows (compare query count with unfiltered count)
      let rlsFiltered = 0;
      try {
        if (table !== 'contracts' && user.role.toLowerCase() !== 'executive') {
          // Find standard unfiltered count matching key columns
          const baseTableQuery = `SELECT COUNT(*) as count FROM ${table}`;
          const totalRowsRes = await runSqlQuery(db, baseTableQuery);
          const allowedRowsRes = await runSqlQuery(db, `SELECT COUNT(*) as count FROM ${table} WHERE clearance_level <= ?`, [user.clearance_level]);
          rlsFiltered = Math.max(0, totalRowsRes[0].count - allowedRowsRes[0].count);
        }
      } catch (countErr) {
        console.error('Error calculating RLS SQL filter count:', countErr);
      }

      totalRlsFiltered += rlsFiltered;
      records.push(...rows.map(r => ({ source: `SQL:${table}`, data: r })));
    }

    steps.push({
      phase: 'SQL Retrieval',
      status: rbacWarnings.length > 0 && records.length === 0 ? 'BLOCKED' : 'COMPLETED',
      message: `Successfully retrieved ${records.length} database records. ${totalRlsFiltered} rows withheld by RLS.`,
      rls_filtered: totalRlsFiltered
    });

    if (rbacWarnings.length > 0 && trace.security_alerts) {
      trace.security_alerts.push(...rbacWarnings);
    }

    return { records, rlsFiltered: totalRlsFiltered, warnings: rbacWarnings };
  } catch (error) {
    steps.push({
      phase: 'SQL Retrieval',
      status: 'ERROR',
      message: `SQL Retrieval failed: ${error.message}`
    });
    return { records: [], rlsFiltered: 0, warnings: [error.message] };
  } finally {
    db.close();
  }
}

// Retrieve context from PDF (Documents)
async function retrievePDFContext(query, keywords, user, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'PDF Retrieval',
    status: 'IN_PROGRESS',
    message: 'Searching enterprise PDF documents folder...'
  });

  const pdfFiles = [
    'compliance_report_2024.pdf',
    'hr_handbook_v3.pdf',
    'board_deck_Q3_2024.pdf',
    'it_security_policy.pdf',
    // legacy files
    'Employee_Handbook_2026.pdf',
    'Project_Phoenix_Specs.pdf',
    'Q3_Financial_Projections.pdf'
  ];

  let textChunks = [];
  let rbacWarnings = [];

  for (const filename of pdfFiles) {
    try {
      const filePath = path.join(__dirname, 'documents', filename);
      if (!fs.existsSync(filePath)) continue;

      const rbacCheck = checkRBAC(user, 'PDF', filename);
      if (!rbacCheck.allowed) {
        // If query keywords match elements in the document name, log access block
        const docWords = filename.toLowerCase().replace(/[^a-zA-Z0-9]/g, ' ').split(' ');
        const queryWords = query.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/);
        const matchingWords = queryWords.filter(qw => qw.length > 3 && docWords.includes(qw));
        if (matchingWords.length > 0) {
          let uniqueToBlocked = true;
          if (filename === 'hr_handbook_v3.pdf') {
            if (!queryWords.includes('hr') && !queryWords.includes('v3')) {
              uniqueToBlocked = false;
            }
          }
          if (uniqueToBlocked) {
            rbacWarnings.push(`Blocked access to document [${filename}]: ${rbacCheck.reason}`);
          }
        }
        continue;
      }

      const fullText = await readPdfText(filename);
      // Clean and split text into paragraph chunks (500 tokens / characters limit)
      const paragraphs = fullText.split('\n\n').map(p => p.trim()).filter(p => p.length > 30);

      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const score = hybridScore(query, paragraph);

        if (score > 0) {
          textChunks.push({
            document: filename,
            page: 1, // simplified page index
            text: paragraph,
            score: score
          });
        }
      }
    } catch (e) {
      console.error(`Error reading ${filename}:`, e.message);
    }
  }

  // Sort chunks by score descending
  textChunks.sort((a, b) => b.score - a.score);
  const topChunks = textChunks.slice(0, 5);

  steps.push({
    phase: 'PDF Retrieval',
    status: 'COMPLETED',
    message: `Retrieved ${topChunks.length} relevant document snippets.`
  });

  if (rbacWarnings.length > 0 && trace.security_alerts) {
    trace.security_alerts.push(...rbacWarnings);
  }

  return { chunks: topChunks, warnings: rbacWarnings };
}

// Retrieve context from JSON Logs
async function retrieveJSONContext(query, keywords, user, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'JSON Logs Retrieval',
    status: 'IN_PROGRESS',
    message: 'Searching JSON log databases...'
  });

  const logFiles = [
    { name: 'system_logs.json', path: path.join(__dirname, 'documents', 'system_logs.json') },
    { name: 'audit_trail.json', path: path.join(__dirname, 'documents', 'audit_trail.json') },
    { name: 'infrastructure_logs.json', path: path.join(__dirname, 'logs', 'infrastructure_logs.json') },
    { name: 'system_audit.json', path: path.join(__dirname, 'logs', 'system_audit.json') }
  ];

  let matchingLogs = [];
  let rbacWarnings = [];
  let rlsFiltered = 0;

  for (const logFile of logFiles) {
    try {
      if (fs.existsSync(logFile.path)) {
        const rbacCheck = checkRBAC(user, 'JSON', logFile.name);
        if (!rbacCheck.allowed) {
          const qLower = query.toLowerCase();
          if (qLower.includes('log') || qLower.includes('audit') || qLower.includes('alert') || qLower.includes('infrastructure')) {
            rbacWarnings.push(`Blocked access to log file [${logFile.name}]: ${rbacCheck.reason}`);
          }
          continue;
        }

        const logContent = JSON.parse(fs.readFileSync(logFile.path, 'utf8'));
        
        // Filter by keywords and RLS clearance
        const matched = logContent.filter(entry => {
          // RLS filter
          if (!rowIsPermitted(user, entry)) {
            rlsFiltered++;
            return false;
          }

          const entryStr = JSON.stringify(entry).toLowerCase();
          const score = hybridScore(query, entryStr);
          if (score > 0) {
            entry.relevance_score = score;
            return true;
          }
          return false;
        });

        matchingLogs.push(...matched.map(m => ({ source: logFile.name, log: m, relevance_score: m.relevance_score })));
      }
    } catch (e) {
      console.error(`Error reading logs from ${logFile.name}:`, e.message);
    }
  }

  // Sort by relevance score
  matchingLogs.sort((a, b) => b.relevance_score - a.relevance_score);
  const topLogs = matchingLogs.slice(0, 10);

  steps.push({
    phase: 'JSON Logs Retrieval',
    status: 'COMPLETED',
    message: `Retrieved ${topLogs.length} matching log entries. ${rlsFiltered} rows filtered by RLS.`
  });

  if (rbacWarnings.length > 0 && trace.security_alerts) {
    trace.security_alerts.push(...rbacWarnings);
  }

  return { logs: topLogs, rlsFiltered, warnings: rbacWarnings };
}

// Helper: Parse CSV (native zero-dependency)
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }
  const fileContent = fs.readFileSync(filePath, 'utf8').trim();
  if (fileContent.length === 0) return [];
  
  const lines = fileContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Native CSV splitting supporting quotes
    const values = [];
    let insideQuote = false;
    let currentVal = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());

    if (values.length !== headers.length) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    records.push(row);
  }

  return records;
}

// Retrieve context from CSV (Spreadsheet)
async function retrieveCSVContext(query, keywords, user, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'CSV Retrieval',
    status: 'IN_PROGRESS',
    message: 'Searching enterprise CSV spreadsheets...'
  });

  const csvFiles = ['sales_kpi_2026.csv', 'compliance_records.csv'];
  let rbacWarnings = [];
  let matchedRows = [];
  let totalRlsFiltered = 0;

  for (const filename of csvFiles) {
    const csvPath = path.join(__dirname, 'documents', filename);
    if (!fs.existsSync(csvPath)) continue;

    try {
      const rbacCheck = checkRBAC(user, 'CSV', filename);
      if (!rbacCheck.allowed) {
        const qLower = query.toLowerCase();
        if (qLower.includes('sales') || qLower.includes('kpi') || qLower.includes('compliance') || qLower.includes('record')) {
          rbacWarnings.push(`Blocked access to CSV file [${filename}]: ${rbacCheck.reason}`);
        }
        continue;
      }

      const records = parseCSV(csvPath);
      let rlsFiltered = 0;

      for (const record of records) {
        if (!rowIsPermitted(user, record)) {
          rlsFiltered++;
          continue;
        }

        const rowStr = Object.values(record).join(' ').toLowerCase();
        const score = hybridScore(query, rowStr);

        if (score > 0) {
          matchedRows.push({
            source: filename,
            data: record,
            relevance_score: score
          });
        }
      }

      totalRlsFiltered += rlsFiltered;
    } catch (error) {
      console.error(`CSV Retrieval failed for ${filename}:`, error.message);
    }
  }

  // Sort by score
  matchedRows.sort((a, b) => b.relevance_score - a.relevance_score);
  const topRows = matchedRows.slice(0, 10);

  steps.push({
    phase: 'CSV Retrieval',
    status: rbacWarnings.length > 0 && topRows.length === 0 ? 'BLOCKED' : 'COMPLETED',
    message: `Retrieved ${topRows.length} relevant sales records. ${totalRlsFiltered} rows withheld by RLS.`,
    rls_filtered: totalRlsFiltered
  });

  if (rbacWarnings.length > 0 && trace.security_alerts) {
    trace.security_alerts.push(...rbacWarnings);
  }

  return { records: topRows, rlsFiltered: totalRlsFiltered, warnings: rbacWarnings };
}

// Generate graduated confidence score
function computeConfidence(trace, mergedCount) {
  let score = 100;

  // Penalize for RLS filtering to account for partial data
  const rlsFiltered = (trace.retrieval_metrics && trace.retrieval_metrics.rls_filtered) || 0;
  if (rlsFiltered > 0) {
    score -= Math.min(30, rlsFiltered * 5); // penalty capped at 30%
  }

  // Penalize if matched chunks count is low
  if (mergedCount === 0) {
    score = 10;
  } else if (mergedCount < 3) {
    score -= 15;
  }

  // Penalize if no primary source could be reached
  if (trace.security_alerts && trace.security_alerts.length > 0) {
    score -= 20;
  }

  // Apply absolute boundaries
  score = Math.max(10, Math.min(100, score));

  return {
    score: Math.round(score),
    label: score >= 75 ? 'High' : score >= 45 ? 'Medium' : 'Low',
    note: rlsFiltered > 0 ? `${rlsFiltered} source rows withheld by clearance policy` : null
  };
}

// Generate grounded RAG response
async function generateResponse(query, contextData, user, trace) {
  const steps = trace ? (trace.steps || (Array.isArray(trace) ? trace : [])) : [];
  steps.push({
    phase: 'Grounded Answer Generation',
    status: 'IN_PROGRESS',
    message: 'Synthesizing final response with citations...'
  });

  let contextBlock = '';
  let citations = [];
  let chunkIdx = 1;

  if (contextData.sql && contextData.sql.length > 0) {
    contextBlock += '--- DATABASE RECORDS ---\n';
    contextData.sql.forEach((item) => {
      contextBlock += `[SOURCE ${chunkIdx}] Table: ${item.source} | Content: ${JSON.stringify(item.data)}\n`;
      citations.push({ index: chunkIdx, type: 'database', label: item.source, detail: JSON.stringify(item.data) });
      chunkIdx++;
    });
  }

  if (contextData.pdf && contextData.pdf.length > 0) {
    contextBlock += '\n--- DOCUMENT CHUNKS ---\n';
    contextData.pdf.forEach((item) => {
      contextBlock += `[SOURCE ${chunkIdx}] File: ${item.document} (Page ${item.page}) | Content: ${item.text}\n`;
      citations.push({ index: chunkIdx, type: 'document', label: `${item.document} (Page ${item.page})`, detail: item.text });
      chunkIdx++;
    });
  }

  if (contextData.json && contextData.json.length > 0) {
    contextBlock += '\n--- SYSTEM LOG ENTRIES ---\n';
    contextData.json.forEach((item) => {
      contextBlock += `[SOURCE ${chunkIdx}] File: ${item.source} | Content: ${JSON.stringify(item.log)}\n`;
      citations.push({ index: chunkIdx, type: 'log', label: item.source, detail: JSON.stringify(item.log) });
      chunkIdx++;
    });
  }

  if (contextData.csv && contextData.csv.length > 0) {
    contextBlock += '\n--- SPREADSHEET RECORDS ---\n';
    contextData.csv.forEach((item) => {
      contextBlock += `[SOURCE ${chunkIdx}] File: ${item.source} | Content: ${JSON.stringify(item.data)}\n`;
      citations.push({ index: chunkIdx, type: 'csv', label: item.source, detail: JSON.stringify(item.data) });
      chunkIdx++;
    });
  }

  const hasContext = contextBlock.trim().length > 0;

  const systemPrompt = `You are PRISM, a secure context-aware enterprise RAG assistant.

STRICT RULES:
1. Answer ONLY using the context provided below.
2. If the context does not contain enough information, say exactly: "Insufficient data in your permitted sources to answer this query."
3. Never invent figures, names, dates, or statistics.
4. Never reveal data from sources the user is not permitted to access.
5. Always cite which source each fact comes from by citing as [SOURCE N] inline.

USER ROLE: ${user.role}
USER CLEARANCE: Level ${user.clearance_level}

RETRIEVED CONTEXT:
${hasContext ? contextBlock : 'No context available due to lack of matches or RBAC blocks.'}

USER QUERY: ${query}`;

  try {
    const rawResult = await callLLM(systemPrompt, `Please synthesize the response based on the rules.`);
    
    // Format response matching the required visual block
    const formattedResult = formatResponseText(rawResult, citations, user, trace);

    steps.push({
      phase: 'Grounded Answer Generation',
      status: 'COMPLETED',
      message: 'Successfully generated grounded answer.',
      confidence: formattedResult.confidence.score + '%'
    });

    return formattedResult;
  } catch (error) {
    // Fallback to local answering if API down
    const localAns = generateLocalAnswer(query, contextData, user, trace);
    steps.push({
      phase: 'Grounded Answer Generation',
      status: 'FALLBACK',
      message: `LLM API call failed: ${error.message}. Triggered offline fallback retrieval.`,
      confidence: localAns.confidence.score + '%'
    });
    return localAns;
  }
}

function formatResponseText(rawAnswer, citations, user, trace) {
  const mergedCount = citations.length;
  const confidence = computeConfidence(trace, mergedCount);

  let output = `${rawAnswer}\n\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `📋 RETRIEVAL SUMMARY\n`;
  output += `  Intent:          ${trace.intent || 'factual_lookup'}\n`;
  output += `  Sources queried: ${trace.sources_queried ? trace.sources_queried.length : 0} | Sources matched: ${mergedCount > 0 ? 1 : 0}\n`;
  output += `  Chunks used:     ${mergedCount} | Confidence: ${confidence.score}% (${confidence.label})\n`;

  if (confidence.note) {
    output += `  Note:            ${confidence.note}\n`;
  }
  
  output += `\n📎 CITATIONS\n`;
  if (citations.length > 0) {
    citations.forEach(c => {
      const displayType = c.type === 'database' ? 'SQL' : c.type === 'document' ? 'PDF' : c.type === 'csv' ? 'CSV' : 'JSON';
      output += `  [${c.index}] ${c.label} | Relevance: High\n`;
    });
  } else {
    output += `  None.\n`;
  }

  output += `\n🔒 ACCESS AUDIT\n`;
  output += `  User: ${user.username} | Role: ${user.role} | Clearance: L${user.clearance_level}\n`;
  
  const silos = ['SQL', 'PDF', 'JSON', 'CSV'];
  silos.forEach(s => {
    const chk = checkRBAC(user, s);
    const badge = chk.allowed ? '✅' : '❌';
    const reason = chk.allowed ? 'GRANTED' : `DENIED (${chk.reason})`;
    output += `  ${badge} ${s} silo: ${reason}\n`;
  });

  const rlsFiltered = (trace.retrieval_metrics && trace.retrieval_metrics.rls_filtered) || 0;
  if (rlsFiltered > 0) {
    output += `  🔽 RLS: ${rlsFiltered} rows filtered from sources (require higher clearance)\n`;
  }

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return {
    answer: output,
    confidence,
    citations
  };
}

// Local Rule-Based Answer Generator (Offline Fallback)
function generateLocalAnswer(query, contextData, user, trace) {
  const isSecurityAlert = trace.security_alerts && trace.security_alerts.length > 0;
  let answerText = '';
  let citations = [];
  let chunkIdx = 1;

  if (isSecurityAlert) {
    answerText = 'That information is not available to your access level.';
  } else {
    let details = [];
    if (contextData.sql && contextData.sql.length > 0) {
      contextData.sql.forEach(item => {
        citations.push({ index: chunkIdx, type: 'database', label: item.source, detail: JSON.stringify(item.data) });
        chunkIdx++;
        if (item.source.includes('employees')) {
          details.push(`Employee details: ${item.data.name} in department ${item.data.department} holds role ${item.data.role} with salary $${parseInt(item.data.salary, 10).toLocaleString()}.`);
        } else if (item.source.includes('financials')) {
          details.push(`Financial record: Year ${item.data.fiscal_year} Q${item.data.quarter} revenue was $${parseInt(item.data.revenue, 10).toLocaleString()}, EBITDA was $${parseInt(item.data.ebitda, 10).toLocaleString()}, Net Income was $${parseInt(item.data.net_income, 10).toLocaleString()}.`);
        } else if (item.source.includes('salaries')) {
          details.push(`Salary schedule: ${item.data.name} earns base salary of $${parseInt(item.data.base_salary, 10).toLocaleString()} with bonus of $${parseInt(item.data.bonus, 10).toLocaleString()}.`);
        } else if (item.source.includes('contracts')) {
          details.push(`Client contract: Client ${item.data.client_name} (${item.data.project_name}) is valued at $${parseInt(item.data.contract_value, 10).toLocaleString()} (Status: ${item.data.status}).`);
        } else {
          details.push(`Compliance handbook record: Policy "${item.data.policy_name}" | Content: "${item.data.content}"`);
        }
      });
    }

    if (contextData.pdf && contextData.pdf.length > 0) {
      contextData.pdf.forEach(item => {
        citations.push({ index: chunkIdx, type: 'document', label: `${item.document} (Page ${item.page})`, detail: item.text });
        chunkIdx++;
        details.push(`Document snippet from [${item.document}]: "${item.text.slice(0, 250)}..."`);
      });
    }

    if (contextData.json && contextData.json.length > 0) {
      contextData.json.forEach(item => {
        citations.push({ index: chunkIdx, type: 'log', label: item.source, detail: JSON.stringify(item.log) });
        chunkIdx++;
        details.push(`Log entry from [${item.source}]: ${item.log.severity || 'INFO'} alert on ${item.log.service || 'service'} - "${item.log.message}"`);
      });
    }

    if (contextData.csv && contextData.csv.length > 0) {
      contextData.csv.forEach(item => {
        citations.push({ index: chunkIdx, type: 'csv', label: item.source, detail: JSON.stringify(item.data) });
        chunkIdx++;
        if (item.source.includes('sales_kpi')) {
          details.push(`Sales spreadsheet record: Quarter ${item.data.quarter} in ${item.data.region} region. Target: $${parseInt(item.data.sales_target, 10).toLocaleString()}, Actual: $${parseInt(item.data.actual_sales, 10).toLocaleString()} (Status: ${item.data.kpi_status}).`);
        } else {
          details.push(`Compliance CSV entry: "${JSON.stringify(item.data)}"`);
        }
      });
    }

    if (details.length > 0) {
      answerText = `[OFFLINE MODE — Local Retrieval Only]\n\nBased on offline local databases & handbooks:\n` + details.map(d => `- ${d}`).join('\n');
    } else {
      answerText = 'Insufficient data in your permitted sources to answer this query.';
    }
  }

  const confidence = computeConfidence(trace, citations.length);

  let output = `${answerText}\n\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `📋 RETRIEVAL SUMMARY\n`;
  output += `  Intent:          ${trace.intent || 'factual_lookup'}\n`;
  output += `  Sources queried: ${trace.sources_queried ? trace.sources_queried.length : 0} | Sources matched: ${citations.length > 0 ? 1 : 0}\n`;
  output += `  Chunks used:     ${citations.length} | Confidence: ${confidence.score}% (${confidence.label})\n`;
  output += `  ⚡ OFFLINE MODE: LLM synthesis unavailable. Return formatted local data tables.\n`;

  if (confidence.note) {
    output += `  Note:            ${confidence.note}\n`;
  }

  output += `\n📎 CITATIONS\n`;
  if (citations.length > 0) {
    citations.forEach(c => {
      output += `  [${c.index}] ${c.label} | Relevance: High\n`;
    });
  } else {
    output += `  None.\n`;
  }

  output += `\n🔒 ACCESS AUDIT\n`;
  output += `  User: ${user.username} | Role: ${user.role} | Clearance: L${user.clearance_level}\n`;
  
  const silos = ['SQL', 'PDF', 'JSON', 'CSV'];
  silos.forEach(s => {
    const chk = checkRBAC(user, s);
    const badge = chk.allowed ? '✅' : '❌';
    const reason = chk.allowed ? 'GRANTED' : `DENIED (${chk.reason})`;
    output += `  ${badge} ${s} silo: ${reason}\n`;
  });

  const rlsFiltered = (trace.retrieval_metrics && trace.retrieval_metrics.rls_filtered) || 0;
  if (rlsFiltered > 0) {
    output += `  🔽 RLS: ${rlsFiltered} rows filtered from sources (require higher clearance)\n`;
  }

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return {
    answer: output,
    confidence,
    citations
  };
}

// Write Audit Log to File
function writeAuditLog(user, query, routeInfo, trace, response) {
  const auditPath = path.join(__dirname, 'logs', 'audit_logs.json');
  let auditLogs = [];

  try {
    const parentDir = path.dirname(auditPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (fs.existsSync(auditPath)) {
      auditLogs = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading audit log file:', e.message);
  }

  const alerts = trace.security_alerts || [];

  const logEntry = {
    timestamp: new Date().toISOString(),
    user: user.username,
    role: user.role,
    clearance_level: user.clearance_level,
    query,
    routed_sources: routeInfo.sources || [],
    security_violations: alerts,
    citations_used: response.citations ? response.citations.map(c => c.label) : [],
    status: response.audit_action || (alerts.length > 0 ? 'DENIED' : 'GRANTED'),
    rows_returned: response.citations ? response.citations.length : 0
  };

  auditLogs.unshift(logEntry);

  // Cap audit logs at 100 entries
  if (auditLogs.length > 100) {
    auditLogs = auditLogs.slice(0, 100);
  }

  try {
    fs.writeFileSync(auditPath, JSON.stringify(auditLogs, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing audit logs:', e.message);
  }
}

// CORE PIPELINE EXECUTOR
async function executeRAGPipeline(username, query) {
  const trace = {
    timestamp: new Date().toISOString(),
    query,
    username,
    role: 'Unknown',
    clearance_level: 0,
    steps: [],
    security_alerts: []
  };

  // Step 1: User Profile Retrieval
  trace.steps.push({
    phase: 'Authentication & RBAC Mapping',
    status: 'IN_PROGRESS',
    message: `Fetching permissions profile for employee: "${username}"`
  });

  const user = await getUserProfile(username);
  if (!user) {
    const errorMsg = `Identity Resolution Fail: Username "${username}" not registered in user index database.`;
    trace.steps.push({
      phase: 'Authentication & RBAC Mapping',
      status: 'ERROR',
      message: errorMsg
    });
    trace.security_alerts.push(errorMsg);

    const r = {
      answer: `[Access Blocked] Identity resolution failed. Username "${username}" is not a recognized corporate identity.`,
      confidence: { score: 0, label: 'Low', note: 'Unrecognized user credentials' },
      citations: [],
      trace
    };
    return r;
  }

  trace.role = user.role;
  trace.clearance_level = user.clearance_level;
  trace.steps.push({
    phase: 'Authentication & RBAC Mapping',
    status: 'COMPLETED',
    message: `Identified user as ${user.role} (Clearance Level ${user.clearance_level}) in ${user.department} department.`
  });

  // Step 1.5: Sanitization & Injection Defense
  if (detectPromptInjection(query)) {
    const violationMsg = `SECURITY VIOLATION: Prompt injection attempt detected in query: "${query}"`;
    trace.steps.push({
      phase: 'Query Sanitization',
      status: 'BLOCKED',
      message: violationMsg
    });
    trace.security_alerts.push(violationMsg);

    const response = {
      answer: `[Access Blocked] Security policy violation: Jailbreak or prompt injection pattern detected. This attempt has been logged for corporate auditing.`,
      confidence: { score: 0, label: 'Low', note: 'Security validation blocked' },
      citations: [],
      blocked: true,
      audit_action: 'SECURITY_VIOLATION'
    };

    writeAuditLog(user, query, { sources: [] }, trace, response);
    return { ...response, trace };
  }

  const cleanQuery = sanitizeQuery(query);

  // Step 2: Caching lookup
  const cacheKey = `${user.role}:${user.clearance_level}:${cleanQuery.toLowerCase().trim()}`;
  if (queryCache.has(cacheKey)) {
    trace.steps.push({
      phase: 'Query Cache Lookup',
      status: 'CACHE_HIT',
      message: 'Found identical query signature. Returning cached response securely.'
    });
    const cachedRes = queryCache.get(cacheKey);
    // Overwrite trace details for logging clarity
    if (cachedRes && cachedRes.trace) {
      const cachedSteps = cachedRes.trace.steps || (Array.isArray(cachedRes.trace) ? cachedRes.trace : null);
      if (cachedSteps) {
        cachedSteps.push({
          phase: 'Query Cache Lookup',
          status: 'COMPLETED',
          message: 'Delivered cached response.'
        });
      }
    }
    return cachedRes;
  }

  // Step 3: Intent Query Routing
  const routeInfo = await routeQuery(cleanQuery, trace);
  trace.intent = routeInfo.intent;
  trace.sources_queried = routeInfo.sources;

  // Step 4: Parallel Retrieval & Context Merging
  const retrievePromises = [];
  
  if (checkRBAC(user, 'SQL').allowed) {
    retrievePromises.push(retrieveSQLContext(cleanQuery, user, trace).then(res => ({ type: 'sql', ...res })));
  } else {
    // If SQL was routed but blocked at silo level, add warning
    if (routeInfo.sources.includes('SQL')) {
      const msg = `Blocked access to SQL database silo for role '${user.role}'`;
      trace.security_alerts.push(msg);
      trace.steps.push({ phase: 'SQL Retrieval', status: 'BLOCKED', message: msg });
    }
  }

  if (checkRBAC(user, 'PDF').allowed) {
    retrievePromises.push(retrievePDFContext(cleanQuery, routeInfo.keywords, user, trace).then(res => ({ type: 'pdf', ...res })));
  } else {
    if (routeInfo.sources.includes('PDF')) {
      const msg = `Blocked access to PDF document silo for role '${user.role}'`;
      trace.security_alerts.push(msg);
      trace.steps.push({ phase: 'PDF Retrieval', status: 'BLOCKED', message: msg });
    }
  }

  if (checkRBAC(user, 'JSON').allowed) {
    retrievePromises.push(retrieveJSONContext(cleanQuery, routeInfo.keywords, user, trace).then(res => ({ type: 'json', ...res })));
  } else {
    if (routeInfo.sources.includes('JSON')) {
      const msg = `Blocked access to JSON log silo for role '${user.role}'`;
      trace.security_alerts.push(msg);
      trace.steps.push({ phase: 'JSON Logs Retrieval', status: 'BLOCKED', message: msg });
    }
  }

  if (checkRBAC(user, 'CSV').allowed) {
    retrievePromises.push(retrieveCSVContext(cleanQuery, routeInfo.keywords, user, trace).then(res => ({ type: 'csv', ...res })));
  } else {
    if (routeInfo.sources.includes('CSV')) {
      const msg = `Blocked access to CSV spreadsheet silo for role '${user.role}'`;
      trace.security_alerts.push(msg);
      trace.steps.push({ phase: 'CSV Retrieval', status: 'BLOCKED', message: msg });
    }
  }

  const retrieveResults = await Promise.all(retrievePromises);

  // Assemble consolidated context
  const contextData = { sql: [], pdf: [], json: [], csv: [] };
  let totalRlsFiltered = 0;

  retrieveResults.forEach(res => {
    if (res.type === 'sql') {
      contextData.sql = res.records || [];
      totalRlsFiltered += res.rlsFiltered || 0;
    } else if (res.type === 'pdf') {
      contextData.pdf = res.chunks || [];
    } else if (res.type === 'json') {
      contextData.json = res.logs || [];
      totalRlsFiltered += res.rlsFiltered || 0;
    } else if (res.type === 'csv') {
      contextData.csv = res.records || [];
      totalRlsFiltered += res.rlsFiltered || 0;
    }
  });

  trace.retrieval_metrics = {
    rls_filtered: totalRlsFiltered,
    sql_records: contextData.sql.length,
    pdf_chunks: contextData.pdf.length,
    json_logs: contextData.json.length,
    csv_rows: contextData.csv.length
  };

  // Step 5: Answer Synthesis
  const response = await generateResponse(cleanQuery, contextData, user, trace);

  // Step 6: Persistent Audit Logging
  writeAuditLog(user, query, routeInfo, trace, response);

  const finalResponse = {
    answer: response.answer,
    confidence: response.confidence,
    citations: response.citations,
    trace
  };

  // Store in cache
  queryCache.set(cacheKey, finalResponse);

  return finalResponse;
}

module.exports = {
  executeRAGPipeline,
  getUserProfile,
  checkRBAC,
  sanitizeQuery,
  rowIsPermitted,
  retrieveCSVContext,
  parseCSV
};
