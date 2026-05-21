import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib import colors

def create_submission_pdf():
    filepath = 'PRISM_Submission.pdf'
    
    # Page template setup
    # Margins: 36pt (0.5 inch) to fit everything cleanly on one page
    doc = SimpleDocTemplate(
        filepath, 
        pagesize=letter, 
        rightMargin=36, 
        leftMargin=36, 
        topMargin=36, 
        bottomMargin=36
    )
    styles = getSampleStyleSheet()
    
    # Custom styles for dense single-page layout
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=22,
        textColor=colors.HexColor('#6d28d9'),
        spaceAfter=4,
        alignment=1  # Center
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#4b5563'),
        spaceAfter=10,
        alignment=1  # Center
    )
    
    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14,
        textColor=colors.HexColor('#111827'),
        spaceBefore=6,
        spaceAfter=4
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=4
    )
    
    bullet_style = ParagraphStyle(
        'BulletStyle',
        parent=body_style,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=3
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#1f2937')
    )
    
    story = []
    
    # Header Title
    story.append(Paragraph("PRISM: ENTERPRISE RAG INTELLIGENCE SYSTEM", title_style))
    story.append(Paragraph("Secure, Context-Aware Knowledge Retrieval with Multi-Layered RBAC & RLS Guardrails", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#8b5cf6'), spaceAfter=8))
    
    # Problem Statement
    story.append(Paragraph("1. Problem Statement", h1_style))
    story.append(Paragraph(
        "Modern enterprises face massive data fragmentation across disconnected document folders, SQLite/CSV databases, and JSON logs. "
        "Retrieving answers from these sources using standard LLMs risks leaking sensitive information (e.g., salaries, M&A strategy, audit details) to unauthorized employees. "
        "PRISM solves this by wrapping retrieval-augmented generation (RAG) in programmatic Role-Based Access Control (RBAC) and Row-Level Security (RLS) to enforce strict compliance on every query.",
        body_style
    ))
    
    # Architecture Overview
    story.append(Paragraph("2. Core Architecture", h1_style))
    story.append(Paragraph(
        "PRISM processes queries through an integrated, multi-phase explainability pipeline: "
        "(1) <b>Identity Resolution:</b> Resolves the caller's credentials and corporate role; "
        "(2) <b>Sanitization & Defense:</b> Sanitizes queries and blocks prompt injection; "
        "(3) <b>Intent Query Routing:</b> Dynamically routes queries to relevant silos; "
        "(4) <b>Parallel Retrieval & RLS:</b> Programmatically checks silo RBAC and applies row-level clearance checks; "
        "(5) <b>Grounded LLM Synthesis:</b> Merges context and generates answers with inline citations [SOURCE N].",
        body_style
    ))
    
    # Security Model
    story.append(Paragraph("3. Multi-Layer Security Model", h1_style))
    story.append(Paragraph("• <b>Silo-Level RBAC:</b> Access to databases, PDFs, and JSON audit files is guarded at the API boundary, restricting unauthorized roles entirely.", bullet_style))
    story.append(Paragraph("• <b>Row-Level Security (RLS):</b> Filters rows/records where clearance level > user clearance, preventing exfiltration during context merging.", bullet_style))
    story.append(Paragraph("• <b>Jailbreak Protection:</b> Input filters detect prompt injection, blocking queries and logging attempts as security audit alerts.", bullet_style))
    story.append(Paragraph("• <b>Dynamic Role-Based Caching:</b> Keys query caches by <code>role:clearance_level:query</code> to prevent cross-department cache poisoning.", bullet_style))
    story.append(Paragraph("• <b>Append-Only Audit Log:</b> Generates a secure, persistent log on disk detailing the caller, routed sources, citations, and security status.", bullet_style))

    # Data Sources & Compliance Matrix Table
    story.append(Paragraph("4. Data Sources and Clearance Compliance Matrix", h1_style))
    
    table_data = [
        [
            Paragraph("Silo Type", table_header_style), 
            Paragraph("Resource Identifier", table_header_style), 
            Paragraph("Clearance", table_header_style), 
            Paragraph("Permitted Roles", table_header_style)
        ],
        [
            Paragraph("SQL Database", table_cell_style), 
            Paragraph("employees, salaries, contracts, compliance_records", table_cell_style), 
            Paragraph("Level 0 - 3", table_cell_style), 
            Paragraph("Executive, HR, Finance, IT Ops, Analyst", table_cell_style)
        ],
        [
            Paragraph("PDF Documents", table_cell_style), 
            Paragraph("compliance_report_2024.pdf, board_deck_Q3_2024.pdf", table_cell_style), 
            Paragraph("Level 2 - 3", table_cell_style), 
            Paragraph("Executive, Compliance, HR", table_cell_style)
        ],
        [
            Paragraph("PDF Documents", table_cell_style), 
            Paragraph("it_security_policy.pdf, Employee_Handbook_2026.pdf", table_cell_style), 
            Paragraph("Level 0 - 1", table_cell_style), 
            Paragraph("Executive, IT Ops, Analyst, Intern", table_cell_style)
        ],
        [
            Paragraph("CSV Spreadsheet", table_cell_style), 
            Paragraph("sales_kpi_2026.csv, compliance_records.csv", table_cell_style), 
            Paragraph("Level 1 - 3", table_cell_style), 
            Paragraph("Executive, Finance, Analyst, Compliance", table_cell_style)
        ],
        [
            Paragraph("JSON System Logs", table_cell_style), 
            Paragraph("system_logs.json, audit_trail.json, system_audit.json", table_cell_style), 
            Paragraph("Level 1 - 3", table_cell_style), 
            Paragraph("Executive, IT Operations, Compliance", table_cell_style)
        ],
    ]
    
    # Table styling for clean modern look
    t = Table(table_data, colWidths=[80, 240, 60, 160])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6d28d9')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.HexColor('#f3f4f6')]),
        ('TOPPADDING', (0, 1), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Spacer(1, 4))
    
    # Production Grade Features
    story.append(Paragraph("5. Production-Grade Features", h1_style))
    story.append(Paragraph(
        "• <b>Hybrid Scoring:</b> Integrates TF-IDF and keyword sequence matching to retrieve highly relevant context snippets from PDF and CSV text.<br/>"
        "• <b>Offline Fallback Mode:</b> Gracefully degrades to local rule-based database & handbook queries if Nvidia NIM API endpoints timeout or key is missing.<br/>"
        "• <b>Rate Limiting & Safety:</b> Enforces Express-level endpoint rate-limits (30 requests/min) to prevent denial-of-service and brute force queries.<br/>"
        "• <b>Explainability Dashboard:</b> An interactive dark-mode frontend featuring a data silo browser, a pipeline visualizer, live security metrics, and filterable audit trail logs.",
        body_style
    ))
    
    # Footer
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica-Bold', 7)
        canvas.setFillColor(colors.HexColor('#9ca3af'))
        canvas.drawCentredString(letter[0]/2.0, 15, "CONFIDENTIAL - SYSTEM DOCUMENTATION SUBMISSION FOR PRISM ENTERPRISE RAG PLATFORM")
        canvas.restoreState()
        
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    print(f"Generated Submission PDF: {filepath}")

if __name__ == '__main__':
    create_submission_pdf()
