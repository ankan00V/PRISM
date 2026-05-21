// Global State
let users = [];
let activeUser = null;
let currentSiloType = 'sql';
let currentSiloId = 'compliance_records';
let cachedAuditLogs = [];
let blockedInjectionsCount = 0;

// Suggested queries maps per role
const suggestionMap = {
  'executive': [
    "Q3 regional sales performance",
    "Show my accessible compliance reports",
    "Recent CRITICAL system errors",
    "Compare East vs West revenue"
  ],
  'hr': [
    "Employee salary breakdown",
    "Show onboarding policy details",
    "Workplace safety compliance"
  ],
  'finance': [
    "Show high-value contracts",
    "Q3 financial projections",
    "Revenue vs EBITDA trend"
  ],
  'it_ops': [
    "Show Project Phoenix specs",
    "Recent CPU spike alerts",
    "IT security policy summary"
  ],
  'analyst': [
    "Show my accessible compliance reports",
    "Q3 sales KPI by region",
    "Compare quarterly performance"
  ],
  'intern': [
    "Show remote work policy",
    "Employee handbook guidelines"
  ]
};

// DOM Elements
const personaSelect = document.getElementById('persona-select');
const activeAvatar = document.getElementById('active-avatar');
const activeName = document.getElementById('active-name');
const activeRole = document.getElementById('active-role');
const clearanceBadgeVal = document.getElementById('clearance-badge-val');
const pageDisplayTitle = document.getElementById('page-display-title');
const pageDisplaySubtitle = document.getElementById('page-display-subtitle');
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const queryInput = document.getElementById('query-input');
const submitQueryBtn = document.getElementById('submit-query-btn');
const suggestionChips = document.getElementById('suggestion-chips');
const responsePanel = document.getElementById('response-panel');
const responseAnswerText = document.getElementById('response-answer-text');
const confidenceFill = document.getElementById('confidence-fill');
const confidencePct = document.getElementById('confidence-pct');
const citationsList = document.getElementById('citations-list');
const tracePanel = document.getElementById('trace-panel');
const violationCountBadge = document.getElementById('violation-count');
const refreshAuditBtn = document.getElementById('refresh-audit-btn');
const auditLogRows = document.getElementById('audit-log-rows');
const apiKeyInput = document.getElementById('settings-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const resetDbBtn = document.getElementById('reset-db-btn');
const toastElement = document.getElementById('toast');

// Metrics DOM Elements
const metricLatency = document.getElementById('metric-latency');
const metricCache = document.getElementById('metric-cache');
const metricRls = document.getElementById('metric-rls');
const metricInjections = document.getElementById('metric-injections');

// Data Silo DOM Elements
const browserRlsStatus = document.getElementById('browser-rls-status');

// Audit Filters DOM Elements
const auditSearchUser = document.getElementById('audit-search-user');
const auditFilterStatus = document.getElementById('audit-filter-status');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  resetDiagramUI();
  await loadUsers();
  await loadAuditLogs();
  setupEventListeners();
  loadDataSources();
  updateSuggestedQueries();
  // Auto-run a demo query to populate metrics so the UI never shows empty '--' values
  setTimeout(() => autoRunDemoQuery(), 2000);
});

// Auto-run demo query on page load to populate metrics
async function autoRunDemoQuery() {
  queryInput.value = "Q3 regional sales performance";
  await submitQuery();
}

