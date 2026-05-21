# PRISM API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
Most endpoints require user identification via request body or headers. RBAC enforcement is applied based on user role and clearance level.

---

## Endpoints

### 1. Execute RAG Query

Execute a natural language query through the RAG pipeline with RBAC enforcement.

**Endpoint:** `POST /api/query`

**Request Body:**
```json
{
  "username": "sarah.executive",
  "query": "What are Q3 financial projections?"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| username | string | Yes | Username for RBAC enforcement |
| query | string | Yes | Natural language query (max 500 chars) |

**Response:** `200 OK`
```json
{
  "answer": "Based on the Q3 Financial Projections document [SOURCE 1], our current forecast projects an 18% quarter-over-quarter revenue growth, targeting gross billings of $4.8M...",
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
      "detail": "Q3 2026 Revenue Goals: Our current forecast projects..."
    },
    {
      "index": 2,
      "type": "database",
      "label": "financials",
      "detail": "{\"fiscal_year\":2026,\"quarter\":\"Q3\",\"revenue\":4800000}"
    }
  ],
  "trace": {
    "intent": "factual_lookup",
    "sources_queried": ["PDF", "SQL"],
    "steps": [
      {
        "phase": "Authentication & RBAC Mapping",
        "status": "COMPLETED",
        "message": "User authenticated: sarah.executive (executive, L3)"
      },
      {
        "phase": "Routing & Intent Analysis",
        "status": "COMPLETED",
        "message": "Routed query to data sources: PDF, SQL",
        "details": {
          "intent": "factual_lookup",
          "primary_source": "PDF",
          "sources": ["PDF", "SQL"],
          "keywords": ["financial", "projections"]
        }
      },
      {
        "phase": "RBAC Security Audit",
        "status": "COMPLETED",
        "message": "Access granted to 2 sources"
      },
      {
        "phase": "PDF Retrieval",
        "status": "COMPLETED",
        "message": "Retrieved 2 relevant document chunks"
      },
      {
        "phase": "SQL Retrieval",
        "status": "COMPLETED",
        "message": "Retrieved 3 relevant database records. 2 rows withheld by RLS.",
        "rls_filtered": 2
      },
      {
        "phase": "Grounded Answer Generation",
        "status": "COMPLETED",
        "message": "Successfully generated grounded answer.",
        "confidence": "85%"
      }
    ],
    "security_alerts": [],
    "retrieval_metrics": {
      "sql_records": 3,
      "pdf_chunks": 2,
      "json_logs": 0,
      "csv_rows": 0,
      "rls_filtered": 2
    }
  }
}
```

**Error Responses:**

`400 Bad Request` - Missing required fields
```json
{
  "error": "Username and Query are required."
}
```

`403 Forbidden` - Access denied
```json
{
  "error": "Access Denied: Insufficient clearance level"
}
```

`429 Too Many Requests` - Rate limit exceeded
```json
{
  "error": "Too many requests, please try again later."
}
```

`500 Internal Server Error` - Server error
```json
{
  "error": "Internal Server Error during RAG processing."
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sarah.executive",
    "query": "What are Q3 financial projections?"
  }'
```

---

### 2. Get Users

Retrieve list of all available users with their roles and clearance levels.

**Endpoint:** `GET /api/users`

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "username": "sarah.executive",
    "name": "Sarah Jenkins",
    "role": "executive",
    "clearance_level": 3,
    "department": "Executive"
  },
  {
    "id": 2,
    "username": "john.hr",
    "name": "John Doe",
    "role": "hr",
    "clearance_level": 2,
    "department": "Human Resources"
  },
  {
    "id": 3,
    "username": "mark.finance",
    "name": "Mark Miller",
    "role": "finance",
    "clearance_level": 2,
    "department": "Finance"
  }
]
```

**Example cURL:**
```bash
curl http://localhost:5000/api/users
```

---

### 3. Introspect Data Source

Browse raw data from a specific source with RBAC enforcement.

**Endpoint:** `GET /api/source/:type/:id`

**Headers:**
```
x-user-id: sarah.executive
```

**Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| type | string | Source type: `sql`, `pdf`, `json`, `csv` |
| id | string | Resource identifier (table name, filename) |

**Examples:**

**SQL Table:**
```
GET /api/source/sql/salaries
Headers: x-user-id: sarah.executive
```

Response:
```json
[
  {
    "id": 1,
    "name": "Sarah Jenkins",
    "department": "Executive",
    "role": "CEO",
    "base_salary": 320000,
    "bonus": 85000,
    "clearance_level": 3
  },
  {
    "id": 2,
    "name": "John Doe",
    "department": "Human Resources",
    "role": "HR Manager",
    "base_salary": 95000,
    "bonus": 8000,
    "clearance_level": 2
  }
]
```

**PDF Document:**
```
GET /api/source/pdf/Employee_Handbook_2026.pdf
Headers: x-user-id: guest.intern
```

Response:
```json
{
  "name": "Employee_Handbook_2026.pdf",
  "text": "Welcome to PRISM! We are thrilled to have you on board..."
}
```

**JSON Log:**
```
GET /api/source/json/system_logs.json
Headers: x-user-id: alex.it_ops
```

Response:
```json
[
  {
    "timestamp": "2026-05-20T14:23:45Z",
    "level": "INFO",
    "service": "api-gateway",
    "message": "Request processed successfully",
    "clearance_level": 0
  },
  {
    "timestamp": "2026-05-20T14:25:12Z",
    "level": "ERROR",
    "service": "database",
    "message": "Connection timeout",
    "clearance_level": 1
  }
]
```

**CSV File:**
```
GET /api/source/csv/sales_kpi_2026.csv
Headers: x-user-id: mark.finance
```

Response:
```json
[
  {
    "region": "North America",
    "quarter": "Q1",
    "target": "1200000",
    "actual": "1350000",
    "clearance_level": "1"
  },
  {
    "region": "Europe",
    "quarter": "Q1",
    "target": "800000",
    "actual": "750000",
    "clearance_level": "1"
  }
]
```

**Error Responses:**

`401 Unauthorized` - Missing user header
```json
{
  "error": "Unauthorized. x-user-id header required."
}
```

`403 Forbidden` - Access denied
```json
{
  "error": "Access Denied: Insufficient clearance level"
}
```

`404 Not Found` - Source not found
```json
{
  "error": "Source not found."
}
```

**Example cURL:**
```bash
curl http://localhost:5000/api/source/sql/salaries \
  -H "x-user-id: sarah.executive"
```

---

### 4. Get Audit Logs

Retrieve security audit logs for compliance and monitoring.

**Endpoint:** `GET /api/audit-logs`

**Response:** `200 OK`
```json
[
  {
    "timestamp": "2026-05-21T21:15:30.123Z",
    "username": "sarah.executive",
    "role": "executive",
    "clearance_level": 3,
    "query": "Show Q3 financial projections",
    "routed_sources": ["PDF", "SQL"],
    "citations_used": 3,
    "access_result": "GRANTED",
    "security_alerts": [],
    "rls_filtered": 0
  },
  {
    "timestamp": "2026-05-21T21:16:45.456Z",
    "username": "guest.intern",
    "role": "intern",
    "clearance_level": 0,
    "query": "What are Q3 financial projections?",
    "routed_sources": ["PDF"],
    "citations_used": 0,
    "access_result": "DENIED",
    "security_alerts": [
      "Blocked access to document: Q3_Financial_Projections.pdf (requires clearance level 2, user has 0)"
    ],
    "rls_filtered": 0
  }
]
```

**Example cURL:**
```bash
curl http://localhost:5000/api/audit-logs
```

---

### 5. Get Data Sources

Retrieve metadata about available data sources and their access policies.

**Endpoint:** `GET /api/data-sources`

