"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  HardHat,
  MessageSquareWarning,
  Search,
  ShieldAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type Option = {
  readonly code: string;
  readonly titre: string;
  readonly description: string;
  readonly icone: LucideIcon;
};

const PLAINTES: Option[] = [
  {
    code: "grief_employe",
    titre: "Employé SODECI",
    description: "Une situation professionnelle que vous jugez préjudiciable.",
    icone: BriefcaseBusiness,
  },
  {
    code: "grief_sous_traitant",
    titre: "Sous-Traitant SODECI",
    description: "Conditions de travail, paiement, sécurité sur un chantier.",
    icone: HardHat,
  },
  {
    code: "grief_communaute",
    titre: "Riverain ou membre de la communauté",
    description:
      "Nuisance, dommage ou différend lié aux activités de l'entreprise.",
    icone: UsersRound,
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
            icone: ShieldAlert,
          }}
        />

        {/* Même carte et même flèche que l'évènement indésirable : deux choix de même rang. */}
        <button
          type="button"
          onClick={() => setEtape("plainte")}
          className={CLASSES_CARTE}
        >
          <ContenuCarte
            titre="Une plainte ou un grief"
            description="Un désaccord, un préjudice ou un manquement que vous souhaitez porter à notre connaissance."
            icone={MessageSquareWarning}
          />
        </button>
      </div>

      {/*
        Le QR code mène ici, et pas au suivi : sur téléphone, le lien « Suivre mon dossier » du
        panneau latéral n'est pas affiché. Sans ce bouton, qui avait déjà déclaré ne trouvait pas
        comment consulter son dossier après avoir scanné l'affiche.
      */}
      <Link
        href="/suivi"
        className="mt-6 flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-dashed border-secondary-300 bg-secondary-50/60 p-4 text-left transition-colors hover:border-primary-400 hover:bg-primary-50/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-secondary-700 shadow-xs">
            <Search className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-secondary-900">
              Suivre une déclaration
            </span>
            <span className="mt-0.5 block text-xs text-secondary-600">
              Avec votre numéro de référence et votre code d&apos;accès.
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-secondary-500" aria-hidden />
      </Link>

      <p className="mt-8 rounded-xl border border-secondary-100 bg-secondary-50/70 px-4 py-3 text-xs leading-5 text-secondary-600">
        Vous hésitez ? Choisissez ce qui vous semble le plus proche : nous
        réorienterons votre dossier si besoin.
      </p>
    </div>
  );
}

const CLASSES_CARTE =
  "group flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-[0_8px_28px_rgba(18,33,59,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-[0_16px_40px_rgba(18,33,59,0.09)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:gap-3 sm:p-5";

function ContenuCarte({
  titre,
  description,
  icone: Icone,
}: {
  titre: string;
  description: string;
  icone: LucideIcon;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary-200/70 bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100 sm:size-11">
          <Icone className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold text-secondary-900">{titre}</span>
          <span className="mt-1 block break-words text-xs leading-relaxed text-secondary-600">
            {description}
          </span>
        </span>
      </span>
      <span className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary-200/60 bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100 sm:ml-2 sm:size-9">
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );
}

function CarteOption({ option }: { option: Option }) {
  return (
    <Link href={`/declarer/${option.code}`} className={CLASSES_CARTE}>
      <ContenuCarte titre={option.titre} description={option.description} icone={option.icone} />
    </Link>
  );
}
