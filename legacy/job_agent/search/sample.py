"""Sample job source.

Ships realistic example postings around Western Melbourne, the CBD and Richmond
so the full pipeline (filter → match → tailor → track → report) runs end-to-end
with zero setup or network access. Replace with a real adapter for live data.
"""

from __future__ import annotations

from ..models import Job

_SAMPLE_JOBS = [
    Job(
        source="sample", external_id="s-1001",
        title="IT Support Officer", company="Westgate Logistics",
        location="Sunshine, VIC", salary="$65,000 - $75,000",
        url="https://example.com/jobs/1001", posted="2026-06-12",
        description=(
            "Provide level 1/2 desktop support across Windows 10/11 and Microsoft "
            "365. Manage tickets in ServiceNow, image laptops, support Active "
            "Directory accounts and assist with hardware deployment. ITIL "
            "awareness and strong customer service essential."
        ),
    ),
    Job(
        source="sample", external_id="s-1002",
        title="Service Desk Analyst", company="Yarra Health Services",
        location="Richmond, VIC", salary="$70,000",
        url="https://example.com/jobs/1002", posted="2026-06-12",
        description=(
            "First point of contact for IT issues. Troubleshoot M365, Active "
            "Directory password resets, VPN and networking faults. Document "
            "solutions in the knowledge base. Help desk experience and excellent "
            "communication required. Hybrid: 3 days in office."
        ),
        hybrid=True,
    ),
    Job(
        source="sample", external_id="s-1003",
        title="Cybersecurity Analyst (SOC)", company="SecureCloud AU",
        location="Melbourne CBD, VIC", salary="$95,000 - $110,000",
        url="https://example.com/jobs/1003", posted="2026-06-11",
        description=(
            "Join our SOC monitoring alerts in Microsoft Sentinel (SIEM). Perform "
            "incident response, threat hunting and vulnerability management with "
            "Tenable. CrowdStrike EDR experience and Security+ or AZ-500 highly "
            "regarded. Python scripting for automation a plus."
        ),
    ),
    Job(
        source="sample", external_id="s-1004",
        title="Systems Administrator", company="PortWest Manufacturing",
        location="Truganina, VIC", salary="$90,000",
        url="https://example.com/jobs/1004", posted="2026-06-10",
        description=(
            "Administer Windows Server, Active Directory, VMware vSphere and Veeam "
            "backups. Manage Azure tenancy and M365. PowerShell automation, "
            "networking (DNS/DHCP/VLAN) and firewall management (Fortinet). "
            "On-site role with occasional CBD travel."
        ),
    ),
    Job(
        source="sample", external_id="s-1005",
        title="Cloud Support Engineer", company="Skyline Digital",
        location="Remote (Australia)", salary="$100,000 - $120,000",
        url="https://example.com/jobs/1005", posted="2026-06-10",
        description=(
            "Support customers on AWS and Azure. Troubleshoot IaaS/SaaS issues, "
            "manage IAM, SSO and MFA. Linux and scripting (Bash/Python) essential. "
            "Terraform and CI/CD exposure desirable. Fully remote."
        ),
        remote=True,
    ),
    Job(
        source="sample", external_id="s-1006",
        title="Network Administrator", company="Geelong Freight Co",
        location="Geelong, VIC", salary="$85,000",
        url="https://example.com/jobs/1006", posted="2026-06-09",
        description=(
            "Manage enterprise networking, routing, switching, VLANs and firewalls "
            "(Palo Alto). CCNA required. On-site in Geelong, no remote option."
        ),
    ),
    Job(
        source="sample", external_id="s-1007",
        title="Desktop Support Technician", company="Docklands Media Group",
        location="Docklands, VIC", salary="$68,000",
        url="https://example.com/jobs/1007", posted="2026-06-13",
        description=(
            "Hands-on desktop support for a busy media office. Windows, M365, "
            "hardware imaging and deployment, AV support. Great customer service "
            "and teamwork. ServiceNow ticketing."
        ),
    ),
]


class SampleAdapter:
    name = "sample"

    def search(self, roles: list[str], limit: int) -> list[Job]:
        # Return copies so downstream scoring mutations don't taint the module
        # level constants.
        from copy import deepcopy

        return deepcopy(_SAMPLE_JOBS[:limit])
