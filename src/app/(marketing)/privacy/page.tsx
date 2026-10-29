import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How CultureCrash collects, uses, stores and deletes information during its pilot stage. Draft pending legal review.",
};

const sections: LegalSection[] = [
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p>We collect only what we need to run the service:</p>
        <ul>
          <li><strong>Account details</strong> — your name, email address, and the name of your workspace.</li>
          <li><strong>Workspace content</strong> — campaign briefs, uploaded documents, research results, notes, strategies, reports, experiment results and assistant conversations you or your team create.</li>
          <li><strong>Pilot requests</strong> — the name, email, company, team size and message you send through the pilot form.</li>
          <li><strong>Usage and technical data</strong> — events such as &ldquo;research run started&rdquo; or &ldquo;report exported&rdquo;, plus standard server logs (for example IP address, browser type and timestamps) used for security and reliability.</li>
        </ul>
        <p>We do not intentionally collect sensitive personal data, and we ask you not to put it in briefs or uploads.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To provide the product: running research, generating interpretations and reports, and keeping your work available to your team.</li>
        <li>To secure the service: authentication, rate limiting, abuse prevention and investigating problems.</li>
        <li>To understand how the core workflow is used so we can improve it. Analytics events avoid recording the content of your briefs.</li>
        <li>To reply to pilot requests and support questions.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    body: (
      <>
        <p>
          Some features send workspace content — for example a brief and the research records stored for it — to a
          large language model provider to generate interpretations, strategies and assistant replies. We send only
          the content needed for the task you requested.
        </p>
        <p>
          We do not use your workspace content to train our own models. Model providers process data under their own
          terms for API customers; we choose providers whose API terms do not permit training on submitted data by
          default, and we will name them in a subprocessor list before general availability.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We don&rsquo;t sell personal information. We share data only with service providers that help us run CultureCrash, such as:</p>
        <ul>
          <li>Database, authentication and file storage hosting.</li>
          <li>Cultural data providers (currently Qloo), which receive research queries such as audience descriptors, markets and entity names — not your account details.</li>
          <li>Language model providers, as described above.</li>
          <li>Application hosting and error monitoring.</li>
        </ul>
        <p>
          Reports are shared outside your workspace only when someone in your workspace creates a share link. Links
          can be revoked and can be set to expire. We may disclose information if required by law.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention and deletion",
    body: (
      <>
        <p>
          Workspace content is kept while your workspace is active. You can delete projects and their contents from
          within the product. Owners can set an automatic retention period for working data (raw provider responses,
          copilot conversations, activity history) and can delete an entire workspace from its settings; deletion
          from active systems is immediate, with backups expiring on their normal cycle.
        </p>
        <p>Pilot requests are kept for up to 12 months unless you ask us to delete them sooner.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>
          We use access controls at the application and database level so that one workspace — and one agency client
          — cannot see another&rsquo;s data. Secrets are kept server-side, connections are encrypted in transit, and
          expensive operations are rate limited.
        </p>
        <p>
          No system is perfectly secure. CultureCrash is in a pilot stage and has not completed an independent security
          audit or certification. Please avoid uploading highly confidential material during the pilot unless agreed in
          writing.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <p>
        You can access and update your account details in settings, export reports, and delete your content. Depending
        on where you live, you may have further rights — such as to request a copy of your data, to correct or delete
        it, or to object to certain processing. Contact us through <Link href="/help" className="text-ink underline underline-offset-2">help &amp; feedback</Link> and
        we will respond within a reasonable time.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use cookies that are necessary to keep you signed in and to protect forms. We do not use advertising cookies.
        Your browser may store small preferences locally, such as interface settings.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We will update this policy as the product and our legal review progress, and change the date at the top when we
        do. Material changes will be communicated to workspace owners. For questions, use{" "}
        <Link href="/help" className="text-ink underline underline-offset-2">help &amp; feedback</Link>. See also our{" "}
        <Link href="/terms" className="text-ink underline underline-offset-2">terms of service</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal · Privacy"
      title="Privacy policy"
      updated="28 October 2026"
      intro={
        <p>
          This policy explains what information CultureCrash collects, why, and what you can do about it. We have tried
          to write it plainly. If anything is unclear, ask us.
        </p>
      }
      sections={sections}
    />
  );
}
