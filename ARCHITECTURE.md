# PRISM System Architecture

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [Security Architecture](#security-architecture)
5. [Retrieval Pipeline](#retrieval-pipeline)
6. [Database Schema](#database-schema)
7. [API Design](#api-design)
8. [Frontend Architecture](#frontend-architecture)

---

## System Overview

PRISM is built as a three-tier architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  (React-like Vanilla JS SPA with Real-time Updates)     │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
┌────────────────────┴────────────────────────────────────┐
│                   Application Layer                      │
│  (Express.js Server + RAG Engine + Security Middleware) │
└────────────────────┬────────────────────────────────────┘
                     │ Data Access
┌────────────────────┴────────────────────────────────────┐
│                      Data Layer                          │
│  (SQLite + File System + PDF Parser + JSON/CSV)        │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 18+
- Express.js (REST API)
- SQLite3 (Structured data)
- pdf-parse (PDF extraction)
- Axios (LLM API calls)

**Frontend:**
- Vanilla JavaScript (ES6+)
- CSS3 with custom properties
- No framework dependencies

**External Services:**
- Nvidia NIM API (Gemma model for LLM)
- Optional: Works offline without API

---

## Core Components

### 1. RAG Engine (`rag_engine.js`)

The heart of the system, responsible for:

#### Query Processing
```javascript
executeRAGPipeline(username, query)
  ├── getUserProfile()           // Load user RBAC profile
  ├── detectPromptInjection()    // Security check
  ├── routeQuery()               // Intent analysis & routing
  ├── checkRBAC()                // Permission validation
  ├── retrieveContext()          // Multi-source retrieval
  │   ├── retrieveSQLContext()
  │   ├── retrievePDFContext()
  │   ├── retrieveJSONContext()
  │   └── retrieveCSVContext()
  ├── generateResponse()         // LLM synthesis
  └── writeAuditLog()            // Compliance logging
```

#### Hybrid Search Algorithm

```javascript
hybridScore(query, text) = 0.6 * tfidfScore + 0.4 * keywordScore

tfidfScore = Σ(TF(term) * IDF(term))
  where TF = term_frequency / total_words
        IDF = log(1 + 1/(1 + document_contains_term))

keywordScore = matched_terms / total_query_terms
```

#### Intelligent Routing

**LLM-based Routing:**
```javascript
{
  "intent": "factual_lookup|trend_analysis|compliance_check|...",
  "primary_source": "SQL|PDF|JSON|CSV",
  "sources": ["SQL", "PDF"],
  "keywords": ["revenue", "q3", "financial"]
}
```

**Fallback Routing (Keyword-based):**
- Salary/contract keywords → SQL
- Handbook/policy keywords → PDF
- Log/alert keywords → JSON
- Sales/KPI keywords → CSV

### 2. Server (`server.js`)

Express.js application with middleware stack:

```javascript
Middleware Stack:
├── express.json()           // Body parsing
├── cors()                   // CORS handling
├── express.static()         // Frontend assets
└── rateLimit()              // 30 req/min throttling
```

**API Routes:**
- `POST /api/query` - Execute RAG pipeline
- `GET /api/users` - List available users
- `GET /api/source/:type/:id` - Introspect data source
- `GET /api/audit-logs` - Fetch audit trail
- `POST /api/settings/apikey` - Update API key
- `POST /api/settings/reseed` - Re-initialize database

### 3. Database Layer (`database.js`)

SQLite schema with 6 tables:

```sql
users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  name TEXT,
  role TEXT,
  clearance_level INTEGER,
  department TEXT
)

salaries (
  id INTEGER PRIMARY KEY,
  name TEXT,
  department TEXT,
  role TEXT,
  base_salary INTEGER,
  bonus INTEGER,
  clearance_level INTEGER
)

contracts (
  id INTEGER PRIMARY KEY,
  client_name TEXT,
  project_name TEXT,
  contract_value REAL,
  status TEXT,
  allowed_roles TEXT
)

compliance_records (
  id INTEGER PRIMARY KEY,
  policy_name TEXT,
  category TEXT,
  content TEXT,
  clearance_level INTEGER
)

employees (
  emp_id INTEGER PRIMARY KEY,
  name TEXT,
  department TEXT,
  role TEXT,
  salary INTEGER,
  clearance_level INTEGER
)

financials (
  fiscal_year INTEGER,
  quarter TEXT,
  revenue INTEGER,
  ebitda INTEGER,
  net_income INTEGER,
  clearance_level INTEGER
)
```

### 4. Document Generator (`pdf_generator.js`)

Generates synthetic enterprise PDFs using PDFKit:

```javascript
generatePDF(filename, title, clearance, content)
  ├── Create PDF document
  ├── Add title header
  ├── Add metadata (classification, date)
  ├── Add content paragraphs
  └── Add confidentiality footer
```

---

## Data Flow

### Complete Query Execution Flow

```
1. User submits query via frontend
   ↓
2. POST /api/query receives request
   ↓
3. Rate limiter checks (30/min)
   ↓
4. executeRAGPipeline() invoked
   ↓
5. User authentication & profile loading
   ├── Query: SELECT * FROM users WHERE username = ?
   └── Returns: {username, role, clearance_level, department}
   ↓
6. Prompt injection detection
   ├── Check against INJECTION_PATTERNS
   └── Block if malicious patterns detected
   ↓
7. Query routing (LLM or fallback)
   ├── LLM: Call Nvidia API for intent analysis
   └── Fallback: Keyword-based routing
   ↓
8. RBAC permission checks
   ├── Document-level: Check DOCUMENT_REGISTRY
   ├── Table-level: Check role permissions
   └── Log security decisions
   ↓
9. Multi-source retrieval (parallel)
   ├── SQL: Parameterized queries + RLS filtering
   ├── PDF: Text extraction + semantic chunking
   ├── JSON: Structured filtering + relevance scoring
   └── CSV: Row parsing + RLS filtering
   ↓
10. Context aggregation
    ├── Merge results from all sources
    ├── Apply hybrid scoring
    └── Sort by relevance
    ↓
11. Response generation
    ├── LLM: Call Nvidia API with context
    └── Fallback: Rule-based answer synthesis
    ↓
12. Confidence calculation
    ├── Base score: 100
    ├── Penalties: RLS filtering, low matches, security alerts
    └── Final: 10-100 scale
    ↓
13. Audit logging
    ├── Write to logs/audit_logs.json
    └── Include: timestamp, user, query, sources, decision
    ↓
14. Response formatting
    ├── Answer text
    ├── Citations
    ├── Confidence score
    └── Access audit summary
    ↓
15. Return JSON response to frontend
```

---

## Security Architecture

### Multi-Layer Defense

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Input Validation & Rate Limiting               │
│  • 30 requests/minute throttling                        │
│  • Query sanitization (SQL keyword filtering)           │
│  • Prompt injection detection                           │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Authentication & Authorization                  │
│  • User profile validation                              │
│  • Role-based access control (RBAC)                     │
│  • Clearance level verification                         │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Document-Level Access Control                  │
│  • DOCUMENT_REGISTRY permission checks                  │
│  • File-level role restrictions                         │
│  • Classification-based filtering                       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Row-Level Security (RLS)                       │
│  • Clearance-based row filtering                        │
│  • SQL WHERE clause injection                           │
│  • JSON/CSV record filtering                            │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 5: Audit & Compliance                             │
│  • Comprehensive access logging                         │
│  • Security violation tracking                          │
│  • Immutable audit trail                                │
└─────────────────────────────────────────────────────────┘
```

### RBAC Implementation

**Document Registry Structure:**
```javascript
DOCUMENT_REGISTRY = {
  'filename.pdf': {
    allowed_roles: ['executive', 'finance'],
    min_clearance: 2,
    classification: 'CONFIDENTIAL'
  }
}
```

**Permission Check Logic:**
```javascript
function checkRBAC(user, sourceType, resourceId) {
  // 1. Check if resource exists in registry
  // 2. Verify user role in allowed_roles
  // 3. Verify user clearance >= min_clearance
  // 4. Return {allowed: boolean, reason: string}
}
```

**Row-Level Security:**
```javascript
function rowIsPermitted(user, record) {
  const recordClearance = record.clearance_level || 0;
  return user.clearance_level >= recordClearance;
}
```

---

## Retrieval Pipeline

### SQL Retrieval

```javascript
retrieveSQLContext(query, user, routeInfo, trace)
  ├── Determine target tables from routing
  ├── For each table:
  │   ├── Check RBAC permissions
  │   ├── Build parameterized query
  │   ├── Add RLS WHERE clause
  │   ├── Execute query
  │   ├── Filter results by clearance
  │   └── Score relevance
  └── Return top 10 records
```

**Security Features:**
- Parameterized queries (SQL injection prevention)
- Role-based table access
- Clearance-based row filtering
- Audit logging of all queries

### PDF Retrieval

```javascript
retrievePDFContext(query, user, routeInfo, trace)
  ├── List PDF files in documents/
  ├── For each PDF:
  │   ├── Check RBAC permissions
  │   ├── Extract text (cached)
  │   ├── Split into chunks (500 chars)
  │   ├── Score each chunk (hybrid)
  │   └── Track page numbers
  └── Return top 5 chunks
```

**Chunking Strategy:**
- Fixed size: 500 characters
- Overlap: None (simple split)
- Metadata: Document name, page number

### JSON Retrieval

```javascript
retrieveJSONContext(query, user, routeInfo, trace)
  ├── List JSON files in documents/ and logs/
  ├── For each JSON file:
  │   ├── Check RBAC permissions
  │   ├── Parse JSON array
  │   ├── Filter by clearance (RLS)
  │   ├── Score relevance
  │   └── Extract matching entries
  └── Return top 10 logs
```

### CSV Retrieval

```javascript
retrieveCSVContext(query, user, routeInfo, trace)
  ├── List CSV files in documents/
  ├── For each CSV:
  │   ├── Check RBAC permissions
  │   ├── Parse CSV to objects
  │   ├── Filter by clearance (RLS)
  │   ├── Score relevance
  │   └── Extract matching rows
  └── Return top 10 records
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  clearance_level INTEGER NOT NULL,
  department TEXT
);
```

**Indexes:**
- Primary key on `id`
- Unique index on `username`

**Sample Data:**
```sql
INSERT INTO users VALUES
  (1, 'sarah.executive', 'Sarah Jenkins', 'executive', 3, 'Executive'),
  (2, 'john.hr', 'John Doe', 'hr', 2, 'Human Resources'),
  (3, 'mark.finance', 'Mark Miller', 'finance', 2, 'Finance');
```

### Salaries Table
```sql
CREATE TABLE salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT,
  role TEXT,
  base_salary INTEGER,
  bonus INTEGER,
  clearance_level INTEGER
);
```

**Access Control:**
- Allowed roles: `executive`, `hr`
- Minimum clearance: 2

---

## API Design

### RESTful Endpoints

#### POST /api/query
Execute RAG pipeline with user query.

**Request:**
```json
{
  "username": "sarah.executive",
  "query": "What are Q3 financial projections?"
}
```

**Response:**
```json
{
  "answer": "Based on retrieved context...",
  "confidence": {
    "score": 85,
    "label": "High",
    "note": "2 rows withheld by clearance policy"
  },
  "citations": [
    {
      "index": 1,
      "type": "document",
      "label": "Q3_Financial_Projections.pdf (Page 1)",
      "detail": "Q3 2026 Revenue Goals..."
    }
  ],
  "trace": {
    "intent": "factual_lookup",
    "sources_queried": ["PDF", "SQL"],
    "steps": [...],
    "security_alerts": [],
    "retrieval_metrics": {
      "sql_records": 3,
      "pdf_chunks": 2,
      "rls_filtered": 2
    }
  }
}
```

#### GET /api/source/:type/:id
Introspect specific data source with RBAC enforcement.

**Headers:**
```
x-user-id: sarah.executive
```

**Example:**
```
GET /api/source/sql/salaries
GET /api/source/pdf/Employee_Handbook_2026.pdf
GET /api/source/json/system_logs.json
```

**Response:**
```json
[
  {
    "name": "Sarah Jenkins",
    "department": "Executive",
    "base_salary": 320000,
    "clearance_level": 3
  }
]
```

---

## Frontend Architecture

### Component Structure

```
public/
├── index.html          # Main HTML structure
├── app.js             # Application logic
└── styles.css         # Styling

Components:
├── Sidebar
│   ├── Brand
│   ├── User Selector
│   ├── Navigation Menu
│   └── Footer
├── Main Content
│   ├── Topbar
│   └── View Viewport
│       ├── Query Console
│       ├── Pipeline Visualizer
│       ├── Data Silo Explorer
│       ├── Audit Trail
│       └── Settings
└── Toast Notifications
```

### State Management

```javascript
// Global state
let activeUser = null;
let currentView = 'console';
let queryCache = new Map();

// Event-driven updates
document.addEventListener('userChanged', updateUI);
document.addEventListener('queryComplete', updateMetrics);
```

### Real-time Updates

```javascript
// Query execution flow
submitQuery()
  ├── Show loading state
  ├── Update pipeline visualizer
  ├── Call API
  ├── Stream trace updates
  ├── Display response
  └── Update metrics
```

---

## Performance Considerations

### Caching Strategy

1. **PDF Cache**: In-memory text extraction cache
2. **Query Cache**: Map-based result caching
3. **User Profile Cache**: Session-based caching

### Optimization Techniques

1. **Lazy Loading**: Documents loaded on-demand
2. **Parallel Retrieval**: Multi-source queries run concurrently
3. **Early Termination**: Stop retrieval if sufficient context found
4. **Hybrid Scoring**: Fast TF-IDF + keyword matching

### Scalability Considerations

**Current Limitations:**
- SQLite (single-file database)
- In-memory caching (no persistence)
- Single-threaded Node.js

**Production Recommendations:**
- Migrate to PostgreSQL
- Add Redis for distributed caching
- Implement connection pooling
- Add load balancing
- Use worker threads for PDF processing

---

## Error Handling

### Graceful Degradation

```javascript
try {
  result = await callLLM(prompt);
} catch (error) {
  // Fallback to keyword-based routing
  result = fallbackRoute(query);
}
```

### Error Categories

1. **Authentication Errors**: Invalid username → 403
2. **Authorization Errors**: Insufficient permissions → 403
3. **Validation Errors**: Invalid input → 400
4. **API Errors**: LLM unavailable → Fallback mode
5. **System Errors**: Database failure → 500

---

## Monitoring & Observability

### Audit Logging

Every query generates an audit entry:

```json
{
  "timestamp": "2026-05-21T21:00:00.000Z",
  "username": "sarah.executive",
  "role": "executive",
  "clearance_level": 3,
  "query": "Show Q3 projections",
  "routed_sources": ["PDF", "SQL"],
  "citations_used": 3,
  "access_result": "GRANTED",
  "security_alerts": [],
  "rls_filtered": 2
}
```

### Metrics Tracked

- Pipeline latency
- Cache hit rate
- RLS filtered rows
- Blocked injection attempts
- Security violations

---

## Future Enhancements

1. **Vector Search**: Add embedding-based semantic search
2. **Multi-tenancy**: Support multiple organizations
3. **Real-time Collaboration**: WebSocket-based updates
4. **Advanced Analytics**: Query pattern analysis
5. **ML-based Routing**: Train custom routing model
6. **Federated Search**: Query external data sources
7. **Version Control**: Track document changes
8. **Workflow Automation**: Approval workflows for sensitive queries

---

**Document Version**: 1.0.0  
**Last Updated**: May 21, 2026  
**Maintained By**: PRISM Development Team