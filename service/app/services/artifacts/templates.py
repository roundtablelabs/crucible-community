from jinja2 import Template

DECISION_BRIEF_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Roundtable Decision Brief</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            color: #1a202c;
            margin: 0;
            padding: 0;
            background: #fff;
            -webkit-print-color-adjust: exact;
            font-size: 14px;
        }
        
        /* Cover Page */
        .cover-page {
            height: 100vh;
            width: 100%;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 80px;
            page-break-after: always;
            position: relative;
        }
        .cover-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: auto;
        }
        .logo-svg {
            width: 32px;
            height: 32px;
        }
        .logo-text {
            font-family: 'Playfair Display', serif;
            font-size: 18px;
            letter-spacing: 3px;
            text-transform: uppercase;
            opacity: 0.9;
            font-weight: 600;
        }
        .cover-title {
            font-family: 'Playfair Display', serif;
            font-size: 42px;
            line-height: 1.2;
            font-weight: 900;
            margin-bottom: 40px;
            max-width: 90%;
        }
        .cover-meta {
            font-size: 12px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            border-top: 1px solid rgba(255,255,255,0.3);
            padding-top: 25px;
            margin-top: auto;
            display: flex;
            gap: 40px;
        }
        .cover-badge {
            background: #ef4444;
            color: white;
            padding: 6px 14px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            position: absolute;
            top: 80px;
            right: 80px;
        }

        /* Content Pages */
        .page {
            padding: 0;
            page-break-after: always;
            min-height: calc(100vh - 4cm);
            margin: 0;
            position: relative;
        }
        .page-content {
            padding: 50px 0;
        }
        
        h1, h2, h3, h4 {
            font-family: 'Playfair Display', serif;
            color: #0f172a;
            margin-top: 0;
            page-break-after: avoid;
        }
        h2 {
            font-size: 28px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-top: 0;
            margin-bottom: 25px;
            font-weight: 700;
            page-break-after: avoid;
        }
        h3 {
            font-size: 20px;
            margin-top: 30px;
            margin-bottom: 15px;
            font-weight: 600;
            page-break-after: avoid;
        }
        h4 {
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        /* Executive Summary */
        .summary-section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        .summary-text {
            font-size: 16px;
            font-weight: 400;
            line-height: 1.75;
            color: #334155;
            margin-bottom: 25px;
        }
        .summary-text p {
            margin-bottom: 15px;
        }
        .summary-text strong {
            font-weight: 600;
            color: #0f172a;
        }
        .summary-text em {
            font-style: italic;
            color: #475569;
        }
        .summary-text ul, .summary-text ol {
            margin-left: 20px;
            margin-bottom: 15px;
        }
        .summary-text li {
            margin-bottom: 8px;
        }
        .confidence-badge {
            display: inline-block;
            background: #f8fafc;
            border: 2px solid #0f172a;
            padding: 12px 20px;
            border-radius: 6px;
            margin-top: 20px;
        }
        .confidence-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #64748b;
            margin-bottom: 4px;
        }
        .confidence-score {
            font-size: 32px;
            font-weight: 700;
            color: #0f172a;
            font-family: 'Playfair Display', serif;
        }

        /* Final Ruling Section */
        .ruling-section {
            background: #f8fafc;
            border-left: 4px solid #0f172a;
            padding: 30px;
            margin: 30px 0;
            border-radius: 4px;
            page-break-inside: avoid;
        }
        .ruling-title {
            font-family: 'Playfair Display', serif;
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 15px;
        }
        .ruling-text {
            font-size: 17px;
            line-height: 1.7;
            color: #1e293b;
            font-weight: 500;
            margin-bottom: 15px;
        }
        .ruling-notes {
            font-size: 14px;
            line-height: 1.6;
            color: #475569;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }
        .ruling-notes p {
            margin-bottom: 12px;
        }
        .ruling-notes strong {
            font-weight: 600;
        }

        /* Red Team Alert */
        .red-team-box {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 25px;
            margin: 25px 0;
            border-radius: 4px;
            page-break-inside: avoid;
        }
        .red-team-header {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #991b1b;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
            font-size: 12px;
        }
        .red-team-content {
            font-size: 15px;
            line-height: 1.65;
            color: #7f1d1d;
        }
        .red-team-content p {
            margin-bottom: 12px;
        }
        .red-team-content ul {
            margin-top: 12px;
            padding-left: 22px;
        }
        .red-team-content li {
            margin-bottom: 8px;
        }

        /* Positions - Single Column, Stacked */
        .positions-list {
            display: block;
        }
        .position-card {
            background: #f8fafc;
            padding: 25px;
            border-left: 4px solid #0f172a;
            border-radius: 4px;
            margin-bottom: 25px;
            page-break-inside: avoid;
        }
        .role-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #64748b;
            margin-bottom: 10px;
            display: block;
            font-weight: 600;
        }
        .position-headline {
            font-family: 'Playfair Display', serif;
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 12px;
            line-height: 1.3;
            color: #0f172a;
        }
        .position-body {
            font-size: 14px;
            color: #475569;
            line-height: 1.65;
            margin-bottom: 12px;
        }
        .position-body p {
            margin-bottom: 12px;
        }
        .position-body strong {
            font-weight: 600;
            color: #0f172a;
        }
        .position-body em {
            font-style: italic;
        }
        .position-body ul, .position-body ol {
            margin-left: 20px;
            margin-bottom: 12px;
        }
        .position-body li {
            margin-bottom: 6px;
        }
        .citation-link {
            font-size: 11px;
            color: #94a3b8;
            margin-top: 12px;
            display: block;
            font-style: italic;
        }

        /* Challenges */
        .challenges-list {
            display: block;
        }
        .challenge-item {
            padding: 20px;
            background: #fff;
            border-left: 3px solid #ef4444;
            border-radius: 4px;
            margin-bottom: 18px;
            page-break-inside: avoid;
        }
        .challenge-header {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 10px;
            color: #991b1b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .challenge-text {
            font-size: 14px;
            line-height: 1.65;
            color: #334155;
            font-style: italic;
        }

        /* Research Sources */
        .sources-list {
            display: block;
        }
        .source-item {
            padding: 18px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 15px;
            page-break-inside: avoid;
        }
        .source-item:last-child {
            border-bottom: none;
        }
        .source-title {
            font-size: 14px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 6px;
            line-height: 1.4;
        }
        .source-title a {
            color: #2563eb;
            text-decoration: none;
        }
        .source-snippet {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            margin-top: 6px;
        }

        /* Action Plan / Critical Risks */
        .action-section {
            background: #f0f9ff;
            border-left: 4px solid #2563eb;
            padding: 25px;
            margin: 25px 0;
            border-radius: 4px;
            page-break-inside: avoid;
        }
        .action-section h3 {
            margin-top: 0;
            color: #1e40af;
        }
        .action-section ul {
            margin: 12px 0;
            padding-left: 22px;
        }
        .action-section li {
            margin-bottom: 10px;
            line-height: 1.6;
        }

        /* Dissenting Points */
        .dissent-section {
            background: #fefce8;
            border-left: 4px solid #eab308;
            padding: 25px;
            margin: 25px 0;
            border-radius: 4px;
            page-break-inside: avoid;
        }
        .dissent-section h3 {
            margin-top: 0;
            color: #854d0e;
        }
        .dissent-section ul {
            margin: 12px 0;
            padding-left: 22px;
        }
        .dissent-section li {
            margin-bottom: 10px;
            line-height: 1.6;
        }

        /* Text formatting - prevent orphaned lines */
        p {
            margin-bottom: 12px;
            orphans: 3;
            widows: 3;
        }
        ul, ol {
            margin-bottom: 12px;
            orphans: 3;
            widows: 3;
        }
        li {
            orphans: 3;
            widows: 3;
        }
        /* Prevent breaking inside important elements */
        .ruling-section,
        .red-team-box,
        .position-card,
        .challenge-item,
        .risks-section,
        .actions-section,
        .dissent-section {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        h2, h3 {
            page-break-after: avoid;
            break-after: avoid;
        }
        strong {
            font-weight: 600;
            color: #0f172a;
        }
        em {
            font-style: italic;
        }
        code {
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
            font-family: 'Courier New', monospace;
        }
        blockquote {
            border-left: 3px solid #cbd5e1;
            padding-left: 15px;
            margin: 15px 0;
            color: #64748b;
            font-style: italic;
        }
    </style>
</head>
<body>
    <!-- Cover Page -->
    <div class="cover-page">
        <div class="cover-badge">Confidential</div>
        <div class="cover-logo">
            <svg class="logo-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <mask id="roundtable-mask">
                        <rect width="24" height="24" fill="#fff" />
                        <path d="M20.937 6.84 A10.32 10.32 0 0 1 22.163 13.792 L12 12 Z" fill="#000" />
                    </mask>
                </defs>
                <circle cx="12" cy="12" r="10.8" fill="none" stroke="#FFF" stroke-width="2.4" mask="url(#roundtable-mask)" />
                <g fill="#FFD675" style="opacity: 0.85">
                    <circle cx="20.16" cy="12.0" r="1.08" />
                    <circle cx="19.067" cy="16.08" r="1.08" />
                    <circle cx="16.08" cy="19.067" r="1.08" />
                    <circle cx="12.0" cy="20.16" r="1.08" />
                    <circle cx="7.92" cy="19.067" r="1.08" />
                    <circle cx="4.933" cy="16.08" r="1.08" />
                    <circle cx="3.84" cy="12.0" r="1.08" />
                    <circle cx="4.933" cy="7.92" r="1.08" />
                    <circle cx="7.92" cy="4.933" r="1.08" />
                    <circle cx="12.0" cy="3.84" r="1.08" />
                    <circle cx="16.08" cy="4.933" r="1.08" />
                    <circle cx="19.067" cy="7.92" r="1.08" />
                </g>
                <circle cx="12" cy="12" r="1" fill="#96AABE" />
            </svg>
            <span class="logo-text">Roundtable AI</span>
        </div>
        <div class="cover-title">{{ question }}</div>
        <div class="cover-meta">
            <div><strong>Date:</strong> {{ date }}</div>
            <div><strong>Prepared For:</strong> Executive Board</div>
            <div><strong>Session ID:</strong> {{ session_id_short }}</div>
        </div>
    </div>

    <!-- Page 1: Executive Summary -->
    <div class="page">
        <div class="page-content">
        <h2>Executive Summary</h2>
        <div class="summary-section">
            <div class="summary-text">
                {{ summary|safe }}
            </div>
            <div class="confidence-badge">
                <div class="confidence-label">Confidence Level</div>
                <div class="confidence-score">{{ confidence }}%</div>
            </div>
        </div>

        {% if final_ruling %}
        <div class="ruling-section">
            <div class="ruling-title">⚖️ Final Judgment</div>
            <div class="ruling-text">{{ final_ruling.ruling }}</div>
            {% if final_ruling.notes %}
            <div class="ruling-notes">{{ final_ruling.notes|safe }}</div>
            {% endif %}
        </div>
        {% endif %}

        {% if red_team %}
        <div class="red-team-box">
            <div class="red-team-header">
                ⚠️ Red Team Assessment // Severity: {{ red_team.severity|upper }}
            </div>
            <div class="red-team-content">
                <p><strong>Critique:</strong> {{ red_team.critique }}</p>
                {% if red_team.flaws_identified %}
                <ul>
                {% for flaw in red_team.flaws_identified %}
                    <li>{{ flaw }}</li>
                {% endfor %}
                </ul>
                {% endif %}
            </div>
        </div>
        {% endif %}
    </div>

    <!-- Page 2: Strategic Positions -->
    {% if positions %}
    <div class="page">
        <div class="page-content">
        <h2>Strategic Positions</h2>
        <div class="positions-list">
            {% for pos in positions %}
            <div class="position-card">
                <span class="role-label">{{ pos.knight_role }}</span>
                <div class="position-headline">{{ pos.headline }}</div>
                <div class="position-body">{{ pos.body|safe }}</div>
                {% if pos.citations %}
                <span class="citation-link">Source: {{ pos.citations[0] }}</span>
                {% endif %}
            </div>
            {% endfor %}
        </div>
        </div>
    </div>
    {% endif %}

    <!-- Page 3: Analysis & Recommendations -->
    <div class="page">
        <div class="page-content">
        {% if challenges %}
        <h2>Cross-Examination Highlights</h2>
        <div class="challenges-list">
            {% for challenge in challenges %}
            <div class="challenge-item">
                <div class="challenge-header">Challenge: {{ challenge.challenger_role }} → {{ challenge.target_role }}</div>
                <div class="challenge-text">{{ challenge.contestation }}</div>
            </div>
            {% endfor %}
        </div>
        {% endif %}

        {% if critical_risks %}
        <div class="action-section">
            <h3>Critical Risks</h3>
            <ul>
            {% for risk in critical_risks %}
                <li>{{ risk }}</li>
            {% endfor %}
            </ul>
        </div>
        {% endif %}

        {% if action_plan %}
        <div class="action-section">
            <h3>Recommended Actions</h3>
            <ul>
            {% for action in action_plan %}
                <li>{{ action }}</li>
            {% endfor %}
            </ul>
        </div>
        {% endif %}

        {% if dissenting_points %}
        <div class="dissent-section">
            <h3>Dissenting Views</h3>
            <ul>
            {% for point in dissenting_points %}
                <li>{{ point }}</li>
            {% endfor %}
            </ul>
        </div>
        {% endif %}
        </div>
    </div>

    <!-- Page 4: Research Appendix -->
    {% if sources %}
    <div class="page">
        <div class="page-content">
        <h2>Research Appendix</h2>
        <div class="sources-list">
            {% for source in sources %}
            <div class="source-item">
                <div class="source-title">
                    <a href="{{ source.url }}">{{ source.title }}</a>
                </div>
                {% if source.snippet %}
                <div class="source-snippet">{{ source.snippet }}</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
        </div>
    </div>
    {% endif %}
</body>
</html>
"""
