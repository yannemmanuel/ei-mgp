import { cn } from "@/lib/utils";

/**
 * Marque de la plateforme EI–MGP.
 *
 * La goutte rappelle le métier de la SODECI. Le signe de validation traduit
 * l'écoute d'un signalement puis sa prise en charge. Le nom SODECI reste écrit
 * à côté : ce symbole identifie le produit, il ne remplace pas le logo officiel.
 */
export function LogoProduit({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-[0_8px_24px_rgba(0,166,81,0.22)]",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-[62%]"
        focusable="false"
      >
        <path
          d="M12 2.8S6.4 9 6.4 13.2a5.6 5.6 0 0 0 11.2 0C17.6 9 12 2.8 12 2.8Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m9.2 13.1 1.8 1.8 3.9-4.1"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
