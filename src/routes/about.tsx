import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, Section } from "@/components/site/PageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Team | Crunch" },
      {
        name: "description",
        content:
          "Crunch is a HIVE-sponsored student innovation pilot built by Mmoloki Kgololosego and Tshiamo Aphane to make university workload visible before it lands.",
      },
      { property: "og:title", content: "About the Team | Crunch" },
      {
        property: "og:description",
        content:
          "Why we built Crunch, how the workload model works, and who is behind this HIVE-sponsored student innovation pilot.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const team = [
  {
    name: "Mmoloki Kgololosego",
    role: "Product & engineering",
    blurb:
      "Built the calendar sync pipeline and the workload scoring engine behind Crunch's week scores.",
  },
  {
    name: "Tshiamo Aphane",
    role: "Research & design",
    blurb:
      "Ran the student interviews that shaped the model, and set the calm-not-alarming design direction.",
  },
];

function AboutPage() {
  return (
    <LegalPage
      eyebrow="HIVE student innovation pilot"
      title="About Crunch"
      intro="We kept watching the same thing happen: three assignments and a test landing in the same week, and everyone finding out about it on the Sunday night before."
    >
      <Section title="Why we built it">
        <p>
          Every course publishes its due dates in isolation. No one publishes the sum. The result is
          a semester where the pressure is wildly uneven and completely invisible until it arrives.
        </p>
        <p>
          Crunch reads the calendar feed you already have, adds the weeks up, and shows you the
          shape of the semester in advance — so a heavy week is something you plan around instead of
          something that happens to you.
        </p>
      </Section>

      <Section title="How the model works">
        <p>
          It is rules-based, not a black box. Each event gets an estimated effort based on its type
          and whether it is high-stakes; those hours are summed per week and mapped to Light,
          Moderate, Heavy or Brutal. When you log how long something actually took, those numbers
          adjust the estimates for your future work.
        </p>
        <p>
          That means it is honest about being wrong at first, and gets more useful the more you tell
          it. No AI mystique.
        </p>
      </Section>

      <Section title="The team">
        <div className="mt-1 grid gap-4 sm:grid-cols-2">
          {team.map((person) => (
            <div key={person.name} className="rounded-xl bg-surface-sunken p-5">
              <p className="font-display text-base font-semibold text-foreground">{person.name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-primary">
                {person.role}
              </p>
              <p className="mt-3 text-sm leading-relaxed">{person.blurb}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sponsorship">
        <p>
          Crunch is sponsored by HIVE, our university&apos;s student innovation programme. It is a
          live pilot running with real students and real coursework, not a class project.
        </p>
      </Section>
    </LegalPage>
  );
}
