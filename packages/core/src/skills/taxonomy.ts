/**
 * IT / cybersecurity skill taxonomy with aliases. Canonical name → aliases.
 * Used to extract skills from job text and match them against the profile.
 * Ported and expanded from the legacy Python skill vocabulary.
 */
export const SKILL_TAXONOMY: Record<string, string[]> = {
  "IT Support": ["it support", "desktop support", "technical support", "end user support", "support analyst"],
  "Service Desk": ["service desk", "servicedesk", "helpdesk", "help desk", "l1", "l2", "level 1", "level 2"],
  Ticketing: ["ticketing", "jira service management", "servicenow", "zendesk", "freshservice", "incident management"],
  "ERP Support": ["erp", "sap", "netsuite", "dynamics", "oracle erp", "erp support"],
  SQL: ["sql", "t-sql", "tsql", "mysql", "postgres", "postgresql", "ms sql", "sql server", "queries"],
  "Customer Support": ["customer support", "customer service", "customer-facing", "stakeholder"],
  Automation: ["automation", "powershell scripting", "python scripting", "scripting", "power automate"],
  Windows: ["windows", "windows 10", "windows 11", "windows server"],
  "Active Directory": ["active directory", "azure ad", "entra id", "ad", "group policy", "gpo"],
  Networking: ["networking", "tcp/ip", "dns", "dhcp", "vpn", "lan", "wan", "firewall"],
  "Microsoft 365": ["microsoft 365", "office 365", "o365", "m365", "exchange online", "intune"],
  Azure: ["azure", "microsoft azure"],
  AWS: ["aws", "amazon web services"],
  Linux: ["linux", "ubuntu", "rhel", "centos", "bash"],
  PowerShell: ["powershell", "ps1"],
  Python: ["python"],
  SIEM: ["siem", "splunk", "microsoft sentinel", "azure sentinel", "qradar", "elastic siem"],
  "Incident Response": ["incident response", "ir", "triage", "incident triage", "soc"],
  "Vulnerability Management": ["vulnerability", "nessus", "qualys", "patch management"],
  "Security Operations": ["security operations", "soc analyst", "blue team", "threat detection", "edr", "endpoint detection"],
  "Cyber Security": ["cyber security", "cybersecurity", "information security", "infosec", "security analyst"],
  Documentation: ["documentation", "runbook", "knowledge base", "kb articles", "sop"],
  ITIL: ["itil", "itil v4", "change management", "problem management"],
};

const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILL_TAXONOMY)) {
    m.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) m.set(a.toLowerCase(), canonical);
  }
  return m;
})();

/** Extract canonical skills mentioned in a block of text. */
export function extractSkills(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [alias, canonical] of ALIAS_TO_CANONICAL) {
    // word-ish boundary check to avoid matching "ad" inside "advanced"
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) found.add(canonical);
  }
  return [...found];
}

/** Map an arbitrary skill string to its canonical form (or itself). */
export function canonicalize(skill: string): string {
  return ALIAS_TO_CANONICAL.get(skill.toLowerCase()) ?? skill;
}

export interface SkillMatch {
  matched: string[];
  missing: string[];
}

/** Compare job-required skills against the profile's skills. */
export function matchSkills(profileSkills: string[], jobSkills: string[]): SkillMatch {
  const have = new Set(profileSkills.map((s) => canonicalize(s)));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const js of jobSkills) {
    const c = canonicalize(js);
    if (have.has(c)) matched.push(c);
    else missing.push(c);
  }
  return { matched: dedupe(matched), missing: dedupe(missing) };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
