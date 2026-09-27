import { Skeleton } from "@/components/ui/Skeleton";

/** Esqueleto da página da moeda: responde ao clique na hora, dados depois. */
export default function Carregando() {
  return (
    <div className="space-y-4 pt-4">
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="flex flex-col gap-4 lg:flex-row">
        <Skeleton className="h-[480px] flex-1 rounded-lg" />
        <div className="w-full space-y-4 lg:w-[380px]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
