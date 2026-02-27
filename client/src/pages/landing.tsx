// SPDX-License-Identifier: AGPL-3.0-or-later

import { BookOpen, FileText, MessageSquare, Sparkles, Github, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: BookOpen,
    title: "Campaign Management",
    description:
      "Organize your RPG campaigns with structured workspaces for notes, world-building, and session tracking.",
  },
  {
    icon: FileText,
    title: "Document Processing",
    description:
      "Upload PDFs, text files, and markdown. Documents are automatically chunked and indexed for instant retrieval.",
  },
  {
    icon: MessageSquare,
    title: "RAG-Powered Q&A",
    description:
      "Ask questions about your campaign materials and get accurate, citation-backed answers from your own documents.",
  },
  {
    icon: Sparkles,
    title: "Content Generation",
    description:
      "Generate NPCs, adventure hooks, session summaries, and more — grounded in your campaign's lore.",
  },
];

type TierFeature = {
  name: string;
  selfHosted: string | boolean;
  basic: string | boolean;
  premium: string | boolean;
};

const tierFeatures: TierFeature[] = [
  { name: "Campaign management", selfHosted: true, basic: true, premium: true },
  { name: "Document upload & processing", selfHosted: true, basic: true, premium: true },
  { name: "RAG-powered Q&A", selfHosted: true, basic: true, premium: true },
  { name: "Content generation", selfHosted: true, basic: true, premium: true },
  { name: "Bring your own LLM", selfHosted: true, basic: false, premium: false },
  { name: "Monthly query limit", selfHosted: "Unlimited", basic: "TBD", premium: "TBD" },
  { name: "Document storage", selfHosted: "Unlimited", basic: "TBD", premium: "TBD" },
  { name: "Priority support", selfHosted: false, basic: false, premium: true },
  { name: "Price", selfHosted: "Free", basic: "TBD", premium: "TBD" },
];

function TierCell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-5 text-success" />;
  if (value === false) return <Minus className="mx-auto size-5 text-muted-foreground" />;
  return <span className="text-sm text-foreground">{value}</span>;
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-24 pb-16 text-center">
        <Badge variant="default" className="mb-6">
          Open Source
        </Badge>
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          The Grimoire
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
          An AI-powered RPG campaign management tool. Upload your world-building documents, ask
          questions grounded in your lore, and generate content that stays true to your setting.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <a href="https://github.com/juggler434/gm_assistant" target="_blank" rel="noopener noreferrer">
              <Github className="size-5" />
              View on GitHub
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="https://discord.gg/bgkqExb5" target="_blank" rel="noopener noreferrer">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Join Discord
            </a>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">
          Everything you need to run your campaign
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/60">
              <CardHeader className="flex-row items-start gap-3 pb-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <CardTitle className="pt-1.5">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Tier Comparison */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground">
          Choose your path
        </h2>
        <p className="mb-10 text-center text-muted-foreground">
          Self-host for free or let us handle the infrastructure.
        </p>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Feature</th>
                <th className="px-4 py-3 text-center font-medium text-foreground">Self-Hosted</th>
                <th className="px-4 py-3 text-center font-medium text-foreground">
                  Basic
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Hosted
                  </Badge>
                </th>
                <th className="px-4 py-3 text-center font-medium text-foreground">
                  Premium
                  <Badge variant="default" className="ml-2 text-[10px]">
                    Hosted
                  </Badge>
                </th>
              </tr>
            </thead>
            <tbody>
              {tierFeatures.map((row, i) => (
                <tr
                  key={row.name}
                  className={i < tierFeatures.length - 1 ? "border-b border-border/60" : ""}
                >
                  <td className="px-4 py-3 text-muted-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-center">
                    <TierCell value={row.selfHosted} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TierCell value={row.basic} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TierCell value={row.premium} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <a
          href="https://github.com/juggler434/gm_assistant"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <Github className="size-4" />
          GitHub
        </a>
        <span className="mx-2">&middot;</span>
        <a
          href="https://discord.gg/bgkqExb5"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Discord
        </a>
        <span className="mx-2">&middot;</span>
        <span>AGPL-3.0 License</span>
      </footer>
    </div>
  );
}
