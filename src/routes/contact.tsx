import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Mail, MessageSquare } from "lucide-react";

import { LegalPage, Section } from "@/components/site/PageShell";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & Support | Crunch" },
      {
        name: "description",
        content:
          "Get help with Crunch: calendar sync problems, missing due dates, account questions, and how to reach the pilot team directly.",
      },
      { property: "og:title", content: "Contact & Support | Crunch" },
      {
        property: "og:description",
        content:
          "Reach the Crunch pilot team for sync issues, missing due dates, or account help. A human answers.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactPage,
});

const channels = [
  {
    icon: Mail,
    title: "Email us",
    body: "support@crunch.myemeris.edu.za",
    note: "Best for account issues and anything involving your data.",
  },
  {
    icon: LifeBuoy,
    title: "Sync not working?",
    body: "Send us the error you saw",
    note: "Never send us your calendar feed URL — it is a secret. Describe the problem instead.",
  },
  {
    icon: MessageSquare,
    title: "Pilot feedback",
    body: "Tell us what is wrong with the estimates",
    note: "The model improves fastest when students say where it guessed badly.",
  },
];

function ContactPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Contact & support"
      intro="Crunch is run by two students. There is no ticket queue and no bot — write to us and one of us reads it."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map((channel) => (
          <div key={channel.title} className="surface-card rounded-2xl p-5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <channel.icon className="h-4.5 w-4.5" />
            </span>
            <p className="mt-4 font-display text-sm font-semibold">{channel.title}</p>
            <p className="mt-1 text-sm text-foreground">{channel.body}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{channel.note}</p>
          </div>
        ))}
      </div>

      <Section title="Common issues">
        <p>
          <strong className="text-foreground">My feed connected but shows no events.</strong> That
          usually means your lecturers have not published due dates to Brightspace yet, not that
          Crunch failed. Lecturers can also add dates directly in Crunch.
        </p>
        <p>
          <strong className="text-foreground">A due date is wrong.</strong> Crunch mirrors your
          calendar feed exactly. If the feed is wrong, the fix has to happen in Brightspace — tell
          us anyway so we can flag it to the course.
        </p>
        <p>
          <strong className="text-foreground">Signup rejected my email.</strong> Crunch is limited
          to university addresses on the school domain during the pilot.
        </p>
      </Section>
    </LegalPage>
  );
}
