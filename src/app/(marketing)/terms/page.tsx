import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using CultureCrash during its pilot stage. Draft pending legal review.",
};

const sections: LegalSection[] = [
  {
    id: "service",
    title: "The service",
    body: (
      <p>
        CultureCrash is a cultural intelligence and campaign strategy workspace. It is currently offered as a pilot:
        features may change, be added or be removed, and the service may occasionally be unavailable while we improve
        it.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and workspaces",
    body: (
      <ul>
        <li>You must provide accurate account information and keep your password secure.</li>
        <li>Workspace owners control who joins their workspace and what role each member has, and are responsible for their members&rsquo; use of it.</li>
        <li>You must be legally able to enter into these terms, on your own behalf or for the organisation you represent.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <p>
          You keep ownership of the briefs, documents, notes and other content you put into CultureCrash, and of the
          strategies, briefs and reports you produce with it, subject to the rights of any third-party data included in
          them.
        </p>
        <p>
          You give us permission to store and process your content only as needed to run the service for you — for
          example, sending it to a language model provider to generate an interpretation you asked for. You confirm you
          have the right to upload what you upload, including any client material.
        </p>
      </>
    ),
  },
  {
    id: "outputs",
    title: "AI output and cultural data",
    body: (
      <>
        <p>
          CultureCrash combines third-party cultural data with AI-generated interpretation. AI output can be incomplete
          or wrong. Affinity data describes correlations in taste and is not a prediction of purchasing behaviour or
          campaign performance.
        </p>
        <p>
          <strong>You are responsible for reviewing output before relying on it</strong> or presenting it to clients.
          CultureCrash does not guarantee any campaign result and does not remove cultural, legal or reputational risk.
        </p>
        <p>
          Third-party data (such as Qloo data) is provided under that provider&rsquo;s terms. You may not extract it in
          bulk, resell it, or use it outside the context of your projects.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>Please don&rsquo;t:</p>
        <ul>
          <li>Break the law, infringe others&rsquo; rights, or upload content you aren&rsquo;t allowed to share.</li>
          <li>Use CultureCrash to profile or target specific private individuals, or to process sensitive personal data.</li>
          <li>Attempt to access other workspaces, bypass usage limits, probe for vulnerabilities without permission, or disrupt the service.</li>
          <li>Use the service to generate deceptive, harassing or discriminatory content.</li>
        </ul>
        <p>We may suspend access that puts the service, other customers or third parties at risk.</p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Pilots and fees",
    body: (
      <p>
        Billing is not yet available. During the pilot, CultureCrash is provided free of charge with usage limits we set
        per workspace. We will not charge you without first publishing prices on the{" "}
        <Link href="/pricing" className="text-ink underline underline-offset-2">pricing page</Link> and getting your explicit agreement.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Ending your use",
    body: (
      <p>
        You can stop using CultureCrash at any time and ask us to delete your workspace. We may end a pilot with
        reasonable notice, and will give you a chance to export your reports first, except where we must act quickly to
        prevent harm or comply with the law.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: (
      <p>
        During the pilot the service is provided &ldquo;as is&rdquo;, without warranties of any kind to the extent the
        law allows. To the extent permitted by law, we are not liable for indirect or consequential losses, or for
        decisions made on the basis of output from the service. Nothing in these terms limits liability that cannot be
        limited by law.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We will update these terms as the product matures and after legal review, and will notify workspace owners of
        material changes. Questions? Use <Link href="/help" className="text-ink underline underline-offset-2">help &amp; feedback</Link>. Our{" "}
        <Link href="/privacy" className="text-ink underline underline-offset-2">privacy policy</Link> explains how we handle personal information.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal · Terms"
      title="Terms of service"
      updated="28 October 2026"
      intro={
        <p>
          These terms describe the agreement between you and CultureCrash when you use the product during its pilot
          stage. By creating an account or using the service, you agree to them.
        </p>
      }
      sections={sections}
    />
  );
}