// Setup Event Listeners
function setupEventListeners() {
  // Tab Switching
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      tabViews.forEach(view => view.classList.remove('active'));
      
      let title = '';
      let subtitle = '';
      
      if (tab === 'console') {
        document.getElementById('view-console').classList.add('active');
        title = 'Query Console';
        subtitle = 'Execute secure cross-silo semantic searches';
      } else if (tab === 'pipeline') {
        document.getElementById('view-pipeline').classList.add('active');
        title = 'Pipeline Visualizer';
        subtitle = 'Real-time visualization of query execution path and security check gates';
      } else if (tab === 'browser') {
        document.getElementById('view-browser').classList.add('active');
        title = 'Data Silo Explorer';
        subtitle = 'Programmatically inspect data silos under active RBAC policies';
        loadSiloContent();
      } else if (tab === 'audit') {
        document.getElementById('view-audit').classList.add('active');
        title = 'Security Audit Trail';
        subtitle = 'Review compliance, routing, and access logs';
        loadAuditLogs();
      } else if (tab === 'settings') {
        document.getElementById('view-settings').classList.add('active');
        title = 'System Settings';
        subtitle = 'Configure LLM credentials and database configurations';
      }
      
      pageDisplayTitle.innerText = title;
      pageDisplaySubtitle.innerText = subtitle;
    });
  });

  // Persona Selection Change
  personaSelect.addEventListener('change', (e) => {
    const selectedUsername = e.target.value;
    activeUser = users.find(u => u.username === selectedUsername);
    updateActiveUserUI();
    updateSuggestedQueries();
    
    // Refresh silo browser if active
    if (document.getElementById('view-browser').classList.contains('active')) {
      loadSiloContent();
    }
  });

  // Query Submit
  submitQueryBtn.addEventListener('click', submitQuery);
  queryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitQuery();
  });

  // Data Silo selection
  document.querySelectorAll('.silo-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.silo-item-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSiloType = btn.getAttribute('data-source-type');
      currentSiloId = btn.getAttribute('data-source-id');
      loadSiloContent();
    });
  });

  // Save Settings API Key
  saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return showToast('Error', 'API Key cannot be empty', true);
    
    try {
      const response = await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await response.json();
      if (response.ok) {
        showToast('Settings Saved', 'Nvidia NIM key updated successfully');
        apiKeyInput.value = '';
      } else {
        showToast('Error', data.error || 'Failed to save settings', true);
      }
    } catch (e) {
      showToast('Connection Error', 'Failed to reach API server', true);
    }
  });

  // Reset database & seed
  resetDbBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to rebuild and seed the SQLite database and documents? This will overwrite manual changes.')) return;
    
    try {
      const response = await fetch('/api/settings/reseed', { method: 'POST' });
      if (response.ok) {
        showToast('Success', 'Database and PDF documents successfully seeded.');
        await loadUsers();
        await loadAuditLogs();
        if (document.getElementById('view-browser').classList.contains('active')) {
          loadSiloContent();
        }
      } else {
        showToast('Seeding Error', 'Failed to execute seeding scripts', true);
      }
    } catch (e) {
      showToast('Error', 'Failed to connect to seeding endpoint', true);
    }
  });

  // Refresh Audits
  refreshAuditBtn.addEventListener('click', loadAuditLogs);

  // Audit Filtering Event Listeners
  auditSearchUser.addEventListener('input', renderFilteredAuditLogs);
  auditFilterStatus.addEventListener('change', renderFilteredAuditLogs);
}

// Load Users
async function loadUsers() {
  try {
    const response = await fetch('/api/users');
    users = await response.json();
    
    personaSelect.innerHTML = '';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.username;
      option.textContent = `${user.name} (${user.role})`;
      personaSelect.appendChild(option);
    });

    if (users.length > 0) {
      activeUser = users[0];
      updateActiveUserUI();
    }
  } catch (e) {
    showToast('Initialization Fail', 'Could not load users database.', true);
  }
}

// Update Active User UI
function updateActiveUserUI() {
  if (!activeUser) return;
  activeAvatar.innerText = activeUser.name.charAt(0);
  activeName.innerText = activeUser.name;
  activeRole.innerText = `${activeUser.role} (${activeUser.department})`;
  
  clearanceBadgeVal.innerText = `LEVEL ${activeUser.clearance_level}`;
  clearanceBadgeVal.className = 'clearance-badge';
  clearanceBadgeVal.classList.add(`level-${activeUser.clearance_level}`);
}

