import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Esqueleto da home enquanto o servidor monta a vitrine.
 *
 * Sem este arquivo, clicar em "Explorar" deixava a página anterior congelada
 * até a vitrine inteira chegar — a sensação de "site travado". Com ele, a
 * navegação responde no mesmo instante e os cartões chegam depois.
 */
export default function Carregando() {
  return (
    <div className="space-y-6 pt-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
