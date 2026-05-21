# PRISM Quick Start Guide

Get PRISM up and running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- 5 GB free disk space

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (optional - works without API key)
cp .env.example .env

# 3. Initialize database and documents
npm run seed

# 4. Start the server
npm start
```

## Access the Dashboard

Open your browser: **http://localhost:5000**

## Test the System

```bash
npm test
```

Expected: **18 tests passing** ✅

## Try Sample Queries

### As Executive (Full Access)
1. Select user: `sarah.executive`
2. Try query: `"Show me Q3 financial projections"`
3. Result: ✅ Access granted, full data retrieved

### As Intern (Limited Access)
1. Select user: `guest.intern`
2. Try query: `"What are Q3 financial projections?"`
3. Result: ❌ Access denied (requires Level 2 clearance)

### As IT Ops (Technical Access)
1. Select user: `alex.it_ops`
2. Try query: `"Show Project Phoenix technical specifications"`
3. Result: ✅ Access granted, technical docs retrieved

## Key Features to Explore

### 1. Query Console
- Natural language queries
- Real-time RBAC enforcement
- Source citations
- Confidence scoring

### 2. Pipeline Visualizer
- Watch query execution flow
- See security gates in action
- Monitor performance metrics

### 3. Data Silo Explorer
- Browse raw data sources
- See RBAC filtering live
- Understand data structure

### 4. Security Audit Trail
- View all query attempts
- Track security violations
- Monitor access patterns

## Available Users

| Username | Role | Clearance | Access Level |
|----------|------|-----------|--------------|
| sarah.executive | Executive | Level 3 | Full access |
| john.hr | HR | Level 2 | Employee data |
| mark.finance | Finance | Level 2 | Financial data |
| alex.it_ops | IT Ops | Level 1 | Infrastructure |
| ana.analyst | Analyst | Level 1 | Analytics |
| guest.intern | Intern | Level 0 | Public only |

## Sample Queries by Role

### Executive Queries
```
"Show me Q3 financial projections"
"What are the details of the Nexus Corp contract?"
"List all employees with clearance level 3"
```

### Finance Queries
```
"What is our revenue for Q3 2024?"
"Show active client contracts"
"What are the sales KPIs for 2026?"
```

### IT Ops Queries
```
"Show me recent infrastructure alerts"
"What are the Project Phoenix technical specifications?"
"List database query exceptions from system logs"
```

### HR Queries
```
"What is the remote work policy?"
"Show employee records for the Finance department"
"What are the PTO guidelines?"
```

### Intern Queries (Limited)
```
"What is the company's remote work stipend?" ✅
"Show me the employee handbook" ✅
"Show me all salaries" ❌ Denied
"What are Q3 financial projections?" ❌ Denied
```

## API Usage

### Execute Query
```bash
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sarah.executive",
    "query": "Show Q3 projections"
  }'
```

### Get Users
```bash
curl http://localhost:5000/api/users
```

### Browse Data Source
```bash
curl http://localhost:5000/api/source/sql/salaries \
  -H "x-user-id: sarah.executive"
```

## Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=5001
```

### Database Issues
```bash
# Re-seed database
npm run seed
```

### API Key (Optional)
```bash
# Add to .env
NVIDIA_API_KEY=nvapi-your_key_here

# Or use offline mode (no API key needed)
OFFLINE_MODE=true
```

## Next Steps

1. **Read Documentation**
   - [README.md](README.md) - Full overview
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System design
   - [API.md](API.md) - API reference
   - [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment

2. **Explore Features**
   - Try different user roles
   - Test security boundaries
   - Review audit logs
   - Examine pipeline traces

3. **Customize**
   - Add your own documents
   - Create custom roles
   - Modify RBAC policies
   - Extend data sources

## Support

- **Tests Failing?** Run `npm run seed` to reset database
- **Server Won't Start?** Check port availability with `lsof -i :5000`
- **Need Help?** Check [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section

---

**You're all set!** 🚀 Start exploring PRISM's secure RAG capabilities.