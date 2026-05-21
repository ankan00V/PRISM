const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, 'documents');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir);
}

function generatePDF(filename, title, clearance, content) {
  const filePath = path.join(docsDir, filename);
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(filePath);

  doc.pipe(writeStream);

  // Title Header
  doc.fontSize(24).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown();

  // Metadata block
  doc.fontSize(10).font('Helvetica-Oblique')
     .text(`Document Reference: REF-${filename.replace('.pdf', '').toUpperCase()}-2026`, { align: 'left' })
     .text(`Classification: ${clearance}`, { align: 'left' })
     .text(`Date of Release: May 20, 2026`, { align: 'left' });

  // Divider Line
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#8b5cf6').lineWidth(2).stroke();
  doc.moveDown();

  // Content paragraphs
  doc.fontSize(12).font('Helvetica').text(content, {
    align: 'justify',
    lineGap: 4
  });

  // Footer
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica')
       .text(`CONFIDENTIAL - PROPERTY OF PRISM CORP`, 50, 750, { align: 'center', width: 500 });
  }

  doc.end();

  console.log(`Generated PDF: ${filename} (${clearance})`);
}

// 1. Employee Handbook (Public - Clearance 0)
const handbookContent = `Welcome to PRISM! We are thrilled to have you on board. This Employee Handbook provides general guidelines for working at PRISM.

Work Hours and Flexibility:
Our core working hours are 10:00 AM to 4:00 PM EST. However, we value flexibility and permit core team members to structure their schedules as they see fit, provided client deliverables are met and meeting attendance is maintained.

Remote Work Policy:
PRISM operates as a remote-first organization. Employees are entitled to a remote work stipend of $1,000 upon joining to set up their home workspace. We expect all employees to maintain a stable, secure internet connection and follow company safety protocols when using VPN client profiles.

Vacation and Leave:
We offer an Unlimited Paid Time Off (PTO) policy, with a recommended minimum of 25 days per calendar year. We encourage all employees to plan vacations ahead of time and coordinate coverage with their managers.

Communication:
Our primary communication platforms are Slack for real-time messaging, Google Meet for video calls, and GitHub/Notion for project tracking and documentation.`;

generatePDF('Employee_Handbook_2026.pdf', 'PRISM Employee Handbook 2026', 'PUBLIC (Level 0)', handbookContent);

// 2. Project Phoenix Specs (Engineer/Admin - Clearance 1)
const specContent = `CLASSIFIED: INTERNAL ENGINEERING SPECIFICATIONS ONLY. DO NOT DISTRIBUTE.

Project Codename: Project Phoenix
Lead Architect: Alex Rivera (Senior Software Engineer)
Security Clearance: Level 1 (Engineering & Administration)

System Architecture Overview:
Project Phoenix is a distributed AI orchestrator designed to run multi-agent workflows. It coordinates tasks among specialized LLM subagents, handles token usage optimization, and dynamically routes prompt requests.

Database Schema & Caching Layer:
The persistence layer utilizes PostgreSQL for agent state tracking and Redis for prompt caching. Core database models include AgentNode, WorkspaceBranch, and ExecutionLog. To maintain millisecond-level response latency, the API cache utilizes Redis clusters with automated cache eviction on workspace modification.

API Endpoints (Internal Only):
- GET /v1/agent/status: Returns cluster capacity and active agents.
- POST /v1/agent/invoke: Dispatches a prompt to a specific subagent. Payload requires token limits and workspace context parameters.
- POST /v1/agent/branch: Creates a secure, copy-on-write workspace environment for agent tasks.

Security and Access Control:
Access to code repositories and deployment clusters is managed via IAM policies and SSH keys. Deployments are executed via GitHub Actions within isolated VPCs. All active servers must rotate secrets every 90 days.`;

generatePDF('Project_Phoenix_Specs.pdf', 'Project Phoenix Specifications', 'RESTRICTED (Level 1 - Engineers/Admins)', specContent);

// 3. Q3 Financial Projections (Finance/Admin - Clearance 2)
const financialContent = `STRICTLY CONFIDENTIAL: FINANCE & BOARD OF DIRECTORS ONLY.

Title: Q3 Financial Projections and Acquisition Evaluation
Author: Mark Miller (Financial Analyst)
Security Clearance: Level 2 (Finance & Administration)

Q3 2026 Revenue Goals:
Our current forecast projects a 18% quarter-over-quarter revenue growth, targeting gross billings of $4.8M. This growth is primarily driven by enterprise subscription upgrades and the rollout of premium AI workflow seats.

Merger and Acquisition (M&A) Evaluation:
PRISM is currently in late-stage acquisition discussions with Starlight Retail. The proposed deal size is estimated at $12.5M in a cash-and-stock transaction. Finance has completed the preliminary due diligence. If approved, the merger will expand our operational footprint by 35% and onboard over 120 corporate clients.

Budget Allocations and Cost Savings:
To support the acquisition, we are restructuring departmental budgets. The marketing budget will be scaled back by 12%, while R&D will receive a 20% budget increase to accelerate Project Phoenix.

Stock Options and Equity Refactoring:
Board members have proposed a stock option pool expansion of 800,000 shares to incentivize core engineering team members, specifically targeting key engineering leads in the AI workflows division. Details on employee-specific equity options can be accessed via the HR compensation portal.`;

generatePDF('Q3_Financial_Projections.pdf', 'Q3 Financial Projections & M&A Strategy', 'CONFIDENTIAL (Level 2 - Finance/Admins)', financialContent);
