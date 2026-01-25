// Helper function to get company information from environment variables
function getCompanyInfo() {
  return {
    companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "Crucible Community",
    legalCompanyName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "Crucible Community",
    abn: process.env.NEXT_PUBLIC_COMPANY_ABN || "",
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "",
    contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@example.com",
    privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@example.com",
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@example.com",
    securityEmail: process.env.NEXT_PUBLIC_SECURITY_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "security@example.com",
    abuseEmail: process.env.NEXT_PUBLIC_ABUSE_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "abuse@example.com",
    copyrightEmail: process.env.NEXT_PUBLIC_COPYRIGHT_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "copyright@example.com",
    moderationEmail: process.env.NEXT_PUBLIC_MODERATION_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "moderation@example.com",
  };
}

export type LegalPage = {
  slug: string;
  title: string;
  content: string;
  intro?: string;
  updated: string;
  previousUpdated?: string;
  sections: Array<{
    heading: string;
    body: string[];
    bullets?: string[];
    endline?: string[];
    links?: Array<{
      href: string;
      label: string;
    }>;
  }>;
};

// Get company info once for use in legal pages
const companyInfo = getCompanyInfo();

export const LEGAL_PAGES: Record<string, LegalPage> = {
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    intro: "How Crucible handles, secures, and retains your data.",
    content: `
# Privacy Policy

Last updated: December 30, 2025
    `.trim(),
    updated: "2025-12-30T00:00:00.000Z",
    previousUpdated: "2025-12-11T00:00:00.000Z",
    sections: [
      {
        heading: "Overview",
        body: [
          `Crucible ("we," "our," or "us") is an AI-powered decision support platform${companyInfo.legalCompanyName ? ` operated by ${companyInfo.legalCompanyName}${companyInfo.abn ? ` (${companyInfo.abn})` : ""}` : ""}. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our service. By using Crucible, you agree to the practices described in this policy. We are committed to protecting your privacy and handling your data with transparency and care.`,
          'We adhere to the Australian Privacy Principles contained in the Privacy Act 1988 (Cth) and, to the extent applicable to our users in the European Union, the EU General Data Protection Regulation (GDPR). We have designed this policy to meet the requirements of the strictest applicable privacy laws, which means compliance with GDPR standards covers users in Australia, the United States, and most other jurisdictions.',
          companyInfo.address 
            ? `You may contact us in writing at: ${companyInfo.legalCompanyName}${companyInfo.address ? `, ${companyInfo.address}` : ""}, or via email at ${companyInfo.privacyEmail} for further information about this Privacy Policy.`
            : `You may contact us via email at ${companyInfo.privacyEmail} for further information about this Privacy Policy.`,
        ],
      },
      {
        heading: "Information We Collect",
        body: [
          `We collect information necessary to provide and improve Crucible. This includes:`,
        ],
        bullets: [
          "Account information: name, email address, organization name, and authentication credentials.",
          "Session content: decision questions you submit, uploaded reference documents, and AI-generated outputs (Decision Briefs and Minutes).",
          "Usage data: product analytics, feature usage, and interaction patterns to improve the service.",
          "Support communications: messages, feedback, and support requests.",
          "Technical data: IP addresses, browser type, device information, and log data.",
        ],
      },
      {
        heading: "How We Use Your Information",
        body: [
          `We use your information based on the following legal bases: (1) Contractual Necessity: to provide the services you requested. (2) Legitimate Interests: to improve our security, analytics, and product performance. (3) Consent: for marketing communications or optional cookies. (4) Legal Obligation: to comply with tax and accounting laws. Specifically, we use data to:`,
        ],
        bullets: [
          "Deliver and operate Crucible, including processing your sessions and generating outputs.",
          "Authenticate your account and manage your workspace.",
          "Provide customer support and respond to inquiries.",
          "Improve our service through aggregated, anonymized analytics.",
          "Comply with legal obligations and enforce our terms.",
        ],
        endline: [
          "We do not sell, rent, or trade your personal information to third parties for marketing or any other purposes.",
        ],
      },
      {
        heading: "AI & Model Providers - No Training Policy",
        body: [
          `Crucible uses third-party AI/LLM providers (e.g., OpenAI, Anthropic, Google) as data processors to generate session outputs. These providers have publicly committed in their own terms of service and privacy policies that they do not use API data to train their models. Specifically:`,
        ],
        bullets: [
          "OpenAI: Commits in its API terms that data submitted via API is not used to train models.",
          "Anthropic: States in its terms that API data is not used for training purposes.",
          "Google (Gemini): Commits that API data is not used to train models.",
          "Most providers we use have similar commitments in their terms and conditions.",
        ],
        endline: [
          `We do not use your session content, inputs, or outputs to train our own models or any third-party models. Your data is used exclusively for inference (generating responses) during active sessions. However, please note that these no-training commitments are based on the providers' own terms and conditions, not separate contractual agreements between ${companyInfo.companyName} and the providers.`,
        ],
      },
      {
        heading: "Special Notice: DeepSeek Subprocessor - Data Residency",
        body: [
          "IMPORTANT: Crucible offers DeepSeek as an optional AI model provider for specialized reasoning tasks. DeepSeek operates infrastructure in China, which may involve data processing in jurisdictions with different data protection laws than your own.",
        ],
        bullets: [
          "Data Location: DeepSeek processes data through APIs that may route through China-based infrastructure, even when accessed from the United States. This means your session data may be subject to Chinese data protection laws (including PIPL).",
          "Consent Required: By using DeepSeek-enabled features, you acknowledge and consent to your data being processed in China. If you do not consent to data processing in China, please avoid using DeepSeek or contact us to disable it for your account.",
          `If you have strict data residency requirements, you can request that DeepSeek be disabled for your workspace. Contact ${companyInfo.securityEmail} to configure model restrictions.`,
          "Alternative Models: You may select alternative AI providers (OpenAI, Anthropic, Google) that process data exclusively in the United States or other jurisdictions with adequacy decisions under GDPR.",
        ],
        endline: [
          `DeepSeek is clearly marked in our interface with data residency warnings. For questions about data residency or to disable DeepSeek, contact ${companyInfo.privacyEmail}.`,
        ],
      },
      {
        heading: "Cookies & Analytics",
        body: [
          `We use cookies and similar technologies to:`,
        ],
        bullets: [
          "Maintain your session and authentication state.",
          "Analyze product usage through analytics tools (e.g., Google Analytics) to improve functionality and user experience.",
          "Support essential service features.",
        ],
        endline: [
          "You can control cookies through your browser settings. We do not use cookies for advertising or cross-site tracking.",
        ],
      },
      {
        heading: "Data Sharing & Subprocessors",
        body: [
          `We share your data only with trusted service providers who act as data processors under our instructions:`,
        ],
        bullets: [
          "Cloud hosting and infrastructure (e.g., AWS) for secure data storage and processing.",
          "AI/LLM providers for session processing (subject to our no-training policy).",
          "Analytics tools for product improvement.",
          "Customer support and communication tools.",
        ],
        endline: [
          "All subprocessors are contractually bound to protect your data and use it only for specified purposes. A full subprocessors list is available on request. We do not sell your data.",
        ],
      },
      {
        heading: "International Data Transfers",
        body: [
          "Your data may be processed and stored in Australia, the United States, and other countries where our service providers operate. When we transfer personal data outside the European Economic Area (EEA), United Kingdom, or Australia, we ensure appropriate safeguards are in place as required by the GDPR and Australian Privacy Principles, including:",
        ],
        bullets: [
          "Standard Contractual Clauses (SCCs): We use the European Commission's Standard Contractual Clauses to provide legal protection for data transfers from the EU/EEA to countries without an adequacy decision.",
          "Processor agreements: All data processors are contractually bound to comply with applicable data protection laws and maintain appropriate security measures.",
          "Adequacy decisions: Where the European Commission or relevant authority has determined a country provides adequate data protection, transfers may occur under that adequacy framework.",
          "Binding Corporate Rules: Where applicable, binding corporate rules may be used for intra-group transfers.",
        ],
        endline: [
          `By using Crucible, you consent to such international data transfers. A copy of the relevant Standard Contractual Clauses is available upon request by contacting ${companyInfo.privacyEmail}.`,
        ],
      },
      {
        heading: "Data Security",
        body: [
          `We implement industry-standard security measures to protect your data:`,
        ],
        bullets: [
          "Encryption in transit using TLS 1.2+ for all data transmission.",
          "Encryption at rest using AES-256 for stored data.",
          "Access controls: user authentication is handled through OAuth, and all access to user resources requires verification. Production system access is restricted using role-based permissions and access controls.",
          "Audit logging: all access to production systems is logged and monitored.",
          "Security assessments: regular security reviews and automated vulnerability scanning.",
        ],
        endline: [
          "While no system is 100% secure, we continuously work to maintain and improve our security posture.",
        ],
      },
      {
        heading: "Data Retention & Deletion",
        body: [
          `We retain your data only as long as necessary to provide the service and comply with legal obligations:`,
        ],
        bullets: [
          "Session history: session history is retained according to your configured retention settings.",
          "Account data: retained while your account is active and for a reasonable period after closure for legal and business purposes.",
          "Backups: deleted data may remain in backups for up to 30 days before permanent erasure.",
        ],
        endline: [
          `You may request deletion of individual sessions or your full account at any time by contacting support or ${companyInfo.privacyEmail}. We will honor deletion requests within 30 days, subject to legal retention requirements.`,
        ],
      },
      {
        heading: "Your Rights & Choices",
        body: [
          "Depending on your location, you may have the following rights regarding your personal data:",
        ],
        bullets: [
          "Access: request a copy of the personal data we hold about you.",
          "Correction: update or correct inaccurate information.",
          "Deletion: request deletion of your data (subject to legal requirements).",
          "Portability: receive your data in a structured, machine-readable format.",
          "Objection: object to certain processing activities.",
          "Restriction: request restriction of processing in certain circumstances.",
          "Withdraw consent: where processing is based on consent.",
          "Opt-out: disable analytics if desired.",
        ],
        endline: [
          `To exercise these rights, contact ${companyInfo.privacyEmail}. We respond to requests within 30 days (or as required by applicable law).`,
        ],
      },
      {
        heading: "California Privacy Rights (CCPA/CPRA)",
        body: [
          "If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):",
        ],
        bullets: [
          "Right to Know: You have the right to request information about the categories and specific pieces of personal information we collect, use, disclose, and sell (if applicable).",
          "Right to Delete: You have the right to request deletion of your personal information, subject to certain exceptions.",
          "Right to Correct: You have the right to request correction of inaccurate personal information.",
          "Right to Opt-Out of Sale/Sharing: We do not sell your personal information. We do not share your personal information for cross-context behavioral advertising.",
          "Right to Non-Discrimination: We will not discriminate against you for exercising your privacy rights.",
          "Right to Limit Use of Sensitive Personal Information: You have the right to limit our use of sensitive personal information (such as precise geolocation, racial/ethnic origin, etc.) to that which is necessary to provide the service.",
          "Authorized Agent: You may designate an authorized agent to make requests on your behalf. We will require proof of authorization and may verify your identity directly.",
        ],
        endline: [
          `To exercise your California privacy rights, contact ${companyInfo.privacyEmail} or use our data request form. We will verify your identity before processing your request.`,
        ],
      },
      {
        heading: "Children's Privacy",
        body: [
          `Crucible is not intended for individuals under the age of 18 (or the age of majority in your jurisdiction). We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us immediately at ${companyInfo.privacyEmail}, and we will take steps to delete such information.`,
        ],
      },
      {
        heading: "Changes to This Policy",
        body: [
          "We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:",
        ],
        bullets: [
          "Posting the updated policy on this page with a revised 'Last updated' date.",
          "Displaying a notice within the service when appropriate.",
          "Displaying a notice within the service when appropriate.",
        ],
        endline: [
          "Your continued use of Crucible after changes become effective constitutes acceptance of the updated policy. We encourage you to review this policy periodically.",
        ],
      },
      {
        heading: "Contact & Data Requests",
        body: [
          "For privacy questions, data requests, or concerns about how we handle your information, contact us at:",
        ],
        endline: [
          `Email: ${companyInfo.privacyEmail}. We respond to privacy inquiries and data subject requests within 7-30 business days, depending on the nature of the request and applicable legal requirements. For general inquiries, contact ${companyInfo.contactEmail}. If you are located in the European Economic Area (EEA) or United Kingdom and have concerns about our data practices, you also have the right to lodge a complaint with your local data protection authority.`,
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Terms of Service",
    intro: `By using Crucible you agree to the following conditions. These terms are a binding agreement between you and ${companyInfo.legalCompanyName}${companyInfo.abn ? ` (${companyInfo.abn})` : ""}${companyInfo.address ? `, located at ${companyInfo.address}` : ""}.`,
    content: `
# Terms of Service

Last updated: December 30, 2025
    `.trim(),
    updated: "2025-12-30T00:00:00.000Z",
    previousUpdated: "2025-12-11T00:00:00.000Z",
    sections: [
      {
        heading: "1. Acceptance, Use of Service & Account Responsibilities",
        body: [
          "By accessing or using Crucible, you accept and agree to be bound by these Terms of Service. If you are using Crucible on behalf of an organization, you represent that you have the authority to bind that organization to these terms.",
        ],
        bullets: [
          "Service Description: Crucible provides AI-mediated advisory sessions and generates Decision Briefs and Meeting Minutes. These outputs are guidance and do not constitute legal, financial, or investment advice. You remain solely responsible for all decisions you act upon.",
          "Account Responsibilities: You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate information and ensure uploaded documents are authorized for sharing.",
          "Prohibited Uses: You agree not to (a) use the service for any illegal or unauthorized purpose; (b) attempt to reverse engineer, decompile, or extract models or training data; (c) use outputs to train competing AI models; (d) resell or redistribute access without our express written consent; (e) abuse, interfere with, or disrupt the service; (f) upload unauthorized, illegal, or harmful content.",
          "Acceptable Use: You must comply with our Acceptable Use Policy, available at /legal/acceptable-use. Violation of these terms may result in immediate suspension or termination of your account.",
        ],
      },
      {
        heading: "2. AI-Generated Outputs & No Reliance",
        body: [
          "IMPORTANT DISCLAIMER REGARDING ARTIFICIAL INTELLIGENCE:",
        ],
        bullets: [
          "AI-Powered Service: Crucible provides outputs generated by Artificial Intelligence (AI) and Large Language Models (LLMs). These AI systems, while sophisticated, have inherent limitations and may produce outputs that are inaccurate, incomplete, outdated, or unsuitable for your specific circumstances.",
          "No Guarantee of Accuracy: THE COMPANY DOES NOT GUARANTEE THE ACCURACY, COMPLETENESS, RELIABILITY, CURRENTNESS, OR FITNESS FOR ANY PARTICULAR PURPOSE OF ANY AI-GENERATED OUTPUTS. AI outputs may contain errors, omissions, hallucinations (plausible-sounding but incorrect information), or outdated information.",
          "Customer Verification Required: You must independently verify all AI-generated outputs before making any business, legal, financial, professional, or personal decisions. You should not rely solely on AI outputs for any important decision without conducting your own due diligence and, where appropriate, consulting with qualified professionals.",
          "Not Professional Advice: The Services do not constitute and are not a substitute for professional advice from qualified lawyers, accountants, financial advisors, medical professionals, or other experts. The Company does not purport to provide any legal, taxation, accountancy, medical, or other professional advice through the Services.",
          "Assumption of Risk: You acknowledge and accept that you assume all risk associated with your use of AI-generated outputs. The Company shall not be liable for any decisions made, actions taken, or consequences arising from your reliance on AI-generated outputs.",
          "Third-Party AI Providers: AI outputs are generated using third-party AI model providers (including but not limited to OpenAI, Anthropic, Google, and DeepSeek). The Company does not control these providers and makes no warranties regarding their outputs, availability, or performance.",
        ],
      },
      {
        heading: "3. Intellectual Property Rights & User Content",
        body: [
          "Intellectual Property Ownership:",
        ],
        bullets: [
          "Your Content: You retain all rights, title, and interest in the data, inputs, and documents you submit to Crucible ('User Content'). You grant us a limited, non-exclusive, worldwide license to process, store, and use your User Content solely to provide the service to you and as necessary to operate and improve Crucible.",
          `Our IP: ${companyInfo.companyName} owns all rights, title, and interest in the Crucible platform, including its software, algorithms, interfaces, and the 'Crucible' brand. Nothing in these terms grants you any rights to our intellectual property except the limited right to use the service as described herein.`,
          "AI-Generated Outputs: The AI-generated outputs (Decision Briefs and Minutes) are assigned to you upon generation, subject to your compliance with these terms. You may use these outputs for your internal business purposes, but you may not use them to train, fine-tune, or improve any other artificial intelligence models or competing services.",
          "Feedback: Any feedback, suggestions, or ideas you provide about Crucible may be used by us without obligation or compensation to you.",
          `Publicity Rights: By creating and publishing an agent on the Marketplace, you grant ${companyInfo.companyName} a perpetual, non-exclusive, worldwide license to use your name, likeness, agent persona, and associated content (including agent name, role, and summary) in marketing materials, case studies, promotional content, website features, and other business communications. You may opt out of such usage by contacting us at ${companyInfo.contactEmail}. This license does not grant us ownership of your agent or your personal information.`,
        ],
      },
      {
        heading: "4. Service Availability",
        body: [
          "Crucible Community Edition is provided free of charge. The service is provided 'as is' without warranties of any kind.",
        ],
      },
      {
        heading: "5. Confidentiality, Limitation of Liability & Indemnification",
        body: [
          "Confidentiality:",
        ],
        bullets: [
          "We treat all session data and User Content as confidential. We will not disclose your Confidential Information to third parties except (a) as required to provide the service (e.g., to AI subprocessors under our no-training policy); (b) as required by law or legal process; (c) to investigate misuse or violations of these terms; or (d) with your explicit consent.",
          "Limitation of Liability: TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CRUCIBLE AND ROUNDTABLE LABS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUES, DATA, OR USE, ARISING OUT OF OR RELATED TO THESE TERMS OR YOUR USE OF THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, NEGLIGENCE, OR OTHERWISE).",
          "Total Liability Cap: Our total liability for any claims arising under these terms, regardless of the form of action, shall not exceed $100.",
          "Exclusive Remedy: Your sole and exclusive remedy for any breach of warranty, breach of contract, or other claim arising from these terms or your use of the service shall be limited to our reasonable efforts to correct or remedy the non-conforming service. In no event shall we be liable for any other damages, including but not limited to loss of data, loss of profits, or any indirect, consequential, or special damages.",
          "Warranty Disclaimer: THE SERVICE IS PROVIDED 'AS IS' AND 'AS AVAILABLE' WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY. We do not warrant that the service will be uninterrupted, error-free, or secure.",
          "AI Output Disclaimer: THE COMPANY MAKES NO REPRESENTATIONS, WARRANTIES, OR GUARANTEES THAT ANY CONTENT PRODUCED BY OR VIA THE SERVICES IS ACCURATE, COMPLETE, RELIABLE, CURRENT, ERROR-FREE, OR SUITABLE FOR ANY PARTICULAR PURPOSE. The Company does not purport to provide any legal, taxation, accountancy, financial, medical, or other professional advice by providing the Services. You acknowledge that AI-generated outputs may contain errors, hallucinations, or outdated information, and you assume all risk for decisions made based on such outputs.",
          "Customer Responsibility: You acknowledge and accept that it is your sole responsibility to ensure that: (a) the facilities and functions of the Services meet your requirements; (b) the Services are appropriate for your specific circumstances and are within the laws and regulations of your jurisdiction; and (c) you have obtained any necessary professional advice or approvals before making decisions based on AI-generated outputs. The Company does not warrant that the Services will be suitable for your particular use case or comply with all laws applicable to your jurisdiction.",
          `Indemnification: You agree to indemnify, defend, and hold harmless ${companyInfo.companyName}, its officers, directors, employees, and agents from any claims, damages, liabilities, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to (a) your use of the service; (b) your violation of these terms; (c) your violation of any rights of a third party; or (d) your User Content.`,
        ],
      },
      {
        heading: "6. Termination, Dispute Resolution & General Terms",
        body: [
          "Termination:",
        ],
        bullets: [
          `Termination by You: You may terminate your account at any time via the settings page or by contacting support at ${companyInfo.supportEmail}. Upon termination, your right to access the service will immediately cease.`,
          "Termination by Us: We reserve the right to suspend or terminate your account immediately, without notice, if you violate these terms, abuse the service, engage in fraudulent activity, or if required by law. We may also suspend or terminate accounts that are inactive for extended periods.",
          "Effect of Termination: Upon termination, all licenses granted to you will immediately cease. Provisions regarding intellectual property, confidentiality, limitation of liability, indemnification, and dispute resolution will survive termination.",
          "Force Majeure: We shall not be liable for any failure to perform our obligations where such failure results from any cause beyond our reasonable control, including, without limitation, mechanical, electronic or communications failure or degradation.",
          "Export Control: You warrant that you are not located in, under the control of, or a national or resident of any country subject to United States embargo, or on the U.S. Treasury Department's list of Specially Designated Nationals.",
          `Publicity: You agree that we may use your name and logo in our marketing materials and on our website to identify you as a customer, provided that you may opt out of such usage by contacting us at ${companyInfo.contactEmail}.`,
          "Service Modifications: We reserve the right to modify, suspend, or discontinue the service (or any part thereof) at any time, with or without notice. We may also impose limits on certain features or restrict access to parts or all of the service without notice or liability. We will use reasonable efforts to provide advance notice of material changes that may adversely affect your use of the service.",
          "Assignment: You may not assign, transfer, or sublicense these terms or any rights or obligations hereunder without our prior written consent. Any attempted assignment in violation of this provision shall be void. We may freely assign, transfer, or delegate these terms and our rights and obligations hereunder without restriction.",
          `No Agency: No agency, partnership, joint venture, or employment relationship is created as a result of these terms. You do not have any authority of any kind to bind ${companyInfo.companyName} in any respect whatsoever. In any action or proceeding to enforce rights under these terms, the prevailing party will be entitled to recover its reasonable costs and legal fees.`,
          "Governing Law: These terms are governed by the laws of the State of Victoria, Australia, without regard to its conflict of laws principles.",
          "Dispute Resolution: Any dispute arising from these terms or your use of the service shall first be subject to good faith negotiation between the parties for a period of fourteen (14) days. If the dispute is not resolved through negotiation, the parties agree to attempt mediation in Victoria, Australia before commencing any court proceedings. If mediation is unsuccessful within thirty (30) days, either party may commence proceedings in the courts of Victoria, Australia, which shall have exclusive jurisdiction. Either party may seek urgent injunctive relief in any court of competent jurisdiction.",
          "Changes to Terms: We may update these terms from time to time. Material changes will be communicated via email or in-app notification at least 30 days prior to taking effect. Your continued use of the service after changes become effective constitutes acceptance of the updated terms. If you do not agree to the changes, you must stop using the service and terminate your account.",
          "Severability: If any provision of these terms is found to be unenforceable or invalid under the laws of any jurisdiction (including the Customer's jurisdiction), that provision shall be limited or eliminated to the minimum extent necessary so that these terms will otherwise remain in full force, effect, and enforceable. The invalidity of any provision in one jurisdiction shall not affect the validity of that provision in any other jurisdiction.",
          `Entire Agreement: These terms, together with our Privacy Policy and Acceptable Use Policy, constitute the entire agreement between you and ${companyInfo.companyName} regarding the use of Crucible and supersede all prior agreements and understandings.`,
          `Contact: For questions about these Terms, contact ${companyInfo.legalCompanyName}${companyInfo.abn ? ` (${companyInfo.abn})` : ""} at ${companyInfo.contactEmail}${companyInfo.address ? `, via the contact page at /contact, or by mail at ${companyInfo.address}` : " or via the contact page at /contact"}.`,
        ],
      },
    ],
  },
  cookies: {
    slug: "cookies",
    title: "Cookie Policy",
    intro: "How Crucible uses cookies and similar technologies.",
    content: `
# Cookie Policy

Last updated: December 11, 2025
    `.trim(),
    updated: "2025-12-11T00:00:00.000Z",
    sections: [
      {
        heading: "What Are Cookies?",
        body: [
          "Cookies are small text files that are stored on your device when you visit a website. They are widely used to make websites work more efficiently, as well as to provide information to the owners of the site. We use cookies to distinguish you from other users, which helps us provide you with a good experience and allows us to improve our site.",
        ],
      },
      {
        heading: "How We Use Cookies",
        body: [
          "We use cookies for the following purposes:",
        ],
        bullets: [
          "Essential Cookies: Required for the operation of Crucible. They include cookies that enable you to log into secure areas and maintain your session.",
          "Analytical/Performance Cookies: Allow us to recognize and count the number of visitors and see how visitors move around our site. This helps us improve the way our website works.",
          "Functionality Cookies: Used to recognize you when you return to our website. This enables us to personalize our content for you and remember your preferences.",
        ],
      },
      {
        heading: "Third-Party Cookies",
        body: [
          "We may use third-party analytics services (such as Google Analytics) that set their own cookies. These third parties may collect information about your online activities over time and across different websites. We do not control these cookies and recommend reviewing the privacy policies of these third-party providers.",
        ],
      },
      {
        heading: "Managing Cookies",
        body: [
          "Most web browsers allow some control of most cookies through the browser settings. To find out more about cookies, including how to see what cookies have been set and how to manage and delete them, visit www.allaboutcookies.org. Please note that if you disable essential cookies, some parts of our website may not function properly.",
        ],
      },
      {
        heading: "Changes to This Policy",
        body: [
          "We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated revision date.",
        ],
      },
      {
        heading: "Contact Us",
        body: [
          `If you have any questions about our use of cookies, please contact us at ${companyInfo.privacyEmail}.`,
        ],
      },
    ],
  },
  subprocessors: {
    slug: "subprocessors",
    title: "Subprocessor List",
    intro: "Third-party service providers that process data for Crucible.",
    content: `
# Subprocessor List

Last updated: December 11, 2025
    `.trim(),
    updated: "2025-12-11T00:00:00.000Z",
    sections: [
      {
        heading: "Overview",
        body: [
          `To support the delivery of our services, ${companyInfo.companyName} engages third-party service providers ('Subprocessors') to process customer data. This page provides a current list of these Subprocessors. We conduct due diligence on the security and privacy practices of our Subprocessors to ensure they provide a level of security and privacy appropriate to the risks.`,
        ],
      },
      {
        heading: "Infrastructure & Hosting",
        body: [
          "The following providers host and store our application infrastructure and customer data:",
        ],
        bullets: [
          "Frontend hosting - Self-hosted or cloud provider hosting for the Crucible web application.",
          "Cloudflare - DNS and content delivery network (CDN) services. Location: United States (with global edge locations).",
          "Railway - Backend hosting for API services and Celery workers. Location: Singapore.",
          "Supabase - PostgreSQL database hosting (primary data storage). Location: United States.",
          "Upstash - Redis database for ephemeral data and caching. Location: United States.",
          "Amazon Web Services (AWS) - S3-compatible object storage for artifacts (Decision Briefs, Meeting Minutes). Location: United States.",
        ],
      },
      {
        heading: "AI & Model Providers",
        body: [
          "These providers process session data to generate AI outputs. All are contractually bound to our no-training policy:",
        ],
        bullets: [
          "OpenAI - Large Language Model (LLM) inference for session outputs. Location: United States.",
          "Anthropic - Large Language Model (LLM) inference for session outputs. Location: United States.",
          "Google (Gemini) - Large Language Model (LLM) inference for session outputs. Location: United States.",
          "DeepSeek - Large Language Model (LLM) inference for specialized reasoning tasks. Location: China / United States (API served). WARNING: DeepSeek may process data in China, subject to Chinese data protection laws (PIPL). DeepSeek is optional and can be disabled upon request. See our Privacy Policy for details and opt-out options.",
        ],
      },
      {
        heading: "Analytics & Monitoring",
        body: [
          "Google Analytics - Product analytics to improve user experience. Location: United States.",
          "Sentry - Error tracking and performance monitoring. Location: United States.",
        ],
      },
      {
        heading: "Updates to This List",
        body: [
          "We will update this list when we add or remove Subprocessors. A full subprocessors list with detailed information is available upon request.",
        ],
      },
    ],
  },
  "acceptable-use": {
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    intro: "Rules for the safe and responsible use of Crucible.",
    content: `
# Acceptable Use Policy

Last updated: December 30, 2025
    `.trim(),
    updated: "2025-12-30T00:00:00.000Z",
    previousUpdated: "2025-12-11T00:00:00.000Z",
    sections: [
      {
        heading: "Overview",
        body: [
          "This Acceptable Use Policy (AUP) sets out the prohibited uses of the Crucible platform. By using our service, you agree to comply with this policy. Violation of this policy may result in the suspension or termination of your account.",
        ],
      },
      {
        heading: "Prohibited Actions",
        body: [
          "You agree not to misuse the Crucible service. Specifically, you shall not:",
        ],
        bullets: [
          "Reverse Engineering: Attempt to reverse engineer, decompile, disassemble, or derive the source code or underlying models of the service.",
          "Model Extraction: Use the service to extract parameters, weights, or training data from our AI models or those of our providers.",
          "Competitive Training: Use outputs from the service to train, fine-tune, or improve any other artificial intelligence models or competing services.",
          "Unauthorized Resale: Resell, sublicense, or redistribute access to the service without our express written consent.",
          "Automated Abuse: Use bots, scrapers, or other automated means to access the service in a way that exceeds reasonable usage limits or disrupts the service.",
        ],
      },
      {
        heading: "AI-Specific Prohibited Activities",
        body: [
          "Given the AI-powered nature of Crucible, the following activities are strictly prohibited:",
        ],
        bullets: [
          "Prompt Injection: Attempting to manipulate AI outputs through prompt injection, jailbreaking, adversarial prompts, or any technique designed to override, bypass, or circumvent the system's intended behavior or safety mechanisms.",
          "System Manipulation: Attempting to override, bypass, or manipulate the debate system's safety mechanisms, guardrails, content moderation, or quality gates.",
          "Output Gaming: Attempting to manipulate the debate process to produce biased, inaccurate, or predetermined outputs, or to circumvent the structured deliberation process.",
          "Adversarial Inputs: Submitting inputs specifically designed to cause the AI to produce harmful, illegal, misleading, or unintended outputs.",
          "Data Poisoning: Attempting to corrupt or manipulate calibration metrics, Knight ratings, or any system learning mechanisms through fraudulent feedback or coordinated manipulation.",
          "Encoding Attacks: Attempting to use encoding schemes (base64, hex, unicode, etc.) or special characters to bypass content filters or inject malicious instructions.",
        ],
      },
      {
        heading: "Illegal & Harmful Content",
        body: [
          "You may not use Crucible to generate, upload, or share content that:",
        ],
        bullets: [
          "Is illegal, fraudulent, defamatory, libelous, threatening, or harassing.",
          "Infringes upon the intellectual property, privacy, or publicity rights of others.",
          "Promotes hate speech, violence, discrimination, or illegal acts.",
          "Contains malware, viruses, or other malicious code.",
          "Is sexually explicit or pornographic.",
          "Is designed to generate AI outputs that could cause physical, financial, legal, or reputational harm to any person or entity.",
          "Is intended to produce discriminatory, biased, or unfair recommendations that could disadvantage individuals or groups.",
          "Attempts to generate advice for illegal activities, regulatory violations, or circumvention of legal obligations.",
          "Is designed to manipulate or deceive others, including generating misinformation, disinformation, or fraudulent content.",
          "Involves personal information of third parties without their consent, or attempts to generate outputs that reveal private information.",
        ],
      },
      {
        heading: "Restrictions on High-Stakes Decisions",
        body: [
          "Crucible is designed to support decision-making, not replace professional judgment. The following restrictions apply to high-stakes use cases:",
        ],
        bullets: [
          "Medical/Health Decisions: You may not use the service to generate medical diagnoses, treatment recommendations, or health advice that should be provided by licensed medical professionals. AI outputs related to health matters must not be used as a substitute for professional medical advice.",
          "Legal Advice: You may not use the service to generate legal advice, contract interpretation, litigation strategy, or regulatory guidance that should be provided by licensed attorneys. AI outputs do not constitute legal advice.",
          "Financial/Investment Decisions: You may not use the service to generate investment advice, securities recommendations, tax advice, or financial planning that should be provided by licensed financial advisors. AI outputs do not constitute financial advice.",
          "Employment Decisions: You may not use the service to make employment, termination, promotion, or disciplinary decisions without appropriate human review and compliance with applicable employment laws and anti-discrimination regulations.",
          "Regulatory Compliance: You may not rely solely on AI outputs for regulatory compliance, audit responses, or legal filings without appropriate review by qualified professionals.",
          "Life-Safety Decisions: You may not use the service for decisions that could directly impact life safety, critical infrastructure, emergency response, or public safety without appropriate human oversight and professional review.",
        ],
        endline: [
          "By using the service, you acknowledge that AI outputs are not a substitute for professional judgment and that you are solely responsible for verifying all outputs before making critical decisions. See Section 2 of our Terms of Service for important disclaimers regarding AI-generated outputs.",
        ],
      },
      {
        heading: "Security & Integrity",
        body: [
          "You must not:",
        ],
        bullets: [
          "Attempt to bypass or circumvent any security measures, access controls, content moderation, safety filters, or quality gates.",
          "Interfere with or disrupt the integrity or performance of the service, including the debate system, AI inference, or output generation.",
          "Perform penetration testing or vulnerability scanning without our prior written permission.",
          "Share your account credentials with unauthorized third parties.",
          "Attempt to inject malicious code, scripts, or instructions into prompts, uploaded documents, or any input fields.",
          "Attempt to exploit vulnerabilities in the debate system, prompt templates, Knight configurations, or output generation mechanisms.",
          "Attempt to access, view, or manipulate other users' sessions, data, outputs, or account information.",
          "Attempt to intercept, monitor, or capture data transmitted between users and our service.",
        ],
      },
      {
        heading: "Rate Limiting & Abuse Prevention",
        body: [
          "To ensure fair and reliable service for all users, we implement rate limiting on certain operations. Rate limits are applied per user account (for authenticated users) or per IP address (for guest users) to prevent abuse and ensure system stability.",
        ],
        bullets: [
          "You agree not to exceed reasonable usage limits or engage in patterns that suggest automated abuse, scraping, or systematic exploitation of the service.",
          "We reserve the right to adjust rate limits, implement additional usage caps, or apply access restrictions to prevent abuse and ensure fair service availability for all users.",
          "Excessive, suspicious, or anomalous usage patterns may result in temporary or permanent access restrictions, with or without notice.",
          "You may not use the service in a manner that degrades performance or availability for other users.",
          "Coordinated or bulk activities designed to manipulate ratings, reviews, Knight calibration, or other system metrics are strictly prohibited.",
          "Creating multiple accounts to circumvent usage limits, access restrictions, or enforcement actions is prohibited.",
        ],
        endline: [
          `If you believe your rate limits are too restrictive for legitimate use, or if you have questions about rate limiting, please contact us at ${companyInfo.contactEmail}. We may adjust limits for legitimate business use cases on a case-by-case basis.`,
        ],
      },
      {
        heading: "Prohibited Use of AI Outputs",
        body: [
          "You are responsible for how you use AI-generated outputs from Crucible. The following uses of AI outputs are prohibited:",
        ],
        bullets: [
          "Using AI outputs in a manner that violates applicable laws, regulations, or third-party rights.",
          "Presenting AI outputs as your own original work, professional advice, or authoritative statements without appropriate disclaimers indicating they were AI-generated.",
          "Using AI outputs to make decisions that require professional licensure (medical, legal, financial, etc.) without appropriate human review by qualified professionals.",
          "Using AI outputs to discriminate against individuals or groups in violation of applicable anti-discrimination laws.",
          "Using AI outputs in a manner that could cause physical, financial, or reputational harm to yourself or others.",
          "Republishing or distributing AI outputs in a manner that misrepresents their source, accuracy, or reliability.",
          "Using AI outputs to create or spread misinformation, disinformation, or fraudulent content.",
          "Using AI outputs to harass, stalk, threaten, or intimidate any person.",
        ],
        endline: [
          "You acknowledge that you bear sole responsibility for your use of AI outputs and any decisions or actions taken based on them.",
        ],
      },
      {
        heading: "Enforcement",
        body: [
          "We reserve the right to investigate any violation of this policy. If we determine that you have violated this AUP, we may take action including:",
        ],
        bullets: [
          "Removing offending content.",
          "Suspending or restricting your access to the service.",
          "Terminating your account.",
          "Reporting illegal activities to law enforcement authorities.",
          `Pursuing legal remedies for violations that cause harm to ${companyInfo.companyName}, other users, or third parties.`,
        ],
        endline: [
          "Enforcement actions may be taken without prior notice in cases of serious violations, including but not limited to illegal activity, security threats, or content that poses immediate harm.",
        ],
      },
      {
        heading: "Reporting Violations",
        body: [
          `If you become aware of any violation of this policy, please report it to us immediately at ${companyInfo.abuseEmail}.`,
        ],
      },
    ],
  },
};

