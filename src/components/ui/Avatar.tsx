import { Critter } from "@/components/ui/Critter";
import { cn } from "@/lib/utils";

/**
 * Foto de perfil.
 *
 * Sem `src`, cai no bichinho desenhado a partir do endereço da carteira — ver
 * `Critter.tsx`. Ou seja: quem só conectou a carteira e operou já tem uma cara,
 * sem precisar enviar nada.
 *
 * Com `src`, mostra a foto que a pessoa enviou. Só isto muda entre os dois
 * casos, então qualquer lugar do site que use `<Avatar>` ganha as duas coisas
 * de graça.
 */
export function Avatar({
  seed,
  src,
  size = 32,
  className,
}: {
  /** endereço da carteira ou apelido */
  seed: string;
  /** foto enviada pela pessoa, quando houver */
  src?: string;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
       
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full bg-ink-800 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return <Critter seed={seed} size={size} className={className} />;
}
