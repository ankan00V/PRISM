const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'prism.db');
const db = new sqlite3.Database(dbPath);

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i];
    });
    return row;
  });
}

function getNameFromEmail(email) {
  const localPart = email.split('@')[0];
  return localPart.split('.').map(part => {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

db.serialize(() => {
  console.log('Initializing SQLite database (prism.db)...');

  // 1. Users Table
  db.run(`DROP TABLE IF EXISTS users`);
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    name TEXT,
    role TEXT,
    clearance_level INTEGER,
    department TEXT
  )`);

  // Seed Users
  const userStmt = db.prepare(`INSERT OR IGNORE INTO users (username, name, role, clearance_level, department) VALUES (?, ?, ?, ?, ?)`);
  
  // Seed Legacy test personas first
  userStmt.run('sarah.executive', 'Sarah Jenkins', 'executive', 3, 'Executive');
  userStmt.run('john.hr', 'John Doe', 'hr', 2, 'Human Resources');
  userStmt.run('mark.finance', 'Mark Miller', 'finance', 2, 'Finance');
  userStmt.run('alex.it_ops', 'Alex Rivera', 'it_ops', 1, 'IT Operations');
  userStmt.run('ana.analyst', 'Ana Martinez', 'analyst', 1, 'Business Analysis');
  userStmt.run('guest.intern', 'Guest Intern', 'intern', 0, 'External');

  // Seed real corporate users
  try {
    const userMappingPath = path.join(__dirname, 'documents', 'rbac_user_mapping.csv');
    if (fs.existsSync(userMappingPath)) {
      const csvUsers = parseCSV(userMappingPath);
      csvUsers.forEach(u => {
        const name = getNameFromEmail(u.username);
        const clearance = parseInt(u.clearance_level || '0', 10);
        userStmt.run(u.username, name, u.assigned_rbac_role, clearance, u.department);
      });
      console.log(`Successfully seeded ${csvUsers.length} users from CSV.`);
    } else {
      console.warn(`User mapping file not found at ${userMappingPath}`);
    }
  } catch (err) {
    console.error(`Error seeding users from CSV: ${err.message}`);
  }
  userStmt.finalize();

  // 2. Salaries Table (legacy support)
  db.run(`DROP TABLE IF EXISTS salaries`);
  db.run(`CREATE TABLE salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    department TEXT,
    role TEXT,
    base_salary INTEGER,
    bonus INTEGER,
    clearance_level INTEGER
  )`);

  const salaryStmt = db.prepare(`INSERT INTO salaries (name, department, role, base_salary, bonus, clearance_level) VALUES (?, ?, ?, ?, ?, ?)`);
  salaryStmt.run('Sarah Jenkins', 'Executive', 'CEO', 320000, 85000, 3);
  salaryStmt.run('John Doe', 'Human Resources', 'HR Manager', 95000, 8000, 2);
  salaryStmt.run('Mark Miller', 'Finance', 'Financial Analyst', 105000, 12000, 2);
  salaryStmt.run('Alex Rivera', 'IT Operations', 'Lead Engineer', 140000, 15000, 1);
  salaryStmt.run('Ana Martinez', 'Business Analysis', 'Business Analyst', 85000, 5000, 1);
  salaryStmt.run('Guest Intern', 'External', 'Intern', 35000, 0, 0);
  salaryStmt.finalize();

  // 3. High-Value Contracts (legacy support)
  db.run(`DROP TABLE IF EXISTS contracts`);
  db.run(`CREATE TABLE contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    project_name TEXT,
    contract_value REAL,
    status TEXT,
    allowed_roles TEXT
  )`);

  const contractStmt = db.prepare(`INSERT INTO contracts (client_name, project_name, contract_value, status, allowed_roles) VALUES (?, ?, ?, ?, ?)`);
  contractStmt.run('Nexus Corp', 'Cloud Migration Phase II', 1250000.00, 'Active', 'executive,finance');
  contractStmt.run('Aether Tech', 'AI Model Integration', 450000.00, 'Pending Approval', 'executive,finance');
  contractStmt.run('Starlight Retail', 'Legacy Code Modernization', 89000.00, 'Completed', 'executive,finance,it_ops,analyst');
  contractStmt.run('Global Logistics', 'Route Optimization Algorithm', 620000.00, 'Active', 'executive,finance,it_ops,analyst');
  contractStmt.run('Nova Energy', 'Grid Simulation Engine', 2100000.00, 'Drafting', 'executive,finance');
  contractStmt.finalize();

  // 4. Compliance Records Table (legacy support)
  db.run(`DROP TABLE IF EXISTS compliance_records`);
  db.run(`CREATE TABLE compliance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_name TEXT,
    category TEXT,
    content TEXT,
    clearance_level INTEGER
  )`);

  const complianceStmt = db.prepare(`INSERT INTO compliance_records (policy_name, category, content, clearance_level) VALUES (?, ?, ?, ?)`);
  complianceStmt.run(
    'General Workplace Safety Policy',
    'Safety',
    'All employees must follow standard emergency exit paths and report workplace hazards to HR immediately. Safety drills are conducted quarterly.',
    0
  );
  complianceStmt.run(
    'IT Asset Access Policy',
    'IT Security',
    'Employees must use MFA for all corporate accounts. VPN is required when accessing code repositories or customer data outside the corporate office network.',
    1
  );
  complianceStmt.run(
    'Financial Reimbursement Guideline',
    'Finance',
    'Travel and lodging expenses exceeding $500 must obtain pre-approval from the Finance department. Receipts must be uploaded within 15 days of expenditure.',
    2
  );
  complianceStmt.run(
    'Mergers & Acquisitions Confidential Protocol',
    'Executive Strategy',
    'Details regarding the potential acquisition of Project PRISM must be kept strictly confidential. Access is restricted to Executive board members only.',
    3
  );
  complianceStmt.finalize();

  // 5. Employees Table (from employee_records.csv)
  db.run(`DROP TABLE IF EXISTS employees`);
  db.run(`CREATE TABLE employees (
    emp_id INTEGER PRIMARY KEY,
    name TEXT,
    department TEXT,
    role TEXT,
    salary INTEGER,
    clearance_level INTEGER
  )`);

  try {
    const empCSVPath = path.join(__dirname, 'documents', 'employee_records.csv');
    if (fs.existsSync(empCSVPath)) {
      const csvEmps = parseCSV(empCSVPath);
      const empStmt = db.prepare(`INSERT OR REPLACE INTO employees (emp_id, name, department, role, salary, clearance_level) VALUES (?, ?, ?, ?, ?, ?)`);
      csvEmps.forEach(e => {
        const empId = parseInt(e.emp_id, 10);
        const name = `${e.first_name || ''} ${e.last_name || ''}`.trim();
        const dept = e.department || '';
        const role = e.role || '';
        const salary = parseInt(e.salary || '0', 10);
        const clearance = parseInt(e.clearance_level || '0', 10);
        empStmt.run(empId, name, dept, role, salary, clearance);
      });
      empStmt.finalize();
      console.log(`Successfully seeded ${csvEmps.length} employees from CSV into employees table.`);
    } else {
      console.warn(`employee_records.csv not found at ${empCSVPath}`);
    }
  } catch (err) {
    console.error(`Error seeding employees table: ${err.message}`);
  }

  // 6. Financials Table (from financial_summary.csv)
  db.run(`DROP TABLE IF EXISTS financials`);
  db.run(`CREATE TABLE financials (
    fiscal_year INTEGER,
    quarter TEXT,
    revenue INTEGER,
    ebitda INTEGER,
    net_income INTEGER,
    clearance_level INTEGER
  )`);

  try {
    const finCSVPath = path.join(__dirname, 'documents', 'financial_summary.csv');
    if (fs.existsSync(finCSVPath)) {
      const csvFins = parseCSV(finCSVPath);
      const finStmt = db.prepare(`INSERT INTO financials (fiscal_year, quarter, revenue, ebitda, net_income, clearance_level) VALUES (?, ?, ?, ?, ?, ?)`);
      csvFins.forEach(f => {
        const year = parseInt(f.fiscal_year, 10);
        const quarter = f.quarter || '';
        const revenue = parseInt(f.revenue || '0', 10);
        const ebitda = parseInt(f.ebitda || '0', 10);
        const netIncome = parseInt(f.net_income || '0', 10);
        const clearance = parseInt(f.clearance_level || '0', 10);
        finStmt.run(year, quarter, revenue, ebitda, netIncome, clearance);
      });
      finStmt.finalize();
      console.log(`Successfully seeded ${csvFins.length} financial records from CSV into financials table.`);
    } else {
      console.warn(`financial_summary.csv not found at ${finCSVPath}`);
    }
  } catch (err) {
    console.error(`Error seeding financials table: ${err.message}`);
  }

  console.log('SQLite Database (prism.db) successfully initialized and seeded.');
});

db.close();
