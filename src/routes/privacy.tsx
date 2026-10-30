import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, Section } from "@/components/site/PageShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Crunch" },
      {
        name: "description",
        content:
          "What Crunch collects from your university calendar feed and logged study hours, how it is stored and encrypted, and why it is never shared with third parties.",
      },
      { property: "og:title", content: "Privacy Policy | Crunch" },
      {
        property: "og:description",
        content:
          "Plain-language privacy policy for Crunch: calendar feed contents, logged hours, encrypted feed URLs, no third-party sharing.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Crunch handles your coursework data. Here is exactly what that means, in plain language, without legal padding."
    >
      <Section title="What we collect">
        <p>
          <strong className="text-foreground">Your calendar feed.</strong> When you connect your
          Brightspace (D2L) calendar subscription URL, we read the events in it: assignment titles,
          course names and codes, and due dates. We store those events so we can score your weeks.
        </p>
        <p>
          <strong className="text-foreground">Your logged hours.</strong> If you tell us how long an
          assignment actually took, we store that number against that assignment. It replaces our
          estimate for that item in your week totals, and Insights compares the two for you.
        </p>
        <p>
          <strong className="text-foreground">Your account details.</strong> Your school email
          address and your role. Every account is a student account; lecturer access is granted by
          the Crunch team.
        </p>
      </Section>

      <Section title="What we do not collect">
        <p>
          No browsing history, no location, no device fingerprinting, no advertising identifiers. We
          do not read your Brightspace grades, submissions, or messages — a calendar subscription
          feed does not expose them, and we do not ask for anything beyond it.
        </p>
      </Section>

      <Section title="How your calendar feed URL is stored">
        <p>
          Your calendar subscription URL is a secret: anyone holding it can read your course
          calendar. We store it encrypted at rest, only ever show it back to you (in Settings), and
          never include it in logs, analytics, error reports or the data download. Our server only
          ever fetches it from the university&apos;s Brightspace. You can replace it at any time in
          Settings; deleting your account removes it.
        </p>
      </Section>

      <Section title="What lecturers can see">
        <p>
          Lecturers see aggregated, anonymised workload for their own course only — how heavy each
          week looks across the whole cohort. Aggregates are withheld entirely below a minimum
          cohort size, so a student in a small class cannot be identified by inference.
        </p>
        <p>
          There is no per-student view for lecturers. A lecturer cannot see your assignments, your
          hours, your name, or your email through Crunch.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          We do not sell your data and do not share it with third parties for marketing. It is
          stored in a Supabase database and served by an app hosted on Vercel; both act only as our
          infrastructure. Access is restricted at the database level so your rows are only ever
          readable by you.
        </p>
      </Section>

      <Section title="Getting a copy of your data">
        <p>
          Settings → Your data → Download my data gives you a file with everything Crunch holds
          about you: your account, courses, deadlines, logged hours, week scores and notification
          settings. Your Brightspace link is left out of the file because it gives access to your
          calendar; you can see it in Settings.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Settings → Your data → Delete account removes your account, your calendar link, your
          courses, your events, your logged hours and your week scores straight away. Deletion
          cascades, so nothing of yours is left behind in aggregates that could be traced back to
          you. You can also ask us to do it for you.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Crunch is a student-run pilot at Emeris. Reach the team through the contact page and a
          human will answer.
        </p>
      </Section>
    </LegalPage>
  );
}
