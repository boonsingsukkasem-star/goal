import { Skeleton } from "@/components/ui/skeleton";

export default function ExploreLoading() {
  return (
    <main className="goal-discovery-grid min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8 md:py-16">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-5 h-16 w-72 sm:w-96" />
        <Skeleton className="mt-7 h-16" />
        <Skeleton className="mt-6 h-8 w-80" />
        {Array.from({ length: 3 }, (_, section) => (
          <div className="mt-14" key={section}>
            <Skeleton className="h-9 w-48" />
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, card) => (
                <Skeleton className="h-56 border border-border" key={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