**Response:** `200 OK`
```json
{
  "databases": [
    {
      "name": "salaries",
      "description": "Employee salary records",
      "allowed_roles": "executive, hr",
      "min_clearance": 2
    },
    {
      "name": "contracts",
      "description": "Enterprise client agreements",
      "allowed_roles": "executive, finance",
      "min_clearance": 2
    },
    {
      "name": "compliance_records",
      "description": "Regulatory & safety handbook records",
      "allowed_roles": "executive, hr, finance, it_ops, analyst",
      "min_clearance": 0
    }
  ],
  "documents": [
    {
      "name": "Employee_Handbook_2026.pdf",
      "description": "PRISM general employee manual",
      "allowed_roles": "executive, hr, finance, it_ops, analyst, intern",
      "min_clearance": 0
    },
    {
      "name": "Project_Phoenix_Specs.pdf",
      "description": "Technical specs & API configurations",
      "allowed_roles": "executive, it_ops",
      "min_clearance": 1
    },
    {
      "name": "Q3_Financial_Projections.pdf",
      "description": "Confidential corporate strategy and M&A details",
      "allowed_roles": "executive, finance, analyst",
      "min_clearance": 2
    }
  ],
  "logs": [
    {
      "name": "infrastructure_logs.json",
      "description": "Developer database and cache service alerts",
      "allowed_roles": "executive, it_ops",
      "min_clearance": 1
    },
    {
      "name": "system_audit.json",
      "description": "Security access check logs",
      "allowed_roles": "executive",
      "min_clearance": 3
    }
  ]
}
```

**Example cURL:**
```bash
curl http://localhost:5000/api/data-sources
```

---

### 6. Update API Key

Update the Nvidia NIM API key for LLM features.

**Endpoint:** `POST /api/settings/apikey`

**Request Body:**
```json
{
  "apiKey": "nvapi-your_new_key_here"
}
```

**Response:** `200 OK`
```json
{
  "message": "API key updated and saved successfully."
}
```

**Error Responses:**

`400 Bad Request` - Missing API key
```json
{
  "error": "API key is required."
}
```

`500 Internal Server Error` - Failed to save
```json
{
  "error": "Failed to save API key to environment config."
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:5000/api/settings/apikey \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "nvapi-your_new_key_here"
  }'
```

---

### 7. Re-seed Database

Reset and re-initialize the database and documents.

**Endpoint:** `POST /api/settings/reseed`

**Response:** `200 OK`
```json
{
  "message": "Database and PDF documents successfully seeded."
}
```

**Error Response:**

`500 Internal Server Error` - Seeding failed
```json
{
  "error": "Failed to execute seeding scripts: <error message>"
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:5000/api/settings/reseed
```

---

## Rate Limiting

All `/api/*` endpoints are rate-limited to **30 requests per minute** per client IP.

**Rate Limit Headers:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1716328800
```

**Rate Limit Exceeded Response:** `429 Too Many Requests`
```json
{
  "error": "Too many requests, please try again later."
}
```

---

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## RBAC Enforcement

### Clearance Levels

| Level | Classification | Description |
|-------|---------------|-------------|
| 0 | Public | Accessible to all users |
| 1 | Internal/Restricted | Internal use only |
| 2 | Confidential | Sensitive business data |
| 3 | Highly Confidential | Executive-level only |

### Role Permissions

| Role | Clearance | Access Scope |
|------|-----------|--------------|
| executive | 3 | Full access to all sources |
| compliance | 3 | Full read access for audits |
| hr | 2 | Employee records, HR policies |
| finance | 2 | Financial data, contracts, sales |
| it_ops | 1 | Infrastructure logs, tech specs |
| analyst | 1 | Anonymized sales and ops data |
| intern | 0 | Public summaries only |

### Access Control Flow

```
1. User makes request with username/x-user-id
   ↓
2. System loads user profile (role, clearance)
   ↓
3. Check document-level permissions
   - Is user role in allowed_roles?
   - Is user clearance >= min_clearance?
   ↓
4. Apply row-level security (RLS)
   - Filter records by clearance_level field
   - Only return rows where user clearance >= record clearance
   ↓
5. Log access decision to audit trail
   ↓
