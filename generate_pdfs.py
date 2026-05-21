import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib import colors

def create_pdf(filename, title, clearance_level, classification, content_paragraphs):
    os.makedirs('documents', exist_ok=True)
    filepath = os.path.join('documents', filename)
    doc = SimpleDocTemplate(filepath, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#6d28d9'),
        spaceAfter=15,
        alignment=1 # Center
    )
    
    meta_style = ParagraphStyle(
        'DocMeta',
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#4b5563'),
        spaceAfter=10
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=12
    )

    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#111827'),
        spaceBefore=10,
        spaceAfter=6
    )
    
    story = []
    
    # Title
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 10))
    
    # Metadata
    ref_id = f"REF-{filename.replace('.pdf', '').upper()}-2024"
    story.append(Paragraph(f"<b>Document Reference:</b> {ref_id}", meta_style))
    story.append(Paragraph(f"<b>Security Classification:</b> {classification} (Clearance Level {clearance_level})", meta_style))
    story.append(Paragraph(f"<b>Effective Date:</b> November 12, 2024", meta_style))
    story.append(Paragraph(f"<b>Author/Auditor:</b> Secure Ops & Corporate Governance", meta_style))
    story.append(Spacer(1, 5))
    
    # Divider line
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#8b5cf6'), spaceAfter=20))
    
    # Content Paragraphs
    for p in content_paragraphs:
        if p.startswith('## '):
            story.append(Paragraph(p[3:], h2_style))
        else:
            story.append(Paragraph(p, body_style))
            
    # Page template setup with footer
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica-Bold', 8)
        canvas.setFillColor(colors.HexColor('#9ca3af'))
        canvas.drawCentredString(letter[0]/2.0, 30, f"CONFIDENTIAL - PROPERTY OF SIMPLIFYX CORP | CLEARANCE LEVEL {clearance_level}")
        canvas.restoreState()
        
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    print(f"Generated PDF: {filepath}")

# 1. compliance_report_2024.pdf — GDPR/SOC2 findings, clearance level 3
compliance_content = [
    "## 1. Executive Summary",
    "This audit outlines the assessment of corporate safety policies, technical controls, and operational infrastructure conducted for the fiscal year 2024. This review specifically evaluates compliance with the General Data Protection Regulation (GDPR) Article 32 and SOC2 Type II Trust Services Criteria.",
    "## 2. GDPR Article 32 Compliance Findings",
    "Under GDPR Article 32, SimplifyX is required to implement appropriate technical and organizational measures to ensure a level of security appropriate to the risk. Our auditor, Deloitte, evaluated access controls, pseudonymization, encryption, and system resilience. The assessment confirmed that database security measures meet basic requirements, though database log monitoring needs optimization.",
    "## 3. SOC2 Type II Audit Results",
    "The SOC2 Type II audit report covers the security, availability, and confidentiality trust services criteria. During the audit window, the audit team recorded a total of 50 controls. There are 3 open findings requiring remediation, and 47 controls successfully closed. The primary open findings relate to the timeliness of user access revocation in the development environment.",
    "## 4. Overall Risk and Recommendations",
    "The overall risk level for SimplifyX compliance has been assessed as MEDIUM. Key recommendations include: (1) Automate employee access offboarding workflows; (2) Enable MFA enforcement across legacy VPN servers; (3) Restructure audit log persistence configurations to prevent single-point-of-failure risks.",
]
create_pdf('compliance_report_2024.pdf', 'GDPR & SOC2 Compliance Assessment Report 2024', 3, 'CONFIDENTIAL', compliance_content)

# 2. hr_handbook_v3.pdf — onboarding policies, clearance level 2
hr_content = [
    "## 1. Welcome and Onboarding Procedures",
    "Welcome to SimplifyX! All newly hired employees must complete the onboarding procedure during their first week. This includes completing the tax documentation forms, submitting emergency contact details, and completing the standard security awareness training module in the compliance portal.",
    "## 2. Leave and Vacation Policies",
    "SimplifyX offers a flexible time-off system. Full-time employees are entitled to standard annual leave, sick leave, and parental leave. Any leave requests exceeding 5 consecutive business days must be submitted to the HR Manager (John Doe) at least two weeks in advance for operational planning.",
    "## 3. Performance Review Process",
    "Performance reviews are conducted bi-annually in Q2 and Q4. Managers evaluate employees based on goal achievement, cooperation, and core competencies. Peer feedback is integrated into the review process, culminating in a formal performance assessment and career development discussion.",
    "## 4. Code of Conduct",
    "SimplifyX expects all team members to maintain high ethical standards. We strictly prohibit harassment, discrimination, and retaliation. All employees must safeguard client information and prevent unauthorized sharing of internal source code or documents.",
]
create_pdf('hr_handbook_v3.pdf', 'Employee Onboarding Policies and HR Handbook v3', 2, 'RESTRICTED', hr_content)

# 3. board_deck_Q3_2024.pdf — executive summary, clearance level 3
board_content = [
    "## 1. Executive Summary",
    "This document outlines the corporate financial status, headcount changes, and strategic initiatives reviewed by the Board of Directors for the third quarter of 2024. Access to this document is strictly restricted to executive staff.",
    "## 2. Revenue Summary",
    "During Q3 2024, corporate revenue reached $14.8M, representing a 12% quarter-over-quarter growth. Gross margin remains healthy at 58%. Marketing and sales acquisition costs rose by 5%, offset by higher subscription retention among enterprise tier clients.",
    "## 3. Headcount Planning",
    "The company added 45 new members to the Engineering and Sales departments in Q3. Current headcount stands at 542 active employees. We plan to hire an additional 20 members in Q4 to support product engineering for core AI workflows.",
    "## 4. Regional Performance and Initiatives",
    "The East regional division generated the highest growth rate, posting a 25% revenue increase driven by manufacturing sectors. The West division posted flat growth due to local market restructuring. Key strategic initiatives for the upcoming quarters include expanding operations in EMEA and finalizing agreements for project acquisitions.",
]
create_pdf('board_deck_Q3_2024.pdf', 'Board of Directors Q3 2024 Business Review', 3, 'CONFIDENTIAL', board_content)

# 4. it_security_policy.pdf — password and access policies, clearance level 1
it_content = [
    "## 1. Password Policy",
    "SimplifyX employees must use strong passwords for all business accounts. Passwords must be at least 12 characters long and contain a mix of uppercase letters, lowercase letters, numbers, and special characters. Passwords must be changed every 90 days and must not be reused.",
    "## 2. VPN Access Rules",
    "Employees accessing internal resources (such as database endpoints, staging environments, and source code control repositories) must connect via the corporate VPN. Sharing VPN credentials or client profiles is strictly prohibited.",
    "## 3. Incident Response Steps",
    "In the event of a suspected security incident (e.g., lost device, phishing email link click, unauthorized access warning), employees must: (1) Disconnect the affected device from the network; (2) File an incident report in the Security portal; (3) Await instructions from the IT Operations response team.",
    "## 4. Device Management",
    "Only company-issued or approved personal devices with up-to-date security patches may connect to the corporate network. MDM software must be installed on all laptops used for company operations.",
]
create_pdf('it_security_policy.pdf', 'Corporate IT Security and Access Control Policy', 1, 'INTERNAL', it_content)
