import { Skeleton } from "@/components/ui/skeleton";

export default function LiveLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8">
      <Skeleton className="h-12" />
      <Skeleton className="mt-10 h-28" />
      <Skeleton className="mt-3 h-28" />
    </main>
  );
}