6. Return filtered results or access denied error
```

---

## Query Execution Pipeline

### Pipeline Stages

1. **Authentication & RBAC Mapping**
   - Load user profile
   - Validate permissions

2. **Routing & Intent Analysis**
   - Analyze query intent
   - Determine target sources
   - Extract keywords

3. **RBAC Security Audit**
   - Check document permissions
   - Verify clearance levels
   - Log security decisions

4. **Multi-Source Retrieval**
   - SQL: Parameterized queries + RLS
   - PDF: Semantic chunking + scoring
   - JSON: Structured filtering
   - CSV: Row-level security

5. **Grounded Answer Generation**
   - LLM synthesis with context
   - Citation extraction
   - Confidence calculation

6. **Audit Logging**
   - Write to audit trail
   - Track security violations

---

## Best Practices

### 1. Always Provide Username
```javascript
// Good
fetch('/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'sarah.executive',
    query: 'Show Q3 projections'
  })
});

// Bad - Missing username
fetch('/api/query', {
  method: 'POST',
  body: JSON.stringify({ query: 'Show Q3 projections' })
});
```

### 2. Handle Rate Limits
```javascript
async function queryWithRetry(username, query, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, query })
    });
    
    if (response.status === 429) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
    
    return response.json();
  }
  throw new Error('Rate limit exceeded');
}
```

### 3. Check Security Alerts
```javascript
const result = await fetch('/api/query', { /* ... */ }).then(r => r.json());

if (result.trace.security_alerts.length > 0) {
  console.warn('Security violations:', result.trace.security_alerts);
  // Handle blocked access appropriately
}
```

### 4. Use Confidence Scores
```javascript
const result = await fetch('/api/query', { /* ... */ }).then(r => r.json());

if (result.confidence.score < 50) {
  console.warn('Low confidence response:', result.confidence.note);
  // Consider showing warning to user
}
```

---

## SDK Examples

### JavaScript/Node.js

```javascript
class PRISMClient {
  constructor(baseURL = 'http://localhost:5000/api') {
    this.baseURL = baseURL;
  }

  async query(username, query) {
    const response = await fetch(`${this.baseURL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, query })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getUsers() {
    const response = await fetch(`${this.baseURL}/users`);
    return response.json();
  }

  async introspectSource(type, id, username) {
    const response = await fetch(`${this.baseURL}/source/${type}/${id}`, {
      headers: { 'x-user-id': username }
    });
    return response.json();
  }

  async getAuditLogs() {
    const response = await fetch(`${this.baseURL}/audit-logs`);
    return response.json();
  }
}

// Usage
const client = new PRISMClient();
const result = await client.query('sarah.executive', 'Show Q3 projections');
console.log(result.answer);
```

### Python

```python
import requests

class PRISMClient:
    def __init__(self, base_url='http://localhost:5000/api'):
        self.base_url = base_url
    
    def query(self, username, query):
        response = requests.post(
            f'{self.base_url}/query',
            json={'username': username, 'query': query}
        )
        response.raise_for_status()
        return response.json()
    
    def get_users(self):
        response = requests.get(f'{self.base_url}/users')
        return response.json()
    
    def introspect_source(self, source_type, source_id, username):
        response = requests.get(
            f'{self.base_url}/source/{source_type}/{source_id}',
            headers={'x-user-id': username}
        )
        return response.json()

# Usage
client = PRISMClient()
result = client.query('sarah.executive', 'Show Q3 projections')
print(result['answer'])
```

---

## Troubleshooting

### Common Issues

**Issue: "NVIDIA_API_KEY not configured"**
- Solution: Add API key via `/api/settings/apikey` or set in `.env` file
- Note: System works in offline mode without API key

**Issue: "Access Denied: Insufficient clearance level"**
- Solution: Use a user with appropriate clearance level
- Check `/api/data-sources` for required permissions

**Issue: "Too many requests"**
- Solution: Implement exponential backoff retry logic
- Rate limit: 30 requests per minute

**Issue: "Source not found"**
- Solution: Verify source exists with `/api/data-sources`
- Check spelling of table/file names

---

## Changelog

### Version 1.0.0 (May 21, 2026)
- Initial API release
- RAG query execution
- Multi-source retrieval
- RBAC enforcement
- Audit logging
- Rate limiting

---

**API Version**: 1.0.0  
**Last Updated**: May 21, 2026  
**Base URL**: http://localhost:5000/api