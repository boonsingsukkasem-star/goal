import type { ReactNode } from "react";

interface LegalPageProps {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}

export function LegalPage({ children, description, eyebrow, title }: LegalPageProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="border-b border-border pb-8">
        <p className="font-label text-sm font-semibold tracking-[0.2em] text-accent uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-4xl font-headline-thai text-5xl leading-tight font-bold sm:text-7xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl font-body-thai text-base leading-8 text-foreground-warm sm:text-lg">
          {description}
        </p>
      </header>

      <article className="mt-8 space-y-6">{children}</article>
    </main>
  );
}

export function LegalSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id?: string;
  title: string;
}) {
  return (
    <section
      className="scroll-mt-8 rounded-[2rem] border border-border bg-surface p-6 sm:p-8"
      id={id}
    >
      <h2 className="font-headline-thai text-3xl font-bold text-foreground sm:text-4xl">{title}</h2>
      <div className="mt-4 space-y-4 font-body-thai leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
