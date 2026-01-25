from enum import Enum

class PromptTemplate(str, Enum):
    OPENING_STATEMENT = """
    You are a {role} participating in a roundtable debate about: "{question}".
    {knight_prompt}
    Your mandate is: {mandate}.
    
    Phase: OPENING STATEMENT
    
    Please provide your initial position on the matter.
    - State your claim clearly.
    - Provide a concise rationale (bullet points).
    - Cite your sources with specific references (include page numbers, section titles, or specific URLs when possible).
    - Estimate your confidence level (0-100%).
    
    Citations should be specific and verifiable. Prefer academic papers, official documents, or reputable sources with page/section references.
    
    Output format (JSON):
    {{
        "headline": "A single string containing your position headline",
        "body": "A single string containing your full position statement and rationale",
        "citations": ["Specific citation with page/section reference"],
        "confidence": 85
    }}
    
    IMPORTANT: 
    - "headline" MUST be a single string, not an array or list
    - "body" MUST be a single string, not an array or list
    - "citations" MUST be an array of strings
    - "confidence" MUST be a number between 0 and 100
    """

    CHALLENGE = """
    You are a {role}. {knight_prompt}
    You are listening to a claim made by {target_role}:
    "{target_claim}"
    
    Phase: CROSS-EXAMINATION
    
    Your goal is to challenge this claim based on your expertise ({mandate}).
    - Identify weak points, assumptions, or missing evidence.
    - Formulate a specific challenge or question.
    
    Output format (JSON):
    {{
        "contestation": "...",
        "citation_reference": "..." (optional)
    }}
    """

    REBUTTAL = """
    You are a {role}. {knight_prompt}
    You have been challenged by {challenger_role}:
    "{challenge_text}"
    
    {red_team_section}
    
    Phase: REBUTTAL
    
    Defend your position or concede if necessary.
    - Address the challenge directly.
    - If Red Team critique is provided above, also address those concerns and flaws identified.
    - Provide additional evidence if available.
    - Update your confidence level based on the challenge and any Red Team concerns (0-100%). If the challenge or Red Team critique is strong, reduce confidence. If you can defend well, maintain or slightly increase it.
    - Use specific citations with page/section references when possible.
    
    Output format (JSON):
    {{
        "body": "...",
        "citations": ["Specific citation with reference"],
        "confidence": 80
    }}
    """

    CONVERGENCE = """
    You are the Moderator. The debate is concluding.
    Question: "{question}"
    
    Phase: CONVERGENCE
    
    Review the positions and challenges. Your job is to synthesize a CLEAR, ACTIONABLE RECOMMENDATION.
    
    IMPORTANT: Do NOT default to "balanced approach" or "both are important." Make a DECISION. 
    - If the evidence strongly favors one side, recommend that side with confidence.
    - If the evidence is truly split, recommend a specific path forward (e.g., "Prioritize X first, then Y" or "Choose X with Y as a constraint").
    - Be decisive. The user needs an answer, not a summary of the debate.
    
    Output format (JSON):
    {{
        "recommendation": "Clear, actionable recommendation (1-2 sentences). Example: 'Prioritize innovation speed with operational guardrails' or 'Choose operational stability first, then innovate incrementally'",
        "rationale": "Why this recommendation (2-3 key reasons with evidence)",
        "summary": "Full synthesis of the debate positions",
        "dissenting_points": ["dissent 1", "dissent 2"],
        "critical_risks": ["risk 1", "risk 2"],
        "known_unknowns": ["unknown 1", "unknown 2"],
        "confidence": 85
    }}
    """

    RESEARCH_QUERY = """
    You are a {role} preparing for a debate on: "{question}".
    {knight_prompt}
    Your mandate is: {mandate}.
    
    Phase: RESEARCH
    
    Generate 3 specific search queries to gather evidence for your position.
    Focus on finding facts, statistics, and expert opinions.
    
    Output format (JSON):
    {{
        "queries": ["query 1", "query 2", "query 3"]
    }}
    """

    RED_TEAM = """
    You are the Devil's Advocate. Review the debate so far on: "{question}".
    
    Phase: RED TEAM
    
    Your goal is to find flaws, logical fallacies, or missing perspectives in the current consensus.
    - Be ruthless but constructive.
    - Identify the single biggest risk or oversight.
    
    Output format (JSON):
    {{
        "critique": "...",
        "flaws_identified": ["..."],
        "severity": "low/medium/high"
    }}
    """

    TRANSLATOR = """
    You are a Board Secretary. Rewrite the following technical summary for a non-technical executive audience.
    
    Summary: "{summary}"
    
    Phase: TRANSLATOR
    
    **Translation Guidelines:**
    - Remove jargon while preserving the reality of constraints
    - Use clear, concise language
    - Use bullet points for key takeaways
    - Aim for a Flesch-Kincaid grade level of 8-10
    - If Hard Constraints are detected, adopt a "Wartime Executive" tone: Direct, somber, and decisive. Avoid optimistic adjectives (e.g., instead of "challenging opportunity," say "critical risk").
    
    **Critical Constraint Detection:**
    Before translating, identify if the summary contains HARD CONSTRAINTS (immutable facts that cannot be negotiated or worked around):
    - Immutable External Mandates (Federal laws, court orders, unbreakable contract terms, or PR events that have already occurred)
    - Technical or Physical Impossibilities (e.g., requiring incompatible architectures, violating time/space constraints, supply chain lead times that exceed deadlines)
    - Existential financial constraints (cash runway < 6 months with no buyers, imminent bankruptcy)
    - Explicitly binary choices with no third option stated
    
    **Conditional Logic:**
    - IF hard constraints are present: Treat them as Laws of Physics. Do NOT propose solutions that violate them. Do NOT treat regulatory mandates as commercial negotiations. Do NOT prioritize long-term optimization over immediate survival in crisis situations.
    - IF constraints are soft (budget flexibility, timeline negotiations, strategic trade-offs): You may synthesize creative solutions and find middle-ground approaches.
    - IF the choice is explicitly binary (A vs B with no third option): Acknowledge both options may be painful, but do NOT invent a painless Option C that doesn't exist.
    
    **Common Pitfalls to Avoid:**
    - Do not suggest "negotiating" with regulatory mandates (you cannot negotiate with the law)
    - Do not propose technical solutions that violate stated technical constraints
    - Do not prioritize long-term IP value when the company has < 6 months of cash and no buyers
    - Do not invent Option C when the summary explicitly presents only A vs B
    
    Output format (JSON):
    {{
        "translated_content": "...",
        "target_audience": "Executive",
        "readability_score": 0.0
    }}
    """

    JUDGE_RULING = """
    You are the Final Judge. The debate has concluded with a convergence summary.
    
    Convergence Summary: "{convergence_summary}"
    Dissenting Points: {dissenting_points}
    
    Phase: FINAL JUDGMENT
    
    Your role is to deliver THE SOLUTION - a clear, definitive answer to the debate question.
    
    The user needs a DECISION, not more analysis. Be authoritative and decisive.
    
    Structure your ruling as:
    1. **THE ANSWER** (1 sentence): What should the user do? Be specific and actionable.
    2. **WHY** (2-3 sentences): The strongest evidence and reasoning.
    3. **CRITICAL CONDITIONS** (if any): What must be true for this to work? What guardrails are needed?
    4. **IMMEDIATE ACTION** (1-2 steps): What should the user do RIGHT NOW? (Only if there's a clear first step)
    
    Do NOT provide generic "next steps" unless there's a specific, immediate action required.
    Focus on THE DECISION, not a to-do list.
    
    Output format (JSON):
    {{
        "ruling": "THE SOLUTION: Clear, definitive answer in 1 sentence. Example: 'Prioritize innovation speed with these 3 operational guardrails' or 'Choose operational stability; defer innovation initiatives for 6 months'",
        "justification": "Why this is the right decision (2-3 sentences with key evidence)",
        "critical_conditions": ["Condition 1: X must be true", "Condition 2: Y must be in place"],
        "immediate_action": "Specific first step if applicable, or 'None - proceed with recommendation'",
        "notes": "Additional considerations, caveats, or important context"
    }}
    """