import type { ReactNode } from "react";
import { FilAriane, type MailleAriane } from "./fil-ariane";

export function EnTetePage({
  titre,
  lede,
  mailles,
  compteur,
  actions,
}: {
  titre: string;
  lede?: string;
  mailles?: readonly MailleAriane[];
  compteur?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3 pb-2">
      {mailles && mailles.length > 0 && <FilAriane mailles={mailles} />}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-[-0.035em] text-secondary-900 sm:text-[2rem] sm:leading-tight">
              {titre}
            </h1>
            {compteur && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-800 border border-primary-200/60 shadow-xs">
                {compteur}
              </span>
            )}
          </div>
          {lede && (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {lede}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
