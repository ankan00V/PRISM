# PRISM — Permissions-based Retrieval Intelligence System for Multi-source data

> A production-grade, secure Retrieval-Augmented Generation system with strict RBAC enforcement for enterprise data silos.

## Overview

PRISM (Permissions-based Retrieval Intelligence System for Multi-source data) is an enterprise RAG system that intelligently retrieves and generates accurate responses from heterogeneous data sources while enforcing role-based access control at every layer.

### Key Capabilities

- **Multi-Format Data Ingestion**: PDFs, SQL databases, JSON logs, CSV spreadsheets
- **Intelligent Query Routing**: LLM-powered intent analysis with keyword fallback
- **Hybrid Search**: TF-IDF + keyword matching for optimal retrieval
- **Strict RBAC**: Document, row, and field-level access control
- **Explainable AI**: Full retrieval tracing with source citations
- **Production Ready**: Rate limiting, caching, audit logging, graceful degradation

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Nvidia NIM API key (optional - works offline without it)

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY (optional)

# Initialize database and generate documents
npm run seed

# Start the server
npm start
```

Access the dashboard at `http://localhost:5000`

### Running Tests

```bash
npm test
```

Expected: 18 tests passing with RBAC enforcement validated.

## Architecture

```
User Query
    ↓
Authentication & RBAC Mapping
    ↓
Intent Query Routing (LLM/Fallback)
    ↓
Programmatic Access Audit
    ↓
Multi-Source Retrieval + RLS
    ├── SQL (parameterized queries)
    ├── PDF (semantic chunking)
    ├── JSON (structured filtering)
    └── CSV (row-level security)
    ↓
Grounded Answer Generation
    ↓
Response + Citations + Audit Trail
```

## Data Sources

### SQL Databases
- `salaries` - Employee compensation (HR, Executive)
- `contracts` - Client agreements (Finance, Executive)
- `compliance_records` - Regulatory policies (All roles)
- `employees` - Personnel records (HR, Finance, Executive)
- `financials` - Financial summaries (Finance, Executive)

### PDF Documents
- `Employee_Handbook_2026.pdf` - General policies (Public)
- `Project_Phoenix_Specs.pdf` - Technical specs (IT Ops, Executive)
- `Q3_Financial_Projections.pdf` - Financial forecasts (Finance, Executive)
- `hr_handbook_v3.pdf` - HR policies (HR, Compliance, Executive)
- `board_deck_Q3_2024.pdf` - Board materials (Compliance, Executive)
- `compliance_report_2024.pdf` - Compliance audit (Compliance, Executive)
- `it_security_policy.pdf` - Security guidelines (IT Ops, Analyst, Executive)

### JSON Logs
- `system_logs.json` - Application logs (All roles)
- `audit_trail.json` - Access logs (All roles)
- `infrastructure_logs.json` - Infrastructure alerts (IT Ops, Executive)
- `system_audit.json` - Security audits (Executive only)

### CSV Spreadsheets
- `sales_kpi_2026.csv` - Sales metrics (Finance, Analyst, Executive)
- `compliance_records.csv` - Compliance data (Compliance, Executive)
- `employee_records.csv` - Employee data (HR, Finance, Executive)
- `financial_summary.csv` - Financial data (Finance, Executive)

## RBAC Policy Matrix

| Role | Clearance | Access Scope |
|------|-----------|--------------|
| Executive | Level 3 | Full access to all sources |
| Compliance | Level 3 | Full read access for audits |
| HR | Level 2 | Employee records, HR policies |
| Finance | Level 2 | Financial data, contracts, sales |
| IT Ops | Level 1 | Infrastructure logs, tech specs |
| Analyst | Level 1 | Anonymized sales and ops data |
| Intern | Level 0 | Public summaries only |

**Clearance Levels:**
- Level 0: Public
- Level 1: Internal/Restricted
- Level 2: Confidential
- Level 3: Highly Confidential

## Sample Queries

### Executive (Full Access)
```
"Show me Q3 financial projections"
"What are the details of the Nexus Corp contract?"
"List all employees with clearance level 3"
```

### Finance
```
"What is our revenue for Q3 2024?"
"Show active client contracts"
"What are the sales KPIs for 2026?"
```

### IT Ops
```
"Show me recent infrastructure alerts"
"What are the Project Phoenix technical specifications?"
"List database query exceptions from system logs"
```

### HR
```
"What is the remote work policy?"
"Show employee records for the Finance department"
"What are the PTO guidelines?"
```

### Intern (Limited Access)
```
"What is the company's remote work stipend?" ✅ Allowed
"Show me all salaries" ❌ Denied
"What are Q3 financial projections?" ❌ Denied
```

## Security Features

