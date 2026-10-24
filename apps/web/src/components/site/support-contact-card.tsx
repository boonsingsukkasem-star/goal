import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SupportContactCard({
  email,
  eyebrow,
  href,
  title,
  tone = "primary",
}: {
  email: string;
  eyebrow: string;
  href: string;
  title: string;
  tone?: "accent" | "primary";
}) {
  return (
    <a className="group block" href={href}>
      <Card
        className={cn(
          "h-full rounded-[2rem] transition-colors",
          tone === "primary"
            ? "border-primary/40 bg-primary/5 group-hover:bg-primary/10"
            : "border-accent/40 bg-accent/5 group-hover:bg-accent/10",
        )}
      >
        <CardContent className="p-6 sm:p-8">
          <p
            className={cn(
              "font-label text-sm tracking-[0.15em] uppercase",
              tone === "primary" ? "text-primary" : "text-accent",
            )}
          >
            {eyebrow}
          </p>
          <h2 className="mt-2 font-headline-thai text-3xl font-bold">{title}</h2>
          <p className="mt-3 font-body-thai leading-7 text-muted-foreground">{email}</p>
        </CardContent>
      </Card>
    </a>
  );
}