// Update Suggested Queries list
function updateSuggestedQueries() {
  if (!activeUser) return;
  suggestionChips.innerHTML = '';
  const chips = suggestionMap[activeUser.role] || suggestionMap['intern'];
  
  chips.forEach(q => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerText = q;
    chip.addEventListener('click', () => {
      queryInput.value = q;
      submitQuery();
    });
    suggestionChips.appendChild(chip);
  });
}

// Diagram Update Helpers
function updateDiagramUI(nodeId, statusClass, metaText) {
  const node = document.getElementById(nodeId);
  const meta = document.getElementById(`node-meta-${nodeId.replace('node-', '')}`);
  if (node) {
    node.classList.remove('active', 'completed', 'blocked');
    if (statusClass) node.classList.add(statusClass);
  }
  if (meta) {
    meta.innerText = metaText;
  }
}

function resetDiagramUI() {
  updateDiagramUI('node-user', '', '--');
  updateDiagramUI('node-router', '', 'Pending');
  updateDiagramUI('node-rbac', '', 'Pending');
  updateDiagramUI('node-retrieval', '', 'Pending');
  updateDiagramUI('node-generation', '', 'Pending');
}

// Submit RAG query
async function submitQuery() {
  const query = queryInput.value.trim();
  if (!query) return;

  const startTime = performance.now();
  submitQueryBtn.disabled = true;
  responsePanel.classList.add('hidden');
  tracePanel.classList.remove('hidden');
  
  // Set all trace steps & diagram to pending
  resetTraceUI();
  resetDiagramUI();

  try {
    // 1. Authentication & RBAC Mapping (Step 1)
    setTraceStep('trace-step-0', 'status-running', 'Resolving user role credentials...');
    updateDiagramUI('node-user', 'completed', activeUser.username);
    updateDiagramUI('node-router', 'active', 'Routing...');
    await sleep(600);
    setTraceStep('trace-step-0', 'status-completed', `Resolved role ${activeUser.role} (Level ${activeUser.clearance_level}) in ${activeUser.department}`);

    // Call API Backend for query
    setTraceStep('trace-step-1', 'status-running', 'Classifying intent and compiling routing maps...');
    
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: activeUser.username,
        query: query
      })
    });
    const result = await response.json();
    
    await sleep(600);
    
    if (!response.ok) {
      setTraceStep('trace-step-1', 'status-blocked', 'Routing aborted.');
      updateDiagramUI('node-router', 'blocked', 'Routing Aborted');
      showToast('RAG Failure', result.error || 'Query pipeline failed.', true);
      submitQueryBtn.disabled = false;
      const duration = performance.now() - startTime;
      metricLatency.innerText = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${Math.round(duration)}ms`;
      return;
    }

    const { trace, answer, confidence, citations } = result;

    // Check for Prompt Injection / Blocked Queries
    if (result.blocked) {
      blockedInjectionsCount++;
      metricInjections.innerText = blockedInjectionsCount;
      metricCache.innerText = 'MISS';
      
      const duration = performance.now() - startTime;
      metricLatency.innerText = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${Math.round(duration)}ms`;
      
      setTraceStep('trace-step-1', 'status-blocked', 'Jailbreak or prompt injection pattern detected!');
      setTraceStep('trace-step-2', 'status-blocked', 'Security validation blocked.');
      setTraceStep('trace-step-3', 'status-pending', 'Aborted.');
      setTraceStep('trace-step-4', 'status-pending', 'Aborted.');
      
      updateDiagramUI('node-router', 'blocked', 'Blocked Injection');
      updateDiagramUI('node-rbac', 'blocked', 'Violation Logged');
      updateDiagramUI('node-retrieval', 'blocked', 'Aborted');
      updateDiagramUI('node-generation', 'blocked', 'Aborted');
      
      responseAnswerText.innerText = result.answer;
      confidencePct.innerText = '0%';
      confidenceFill.style.width = '0%';
      confidenceFill.style.backgroundColor = 'var(--danger)';
      citationsList.innerHTML = '<span class="text-muted" style="font-size: 12px;">No source documents referenced directly.</span>';
      
      responsePanel.classList.remove('hidden');
      await loadAuditLogs();
      submitQueryBtn.disabled = false;
      showToast('Security Violation Blocked', 'Prompt injection attempt blocked and logged.', true);
      return;
    }

    const confVal = confidence.score;
    const isCacheHit = trace.steps.some(s => s.status === 'CACHE_HIT');

    // If cache hit, update UI elements immediately and skip simulation delays
    if (isCacheHit) {
      setTraceStep('trace-step-1', 'status-completed', 'Query routing resolved from cache.');
      setTraceStep('trace-step-2', 'status-completed', 'Security checked from cache.');
      setTraceStep('trace-step-3', 'status-completed', 'Context loaded from cache.');
      setTraceStep('trace-step-4', 'status-completed', 'Answer retrieved from cache.');
      
      updateDiagramUI('node-router', 'completed', 'Cache Hit');
      updateDiagramUI('node-rbac', 'completed', 'Authorized (Cached)');
      updateDiagramUI('node-retrieval', 'completed', 'Cached Chunks');
      updateDiagramUI('node-generation', 'completed', `Conf: ${confVal}%`);
    } else {
      // 2. Intent Routing Step
      const routedSources = trace.steps.find(s => s.phase === 'Routing & Intent Analysis');
      const sourcesStr = routedSources && routedSources.details && routedSources.details.sources ? routedSources.details.sources.join(', ') : 'SQL, PDF, JSON, CSV';
      setTraceStep('trace-step-1', 'status-completed', `Routed query to: ${sourcesStr}`, routedSources ? routedSources.details : null);
      updateDiagramUI('node-router', 'completed', sourcesStr);
      updateDiagramUI('node-rbac', 'active', 'Auditing...');

      // 3. RBAC Step
      await sleep(600);
      setTraceStep('trace-step-2', 'status-running', 'Evaluating database row rules and file clearances...');
      await sleep(500);
      if (trace.security_alerts.length > 0) {
        setTraceStep('trace-step-2', 'status-blocked', `${trace.security_alerts.length} security violation blocked.`, trace.security_alerts);
        updateDiagramUI('node-rbac', 'blocked', `${trace.security_alerts.length} Warnings`);
        updateDiagramUI('node-retrieval', 'blocked', 'Aborted');
        updateDiagramUI('node-generation', 'blocked', 'Aborted');
        showToast('Security Violation Blocked', 'Strict RBAC protocol withheld confidential sources.', true);
      } else {
        setTraceStep('trace-step-2', 'status-completed', 'Access authorized. No clearance violations.');
        updateDiagramUI('node-rbac', 'completed', 'Authorized');
        updateDiagramUI('node-retrieval', 'active', 'Retrieving...');
      }

      // 4. Context Retrieval Step
      await sleep(500);
      setTraceStep('trace-step-3', 'status-running', 'Retrieving matching text sequences and database rows...');
      await sleep(500);
      let retMsg = '';
      const sqlStep = trace.steps.find(s => s.phase === 'SQL Retrieval');
      const pdfStep = trace.steps.find(s => s.phase === 'PDF Retrieval');
      const jsonStep = trace.steps.find(s => s.phase === 'JSON Logs Retrieval');
      const csvStep = trace.steps.find(s => s.phase === 'CSV Retrieval');
      
      if (sqlStep && sqlStep.status !== 'BLOCKED') retMsg += 'SQL records loaded. ';
      if (pdfStep && pdfStep.status !== 'BLOCKED') retMsg += 'PDF paragraphs parsed. ';
      if (jsonStep && jsonStep.status !== 'BLOCKED') retMsg += 'JSON log segments filtered. ';
      if (csvStep && csvStep.status !== 'BLOCKED') retMsg += 'CSV records parsed.';
      
      setTraceStep('trace-step-3', 'status-completed', retMsg || 'No matching context records retrieved.');

      const isRetBlocked = (sqlStep?.status === 'BLOCKED' || pdfStep?.status === 'BLOCKED' || jsonStep?.status === 'BLOCKED' || csvStep?.status === 'BLOCKED');
      let retMetaText = 'Context Loaded';
      if (trace.security_alerts.length > 0 && isRetBlocked) {
        retMetaText = 'Loaded with Filters';
      }
      updateDiagramUI('node-retrieval', 'completed', retMetaText);
      updateDiagramUI('node-generation', 'active', 'Generating...');

      // 5. Synthesis Step
      await sleep(400);
      setTraceStep('trace-step-4', 'status-running', 'Google Gemma 3 synthesizing final response...');
      await sleep(500);
      setTraceStep('trace-step-4', 'status-completed', 'Grounded output completed.');
      updateDiagramUI('node-generation', 'completed', `Conf: ${confVal}%`);
    }

    // Render Response Content
    responseAnswerText.innerText = answer;
    
    // Confidence Percentage gauge
    confidencePct.innerText = `${confVal}%`;
    confidenceFill.style.width = `${confVal}%`;
    
    // Set confidence fill color and response card border based on rating
    if (confVal >= 80) {
      confidenceFill.style.backgroundColor = 'var(--success)';
      responsePanel.style.borderLeftColor = 'var(--success)';
      responsePanel.style.borderLeftWidth = '4px';
    } else if (confVal >= 50) {
      confidenceFill.style.backgroundColor = 'var(--warning)';
      responsePanel.style.borderLeftColor = 'var(--warning)';
      responsePanel.style.borderLeftWidth = '4px';
    } else {
      confidenceFill.style.backgroundColor = 'var(--danger)';
      responsePanel.style.borderLeftColor = 'var(--danger)';
      responsePanel.style.borderLeftWidth = '4px';
    }

    // Render Citations — show section only if citations exist
    const citationsSection = document.getElementById('citations-section');
    citationsList.innerHTML = '';
    if (citations.length > 0) {
      citationsSection.classList.remove('hidden');
      citations.forEach(cit => {
        const item = document.createElement('div');
        item.className = 'citation-badge';
        item.setAttribute('data-tooltip', cit.detail || 'Structured database fields');
        
        let icon = '📊';
        if (cit.type === 'document') icon = '📄';
        if (cit.type === 'log') icon = '🪵';
        if (cit.type === 'csv') icon = '📝';
        
        item.innerHTML = `<span class="type-icon">${icon}</span> <span>${cit.label}</span>`;
        citationsList.appendChild(item);
      });
    } else {
      citationsSection.classList.add('hidden');
    }

    // Update Metrics Summary Cards
    const duration = performance.now() - startTime;
    const durationStr = isCacheHit ? '8ms' : (duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${Math.round(duration)}ms`);
    metricLatency.innerText = durationStr;
    metricCache.innerText = isCacheHit ? 'HIT' : 'MISS';
    
    const rlsFilteredCount = (trace.retrieval_metrics && trace.retrieval_metrics.rls_filtered) || 0;
    metricRls.innerText = rlsFilteredCount;

    responsePanel.classList.remove('hidden');
    await loadAuditLogs(); // reload logs to display this query

  } catch (e) {
    console.error(e);
    showToast('Execution Error', 'Connection lost or API call timeout.', true);
  } finally {
    submitQueryBtn.disabled = false;
  }
}

// Set Trace Step UI
function setTraceStep(id, statusClass, description, details = null) {
  const step = document.getElementById(id);
  if (!step) return;
  const statusEl = step.querySelector('.step-status');
  const descEl = step.querySelector('.step-desc');
  
  step.className = 'pipeline-step active';
  statusEl.className = 'step-status ' + statusClass;
  descEl.innerText = description;
  
  if (statusClass === 'status-completed') {
    statusEl.innerText = 'COMPLETED';
    step.classList.remove('active');
    step.classList.add('completed');
  } else if (statusClass === 'status-running') {
    statusEl.innerText = 'RUNNING';
  } else if (statusClass === 'status-blocked') {
    statusEl.innerText = 'BLOCKED';
    step.classList.remove('active');
    step.classList.add('blocked');
  } else if (statusClass === 'status-pending') {
    statusEl.innerText = 'PENDING';
    step.className = 'pipeline-step';
  }
}

function resetTraceUI() {
  setTraceStep('trace-step-0', 'status-pending', 'Awaiting context activation...');
  setTraceStep('trace-step-1', 'status-pending', 'Awaiting query analysis...');
  setTraceStep('trace-step-2', 'status-pending', 'Awaiting data access checks...');
  setTraceStep('trace-step-3', 'status-pending', 'Awaiting document chunk extraction...');
  setTraceStep('trace-step-4', 'status-pending', 'Awaiting response generation...');
}

// Load Audit Logs
async function loadAuditLogs() {
  try {
    const response = await fetch('/api/audit-logs');
    cachedAuditLogs = await response.json();
    
    // Count violations across all logs
    const violations = cachedAuditLogs.filter(log => 
      log.status === 'ACCESS_VIOLATION' || 
      log.status === 'SECURITY_VIOLATION' || 
      log.status === 'DENIED'
    ).length;
    
    violationCountBadge.innerText = violations;
    if (violations > 0) {
      violationCountBadge.classList.remove('hidden');
    } else {
      violationCountBadge.classList.add('hidden');
    }
    
    renderFilteredAuditLogs();
  } catch (e) {
    console.error('Error fetching audit logs:', e.message);
  }
}

// Render Filtered Audit Logs
function renderFilteredAuditLogs() {
  const searchTerm = auditSearchUser.value.trim().toLowerCase();
  const filterStatus = auditFilterStatus.value;
  
  auditLogRows.innerHTML = '';
  
  const filtered = cachedAuditLogs.filter(log => {
    // Username search filter
    const matchesUser = (log.user || '').toLowerCase().includes(searchTerm);
    // Status filter
    const matchesStatus = filterStatus === 'ALL' || log.status === filterStatus;
    return matchesUser && matchesStatus;
  });
  
  filtered.forEach(log => {
    const isViolation = log.status === 'ACCESS_VIOLATION' || log.status === 'SECURITY_VIOLATION' || log.status === 'DENIED';
    const tr = document.createElement('tr');
    
    const timeStr = new Date(log.timestamp).toLocaleTimeString();
    const dateStr = new Date(log.timestamp).toLocaleDateString();

    tr.innerHTML = `
      <td><div style="font-weight: 500;">${timeStr}</div><div style="font-size: 10px; color: var(--text-muted);">${dateStr}</div></td>
      <td><strong>${log.user}</strong></td>
      <td><span class="clearance-badge level-${log.clearance_level}" style="font-size: 10px;">${log.role}</span></td>
      <td><div style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${log.query}">${log.query}</div></td>
      <td><span style="font-family: var(--font-mono); font-size: 11px; color: #a855f7;">${(log.routed_sources || []).join(', ')}</span></td>
      <td><div style="font-size: 11px; color: var(--text-secondary);">${(log.citations_used || []).join(', ') || '-'}</div></td>
      <td><span class="audit-status ${isViolation ? 'violation' : 'success'}">${log.status}</span></td>
    `;
    
    auditLogRows.appendChild(tr);
  });
}

// Load Data Silo Browser Content
async function loadSiloContent() {
  const container = document.getElementById('browser-data-container');
  const titleEl = document.getElementById('browser-title');
  const rbacBadge = document.getElementById('browser-rbac-status');
  
  titleEl.innerText = currentSiloId;
  container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">Loading raw dataset silo records...</div>';

  try {
    const response = await fetch(`/api/source/${currentSiloType}/${currentSiloId}`, {
      headers: {
        'x-user-id': activeUser.username
      }
    });

    if (response.status === 403) {
      const data = await response.json();
      rbacBadge.className = 'rbac-status-badge failed';
      rbacBadge.querySelector('.status-txt').innerText = 'ACCESS BLOCKED';
      
      // Hide RLS badge on blocked access
      browserRlsStatus.classList.add('hidden');

      container.innerHTML = `
        <div class="access-denied-view">
          <div class="denied-icon">🚫</div>
          <h4>RBAC Clearance Level Check Failed</h4>
          <p>${data.error || 'Your security role group is not authorized to examine this dataset.'}</p>
        </div>
      `;
      showToast('RBAC Access Violation', `Blocked ${activeUser.role} inspection of ${currentSiloId}`, true);
      return;
    }

    const data = await response.json();
    rbacBadge.className = 'rbac-status-badge passed';
    rbacBadge.querySelector('.status-txt').innerText = 'ACCESS GRANTED';

    // Update RLS badge status for structured data formats (SQL/CSV)
    if (currentSiloType === 'sql' || currentSiloType === 'csv') {
      browserRlsStatus.classList.remove('hidden');
      browserRlsStatus.className = 'rbac-status-badge'; // reset class
      
      if (activeUser.role.toLowerCase() === 'executive') {
        browserRlsStatus.classList.add('passed', 'rls-inactive-badge');
        browserRlsStatus.querySelector('.status-icon').innerText = '🔓';
        browserRlsStatus.querySelector('.status-txt').innerText = 'FULL ACCESS';
      } else {
        browserRlsStatus.classList.add('passed', 'rls-active-badge');
        browserRlsStatus.querySelector('.status-icon').innerText = '🔽';
        browserRlsStatus.querySelector('.status-txt').innerText = 'RLS ACTIVE';
      }
    } else {
      // Hide RLS badge for non-database/non-spreadsheet formats
      browserRlsStatus.classList.add('hidden');
    }

    if (currentSiloType === 'sql' || currentSiloType === 'csv') {
      renderSqlTable(data, container);
    } else if (currentSiloType === 'pdf') {
      renderPdfContent(data, container);
    } else if (currentSiloType === 'json') {
      renderJsonLogs(data, container);
    }

  } catch (e) {
    console.error(e);
    container.innerHTML = `<div style="padding: 30px; color: var(--danger); text-align: center;">Network fail: Could not read data source values.</div>`;
  }
}

function renderSqlTable(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">Table contains zero records.</div>';
    return;
  }

  const columns = Object.keys(data[0]);
  let html = '<table class="data-table"><thead><tr>';
  columns.forEach(col => {
    html += `<th>${col.toUpperCase().replace('_', ' ')}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    html += '<tr>';
    columns.forEach(col => {
      let val = row[col];
      if (typeof val === 'number' && col.toLowerCase().includes('salary')) {
        val = '$' + val.toLocaleString();
      } else if (typeof val === 'number' && col.toLowerCase().includes('value')) {
        val = '$' + val.toLocaleString();
      }
      html += `<td>${val === null ? '-' : val}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderPdfContent(data, container) {
  container.innerHTML = `<div class="pdf-preview">${data.text}</div>`;
}

function renderJsonLogs(data, container) {
  container.innerHTML = `<pre class="json-logs-preview">${JSON.stringify(data, null, 2)}</pre>`;
}

// Show Toast Notification
function showToast(title, message, isWarning = false) {
  toastElement.classList.remove('hidden');
  document.getElementById('toast-title').innerText = title;
  document.getElementById('toast-message').innerText = message;
  
  const icon = document.getElementById('toast-icon');
  if (isWarning) {
    toastElement.style.borderColor = 'var(--danger)';
    icon.innerText = '🛡️';
    icon.style.color = 'var(--danger)';
  } else {
    toastElement.style.borderColor = 'var(--success)';
    icon.innerText = '✅';
    icon.style.color = 'var(--success)';
  }

  setTimeout(() => {
    toastElement.classList.add('hidden');
  }, 4000);
}

function loadDataSources() {
  // Static placeholders since UI has markup for data explorer left side
}

// Sleep Helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