### 1. Multi-Layer RBAC
- **Document-level**: Per-file/table access control
- **Row-level**: Clearance-based filtering
- **Field-level**: Sensitive data masking

### 2. Prompt Injection Detection
Blocks patterns like:
- "Ignore previous instructions"
- "You are now a..."
- SQL injection attempts

### 3. Comprehensive Audit Logging
Every query logs:
- User identity and role
- Query content
- Sources accessed
- Access decisions (GRANTED/DENIED)
- Security violations

### 4. Rate Limiting
- 30 requests/minute per client
- Prevents abuse and DoS attacks

### 5. Query Sanitization
- SQL keyword filtering
- Input length limits
- Special character escaping

## API Endpoints

### Execute RAG Query
```http
POST /api/query
Content-Type: application/json

{
  "username": "sarah.executive",
  "query": "What are Q3 financial projections?"
}
```

### Get Users
```http
GET /api/users
```

### Introspect Data Source
```http
GET /api/source/:type/:id
Headers: x-user-id: username
```

### Get Audit Logs
```http
GET /api/audit-logs
```

### Update API Key
```http
POST /api/settings/apikey
Content-Type: application/json

{
  "apiKey": "nvapi-..."
}
```

### Re-seed Database
```http
POST /api/settings/reseed
```

## Web Dashboard Features

- **Query Console**: Natural language interface with suggested queries
- **Pipeline Visualizer**: Real-time execution flow diagram
- **Data Silo Explorer**: Browse raw data with RBAC enforcement
- **Security Audit Trail**: Comprehensive access logs with filtering
- **Settings Panel**: API configuration and database management

## Performance Optimizations

1. **PDF Caching**: Extracted text cached in memory
2. **Query Caching**: Repeated queries served from cache
3. **Hybrid Search**: Fast TF-IDF + keyword matching
4. **Lazy Loading**: Documents loaded on-demand
5. **Connection Pooling**: Efficient database connections

## Project Structure

```
simplifyx/
├── server.js              # Express API server
├── rag_engine.js          # Core RAG pipeline
├── database.js            # SQLite seeding
├── pdf_generator.js       # Synthetic PDF generation
├── test_rag.js           # Test suite
├── prism.db              # SQLite database
├── documents/            # Enterprise data files
│   ├── *.pdf
│   ├── *.csv
│   ├── *.json
│   └── rbac_policy.json
├── public/              # Frontend
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── logs/               # Audit logs
    └── audit_logs.json
```

## Challenge Requirements Compliance

| Requirement | Implementation |
|------------|----------------|
| ✅ Intelligent Retrieval | Hybrid TF-IDF + keyword search with LLM routing |
| ✅ Secure Access Control | Multi-layer RBAC (document/row/field level) |
| ✅ Accurate Generation | LLM synthesis with source grounding |
| ✅ Explainability | Full trace with confidence scores & citations |
| ✅ Multi-Format Support | PDF, SQL, JSON, CSV unified interface |
| ✅ Multi-Source Reasoning | Cross-silo context aggregation |
| ✅ Hallucination Prevention | Grounded responses with explicit citations |
| ✅ Enterprise Security | Audit logging, rate limiting, injection detection |

## Advanced Features

- **Offline Fallback Mode**: Works without LLM API using keyword routing
- **Real-time Security Monitoring**: Live violation tracking
- **Confidence Scoring**: Multi-factor confidence calculation
- **Citation Extraction**: Automatic source attribution
- **Graceful Degradation**: Continues during partial failures

## Testing Strategy

The test suite validates:

1. **Identity Resolution**: User profile loading and validation
2. **RBAC Verification**: Permission checks across all data types
3. **Pipeline Execution**: End-to-end query processing
4. **Security Enforcement**: Proper access denial for unauthorized requests
5. **Public Access**: Correct handling of public documents

Run `npm test` to execute all 18 test cases.

## Environment Variables

```bash
# Required for LLM features (optional - works offline without it)
NVIDIA_API_KEY=nvapi-your_key_here

# Server configuration
PORT=5000
NODE_ENV=development

# Force offline mode (optional)
OFFLINE_MODE=false
```

## Deployment Considerations

For production deployment:

1. **Authentication**: Add JWT/OAuth middleware
2. **Database**: Migrate to PostgreSQL for production scale
3. **Encryption**: Enable database encryption at rest
4. **Monitoring**: Set up logging aggregation (ELK/Datadog)
5. **Backup**: Implement automated backup strategies
6. **HTTPS**: Enable SSL/TLS certificates
7. **Secrets**: Use secret management (AWS Secrets Manager, Vault)

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed system design
- [SECURITY.md](SECURITY.md) - Security implementation details
- [API.md](API.md) - Complete API reference

---

**Built for the Enterprise RAG Intelligence Challenge**