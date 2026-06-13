"""Shared skill vocabulary used by resume parsing and job matching.

Centralising the vocabulary keeps extraction and matching consistent: a skill the
parser can find in a resume is also a skill the matcher can find in a job ad.
"""

from __future__ import annotations

import re

# Curated, IT / cybersecurity-leaning vocabulary. Each canonical skill maps to a
# list of aliases / surface forms that may appear in resumes or job ads.
TECHNICAL_SKILLS: dict[str, list[str]] = {
    "Windows Server": ["windows server", "windows admin", "active directory dc"],
    "Active Directory": ["active directory", "ad ds", "azure ad", "entra id"],
    "Microsoft 365": ["microsoft 365", "office 365", "o365", "m365", "exchange online"],
    "Azure": ["azure", "microsoft azure"],
    "AWS": ["aws", "amazon web services", "ec2", "s3"],
    "Linux": ["linux", "ubuntu", "centos", "rhel", "red hat"],
    "Networking": ["networking", "tcp/ip", "dns", "dhcp", "vlan", "routing", "switching"],
    "Firewalls": ["firewall", "fortinet", "palo alto", "checkpoint", "sophos"],
    "VMware": ["vmware", "vsphere", "esxi", "hyper-v"],
    "PowerShell": ["powershell"],
    "Python": ["python"],
    "Bash": ["bash", "shell scripting"],
    "SQL": ["sql", "mysql", "postgres", "mssql"],
    "SIEM": ["siem", "splunk", "sentinel", "qradar", "elastic siem"],
    "Incident Response": ["incident response", "ir", "soc", "threat hunting"],
    "Vulnerability Management": ["vulnerability", "nessus", "qualys", "tenable"],
    "Endpoint Security": ["edr", "crowdstrike", "defender", "sentinelone", "antivirus"],
    "ITIL": ["itil", "service management"],
    "Ticketing": ["servicenow", "jira service", "zendesk", "freshdesk", "ticketing"],
    "Backup & Recovery": ["backup", "veeam", "disaster recovery", "dr"],
    "Help Desk": ["help desk", "helpdesk", "service desk", "desktop support"],
    "Cloud Support": ["cloud support", "cloud engineer", "iaas", "saas"],
    "Identity & Access": ["iam", "identity", "sso", "mfa", "rbac"],
    "Scripting Automation": ["automation", "ci/cd", "ansible", "terraform"],
    "Virtualization": ["virtualization", "virtualisation"],
    "Hardware Support": ["hardware", "laptop", "desktop", "imaging", "deployment"],
}

SOFT_SKILLS: dict[str, list[str]] = {
    "Communication": ["communication", "stakeholder", "liaise"],
    "Teamwork": ["teamwork", "collaboration", "collaborative", "team player"],
    "Problem Solving": ["problem solving", "troubleshooting", "analytical"],
    "Customer Service": ["customer service", "customer focus", "client-facing"],
    "Time Management": ["time management", "prioritise", "prioritize", "deadline"],
    "Documentation": ["documentation", "knowledge base", "sop"],
    "Leadership": ["leadership", "mentoring", "led a team", "supervised"],
    "Attention to Detail": ["attention to detail", "detail-oriented", "thorough"],
}

CERT_PATTERNS = [
    r"comptia\s+(a\+|network\+|security\+|cysa\+|pentest\+)",
    r"\b(ccna|ccnp|ccie)\b",
    r"\baz-\d{3}\b",
    r"\bsc-\d{3}\b",
    r"\bms-\d{3}\b",
    r"\baws certified[\w\s]+",
    r"\b(cissp|cism|cisa|ceh|oscp|security\+|gsec|gcih)\b",
    r"itil\s*(v?\d|foundation)?",
    r"microsoft certified[\w\s:]+",
]


def _find(vocab: dict[str, list[str]], text: str) -> list[str]:
    low = text.lower()
    found = []
    for canonical, aliases in vocab.items():
        for alias in aliases:
            if alias in low:
                found.append(canonical)
                break
    return found


def find_technical_skills(text: str) -> list[str]:
    return _find(TECHNICAL_SKILLS, text)


def find_soft_skills(text: str) -> list[str]:
    return _find(SOFT_SKILLS, text)


def find_certifications(text: str) -> list[str]:
    low = text.lower()
    found = []
    for pat in CERT_PATTERNS:
        for m in re.finditer(pat, low):
            found.append(m.group(0).strip().upper())
    # de-dupe preserving order
    return list(dict.fromkeys(found))
