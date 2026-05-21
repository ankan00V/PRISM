const { executeRAGPipeline, getUserProfile, checkRBAC } = require('./rag_engine');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise.db');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Enterprise RAG Security & RBAC Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // TEST 1: Identity & Permission Profile Resolution
  console.log('Test Scenario 1: Identity Resolution');
  const executive = await getUserProfile('sarah.executive');
  assert(executive && executive.role === 'executive' && executive.clearance_level === 3, 'Executive resolves to executive role (clearance Level 3)');

  const it_ops = await getUserProfile('alex.it_ops');
  assert(it_ops && it_ops.role === 'it_ops' && it_ops.clearance_level === 1, 'IT Ops resolves to it_ops role (clearance Level 1)');

  const invalidUser = await getUserProfile('unknown.user');
  assert(invalidUser === null, 'Unknown username resolves to null');
  console.log('');

  // TEST 2: Programmatic RBAC Rules Check
  console.log('Test Scenario 2: Programmatic RBAC Verification');
  
  // salaries database check
  assert(checkRBAC(executive, 'SQL', 'salaries').allowed === true, 'Executive can read salaries database table');
  assert(checkRBAC({ role: 'hr', clearance_level: 2 }, 'SQL', 'salaries').allowed === true, 'HR Manager can read salaries database table');
  assert(checkRBAC(it_ops, 'SQL', 'salaries').allowed === false, 'IT Ops is BLOCKED from reading salaries database table');
  
  // contract database check
  assert(checkRBAC({ role: 'finance', clearance_level: 2 }, 'SQL', 'contracts').allowed === true, 'Finance Specialist can read contracts table');
  assert(checkRBAC({ role: 'hr', clearance_level: 2 }, 'SQL', 'contracts').allowed === false, 'HR Manager is BLOCKED from reading contracts table');
  
  // PDF Document clearance check
  assert(checkRBAC(executive, 'PDF', 'Project_Phoenix_Specs.pdf').allowed === true, 'Executive can read Project Phoenix engineering specs');
  assert(checkRBAC(it_ops, 'PDF', 'Project_Phoenix_Specs.pdf').allowed === true, 'IT Ops can read Project Phoenix engineering specs');
  assert(checkRBAC({ role: 'intern', clearance_level: 0 }, 'PDF', 'Project_Phoenix_Specs.pdf').allowed === false, 'Intern is BLOCKED from Project Phoenix specs');
  assert(checkRBAC({ role: 'finance', clearance_level: 2 }, 'PDF', 'Project_Phoenix_Specs.pdf').allowed === false, 'Finance user is BLOCKED from Project Phoenix specs');

  // JSON log files clearance check
  assert(checkRBAC(executive, 'JSON', 'system_audit.json').allowed === true, 'Executive can read security system audit logs');
  assert(checkRBAC({ role: 'finance', clearance_level: 2 }, 'JSON', 'system_audit.json').allowed === false, 'Finance is BLOCKED from security system audit logs');
  assert(checkRBAC(it_ops, 'JSON', 'infrastructure_logs.json').allowed === true, 'IT Ops can read infrastructure logs');
  console.log('');

  // TEST 3: Integrated RAG Pipeline Execution
  console.log('Test Scenario 3: RAG Pipeline Execution (Secure Isolation)');
  
  // Executive requesting restricted financial data
  console.log('Simulating Executive Query: "Show client contract details"');
  const executiveResult = await executeRAGPipeline('sarah.executive', 'Show client contract details');
  assert(
    executiveResult.trace.security_alerts.length === 0 && 
    executiveResult.trace.steps.some(s => s.phase === 'SQL Retrieval' && s.status === 'COMPLETED'),
    'Executive retrieves SQL contract details successfully without security warnings'
  );

  // Intern requesting restricted financial data
  console.log('Simulating Intern Query: "What are Q3 financial projections?"');
  const internResult = await executeRAGPipeline('guest.intern', 'What are Q3 financial projections?');
  assert(
    internResult.trace.security_alerts.some(alert => alert.includes('Blocked access to document')),
    'Intern requesting Q3 Financial projections document is programmatically BLOCKED with security alert logged'
  );

  // Intern requesting public handbook
  console.log('Simulating Intern Query: "Show me handbook remote work stipend details"');
  const internPublicResult = await executeRAGPipeline('guest.intern', 'Show me handbook remote work stipend details');
  assert(
    internPublicResult.trace.security_alerts.length === 0 &&
    internPublicResult.trace.steps.some(s => s.phase === 'PDF Retrieval' && s.status === 'COMPLETED'),
    'Intern requesting public Handbook PDF content retrieves data successfully'
  );
  console.log('');

  console.log('====================================================');
  console.log(`🏁 Test Suite Finished: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
