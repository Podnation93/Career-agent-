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


# ── Pluggable taxonomy ───────────────────────────────────────────────────────
# find_* read the *active* vocabulary, which starts as the built-in IT/cyber
# defaults but can be extended or replaced via config (``skills:`` in
# config.yaml) so the agent generalises to other industries. JobAgent loads the
# configured taxonomy at startup; pure callers fall back to the defaults.

def _copy(vocab: dict[str, list[str]]) -> dict[str, list[str]]:
    return {k: list(v) for k, v in vocab.items()}


_active_technical: dict[str, list[str]] = _copy(TECHNICAL_SKILLS)
_active_soft: dict[str, list[str]] = _copy(SOFT_SKILLS)


def _merge(base: dict[str, list[str]], extra: dict) -> dict[str, list[str]]:
    """Merge a config mapping (canonical -> aliases) into a vocabulary."""
    for canonical, aliases in (extra or {}).items():
        aliases = aliases or []
        # Always let the canonical name itself match, case-insensitively.
        merged = [canonical.lower()] + [str(a).lower() for a in aliases]
        base[canonical] = list(dict.fromkeys(base.get(canonical, []) + merged))
    return base


def load_taxonomy(cfg=None, *, technical=None, soft=None, mode=None) -> None:
    """Rebuild the active skill vocabulary from defaults + config.

    ``mode`` ``extend`` (default) augments the built-in vocabulary; ``replace``
    starts from an empty vocabulary so a different industry can be defined from
    scratch. Always rebuilds from defaults, so it is safe to call repeatedly.
    """
    global _active_technical, _active_soft
    cfg_tech = (cfg.get("skills.technical") if cfg else None) or technical or {}
    cfg_soft = (cfg.get("skills.soft") if cfg else None) or soft or {}
    resolved_mode = (mode or (cfg.get("skills.mode") if cfg else None) or "extend").lower()

    base_t = {} if resolved_mode == "replace" else _copy(TECHNICAL_SKILLS)
    base_s = {} if resolved_mode == "replace" else _copy(SOFT_SKILLS)
    _active_technical = _merge(base_t, cfg_tech)
    _active_soft = _merge(base_s, cfg_soft)


def reset_taxonomy() -> None:
    """Restore the built-in default vocabulary."""
    load_taxonomy(None)


def find_technical_skills(text: str) -> list[str]:
    return _find(_active_technical, text)


def find_soft_skills(text: str) -> list[str]:
    return _find(_active_soft, text)


def find_certifications(text: str) -> list[str]:
    low = text.lower()
    found = []
    for pat in CERT_PATTERNS:
        for m in re.finditer(pat, low):
            found.append(m.group(0).strip().upper())
    # de-dupe preserving order
    return list(dict.fromkeys(found))
