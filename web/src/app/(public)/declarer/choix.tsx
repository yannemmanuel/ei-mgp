"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";

type Option = {
  readonly code: string;
  readonly titre: string;
  readonly description: string;
  readonly icone?: string;
};

const PLAINTES: Option[] = [
  {
    code: "grief_employe",
    titre: "Employé SODECI",
    description: "Une situation professionnelle que vous jugez préjudiciable.",
    icone: "employe",
  },
  {
    code: "grief_sous_traitant",
    titre: "Sous-Traitant SODECI",
    description: "Conditions de travail, paiement, sécurité sur un chantier.",
    icone: "soustraitant",
  },
  {
    code: "grief_communaute",
    titre: "Riverain ou membre de la communauté",
    description:
      "Nuisance, dommage ou différend lié aux activités de l'entreprise.",
    icone: "communaute",
  },
];

export function ChoixParcours() {
  const [etape, setEtape] = useState<"nature" | "plainte">("nature");

  if (etape === "plainte") {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => setEtape("nature")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary-500 hover:text-secondary-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Revenir
        </button>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
          Étape 2 sur 2
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-secondary-900 sm:text-4xl">
          À quel titre déposez-vous ?
        </h1>
        <p className="mt-2 text-sm text-secondary-600 leading-relaxed">
          Cette réponse détermine les questions qui vous seront posées, et
          l&apos;équipe qui traitera votre dossier.
        </p>

        <div className="mt-8 grid gap-3">
          {PLAINTES.map((option) => (
            <CarteOption key={option.code} option={option} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
        Déposer un signalement
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-secondary-900 sm:text-4xl">
        Que souhaitez-vous signaler ?
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-secondary-600">
        Vous pourrez rester anonyme à l&apos;étape suivante, quel que soit votre
        choix.
      </p>

      <div className="mt-8 grid gap-3">
        <CarteOption
          option={{
            code: "ei_employe",
            titre: "Un événement indésirable",
            description:
              "Un incident, un presque-accident ou une situation dangereuse constatée sur le site.",
            icone: "ei",
          }}
        />

        <button
          type="button"
          onClick={() => setEtape("plainte")}
          className="group block w-full rounded-2xl border border-border/80 bg-card p-5 text-left shadow-[0_8px_28px_rgba(18,33,59,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-secondary-300 hover:shadow-[0_16px_40px_rgba(18,33,59,0.09)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <div className="flex items-center justify-between">
            <span className="block text-sm font-semibold text-secondary-900">
              Une plainte ou un grief
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary-100 text-secondary-500 group-hover:bg-secondary-200 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
          <span className="mt-1.5 block text-xs text-secondary-600 leading-relaxed">
            Un désaccord, un préjudice ou un manquement que vous souhaitez
            porter à notre connaissance.
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
            Préciser
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      <p className="mt-8 rounded-xl border border-secondary-100 bg-secondary-50/70 px-4 py-3 text-xs leading-5 text-secondary-600">
        Vous hésitez ? Choisissez ce qui vous semble le plus proche : nous
        réorienterons votre dossier si besoin.
      </p>
    </div>
  );
}

function CarteOption({ option }: { option: Option }) {
  return (
    <Link
      href={`/declarer/${option.code}`}
      className="group flex w-full items-center justify-between rounded-2xl border border-border/80 bg-card p-5 text-left shadow-[0_8px_28px_rgba(18,33,59,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-[0_16px_40px_rgba(18,33,59,0.09)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-secondary-900">
          {option.titre}
        </span>
        <span className="mt-1 block text-xs text-secondary-600 leading-relaxed">
          {option.description}
        </span>
      </span>
      <span className="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 border border-primary-200/60 text-primary-700 group-hover:bg-primary-100 transition-colors">
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
