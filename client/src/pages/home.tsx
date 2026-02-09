import { Button } from "@/components/ui/button";

export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">GM Assistant</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Your AI-powered game master companion for managing campaigns, documents, and knowledge.
      </p>
      <Button size="lg">Get Started</Button>
    </div>
  );
}
