import { Fragment } from "react";
import { ArrowRight, CircleAlert, Skull, Banknote, Server, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Citation {
  label: string;
  href: string;
}

function CitationLink({ label, href }: Citation) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit items-center gap-1 text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const FUNNEL_STEPS: { label: string; pct: number; color: string }[] = [
  { label: "Past Year 1: 84%", pct: 84, color: "var(--color-tier-blue)" },
  { label: "Past Year 3: 44%", pct: 44, color: "var(--color-tier-purple)" },
  { label: "Past Year 5: 26%", pct: 26, color: "var(--color-tier-gold)" },
];

export function WhyEosSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
        <CircleAlert className="h-5 w-5 text-tier-blue" /> Why Games Reach End of Service
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Skull className="h-4 w-4 text-muted-foreground" /> The 70% Macro Attrition Wall
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="font-display text-5xl font-bold text-foreground">70%</p>
            <CardDescription className="leading-relaxed">
              An independent database tracking nearly 2,200 Japanese live-service titles found
              that over 70% ended service before year three, with year two marking the single
              most common point of shutdown. While this is self-compiled data from a single
              specialist rather than an institutional study, it remains the most comprehensive
              dataset available for tracking lifecycle decay.
            </CardDescription>
            <CitationLink
              label="Automaton West"
              href="https://automaton-media.com/en/news/more-than-70-of-gacha-and-live-service-games-in-japan-get-discontinued-before-their-third-year-gacha-game-researcher-finds/"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-muted-foreground" /> Aggressive Market Bankruptcies
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="font-display text-5xl font-bold text-foreground">10</p>
              <p className="text-sm font-medium text-muted-foreground">
                confirmed bankruptcies (Jan&ndash;Jul 2026)
              </p>
            </div>
            <CardDescription className="leading-relaxed">
              The financial floor underneath these games is fragile. Teikoku Databank reports
              that Japan saw 10 confirmed bankruptcies among smartphone-game operators between
              January and July 2026 alone, a total already surpassing all of 2025&rsquo;s. One
              studio disclosed it cost roughly $13,600 a month just to keep its niche gacha title
              (Itsuwari no Alice) running, with over half going to cloud server fees alone.
            </CardDescription>
            <CitationLink
              label="Game Observer / Teikoku Databank"
              href="https://gameobserver.com/japans-mobile-game-industry-is-falling-apart-as-developer-bankruptcies-reach-historic-levels-in-2026/"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Server className="h-4 w-4 text-muted-foreground" /> The Server Lifespan Cliffs
            </CardTitle>
            <CardDescription className="leading-relaxed">
              For major releases, telemetry from the GachaGo! End of Service Tracker outlines the
              exact operational milestones where localized servers go dark, based on 251 tracked
              game-versions as of September 8, 2026.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Percentage of tracked games still active beyond each milestone.
            </p>
            <div className="flex items-end gap-1">
              {FUNNEL_STEPS.map((step, i) => (
                <Fragment key={step.label}>
                  {i > 0 && (
                    <div className="flex h-28 shrink-0 items-center">
                      <ArrowRight className="h-4 w-4 -rotate-45 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t-md"
                        style={{ height: `${step.pct}%`, backgroundColor: step.color }}
                      />
                    </div>
                    <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
                      {step.label}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
            <CitationLink label="GachaGo! End of Service Tracker" href="https://gachago.com/en/gacha-end-of-service-tracker" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
