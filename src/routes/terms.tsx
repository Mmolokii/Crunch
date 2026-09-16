import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, Section } from "@/components/site/PageShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Crunch" },
      {
        name: "description",
        content:
          "The terms for using Crunch: who may sign up, what the workload estimates are and are not, acceptable use, and the limits of a student-run pilot.",
      },
      { property: "og:title", content: "Terms of Service | Crunch" },
      {
        property: "og:description",
        content:
          "Terms for using Crunch, the student workload-awareness pilot: eligibility, accuracy of estimates, acceptable use, and availability.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      intro="Short and readable. By using Crunch you agree to the following."
    >
      <Section title="Who can use Crunch">
        <p>
          Crunch is open to current members of the university with a valid school email address.
          Accounts are created with the role you select at signup — student or lecturer — and that
          role is verified and enforced on our servers, not in your browser.
        </p>
      </Section>

      <Section title="Estimates are estimates">
        <p>
          Crunch scores your weeks using a rules-based model over your calendar events, refined by
          the hours you log yourself. It is a planning aid, not an oracle. A week marked Light can
          still go badly; a week marked Brutal can turn out fine.
        </p>
        <p>
          You remain responsible for your own deadlines. Crunch missing, mis-typing, or
          mis-weighting an assignment is never grounds for an extension, and we make no guarantee
          that your calendar feed is complete — that depends on what your lecturers publish.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your credentials to yourself. You are responsible for activity under your account.
          Do not connect a calendar feed that is not yours.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Do not attempt to de-anonymise cohort aggregates, scrape other users&apos; data, probe our
          access controls, or use Crunch to harass anyone. We may suspend accounts that do.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          Crunch is a student innovation pilot sponsored by HIVE. It is offered as-is, may be
          unavailable during maintenance, and features may change as the pilot runs. We will give
          notice before anything that would lose your data.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You can stop using Crunch and request deletion at any time. We may close accounts that
          are no longer associated with the university.
        </p>
      </Section>
    </LegalPage>
  );
}
