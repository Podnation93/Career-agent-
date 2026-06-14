import { describe, expect, it } from "vitest";
import { parseJobAlertEmail, extractAnchors } from "../parsing/email.js";

const seekHtml = `
  <html><body>
    <a href="https://www.seek.com.au/job/12345?utm_source=alert">IT Support Analyst</a>
    <a href="https://www.seek.com.au/job/67890?tracking=x">Junior SOC Analyst</a>
    <a href="https://www.seek.com.au/account/settings">Manage alerts</a>
    <a href="https://www.seek.com.au/unsubscribe">Unsubscribe</a>
  </body></html>`;

const indeedHtml = `
  <a href="https://au.indeed.com/viewjob?jk=abc123">Application Support Analyst (Hybrid)</a>
  <a href="https://au.indeed.com/rc/clk?jk=def456">ERP Support Analyst</a>
  <a href="https://au.indeed.com/account">Notification settings</a>`;

describe("extractAnchors", () => {
  it("extracts href + visible text and decodes entities", () => {
    const anchors = extractAnchors('<a href="https://x.com/a?b=1&amp;c=2">Support &amp; Ops</a>');
    expect(anchors[0]).toEqual({ href: "https://x.com/a?b=1&c=2", text: "Support & Ops" });
  });
});

describe("parseJobAlertEmail", () => {
  it("parses SEEK alerts and drops noise links", () => {
    const jobs = parseJobAlertEmail({ from: "jobalerts@seek.com.au", subject: "New jobs matching IT Support", html: seekHtml });
    const titles = jobs.map((j) => j.title);
    expect(titles).toContain("IT Support Analyst");
    expect(titles).toContain("Junior SOC Analyst");
    expect(titles).not.toContain("Manage alerts");
    expect(titles).not.toContain("Unsubscribe");
    expect(jobs[0]!.sourceUrl).toBe("https://www.seek.com.au/job/12345"); // tracking stripped
  });

  it("parses Indeed alerts and detects hybrid work type", () => {
    const jobs = parseJobAlertEmail({ from: "alert@indeed.com", subject: "jobs for you", html: indeedHtml });
    const appSupport = jobs.find((j) => j.title.includes("Application Support"));
    expect(appSupport?.workType).toBe("hybrid");
    expect(jobs.length).toBe(2);
  });

  it("dedupes the same listing within an email", () => {
    const dupHtml = `
      <a href="https://www.seek.com.au/job/1?utm_source=a">Role A</a>
      <a href="https://www.seek.com.au/job/1?utm_source=b">Role A</a>`;
    const jobs = parseJobAlertEmail({ from: "x@seek.com.au", subject: "jobs", html: dupHtml });
    expect(jobs.length).toBe(1);
  });

  it("falls back to generic parsing for unknown senders", () => {
    const html = `<a href="https://careers.acme.com/jobs/it-support">IT Support Specialist</a>
      <a href="https://acme.com/unsubscribe">unsubscribe</a>`;
    const jobs = parseJobAlertEmail({ from: "careers@acme.com", subject: "Job alert", html });
    expect(jobs.map((j) => j.title)).toEqual(["IT Support Specialist"]);
    expect(jobs[0]!.confidence).toBeLessThan(0.5);
  });
});
