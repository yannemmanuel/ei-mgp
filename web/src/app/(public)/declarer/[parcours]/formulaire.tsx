'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Champ, ParcoursConfig } from '@/server/services/declaration/parcours-config'
import { soumettreDeclaration, type EtatSoumission } from './actions'
import { Recepisse } from './recepisse'

type Option = { valeur: string; libelle: string }

type Props = {
  config: ParcoursConfig
  categories: Option[]
  categoriesAutre: string[]
  niveauxGravite: Option[]
  directions: Option[]
  /**
   * Action de soumission. Injectée plutôt qu'importée en dur : la saisie relais (EX-DEC-10)
   * réutilise ce formulaire avec sa propre action, authentifiée.
   */
  soumettre?: (etat: EtatSoumission, donnees: FormData) => Promise<EtatSoumission>
  /** Canaux d'origine proposés à l'agent relais. Vide en saisie publique. */
  canauxRelais?: Option[]
}

const LIBELLES_ETAPES = ['Votre identité', 'Contexte', 'Nature de l’évènement', 'Pièces jointes']
const NB_ETAPES = 4

/** Plafond de la description (arbitrage du 08/09/2026, en remplacement du plancher RGI-02). */
const LONGUEUR_MAX_DESCRIPTION = 200
const ETAT_INITIAL: EtatSoumission = {}

export function FormulaireDeclaration({
  config,
  categories,
  categoriesAutre,
  niveauxGravite,
  directions,
  soumettre = soumettreDeclaration,
  canauxRelais = [],
}: Props) {
  const [etat, action, enCours] = useActionState(soumettre, ETAT_INITIAL)
  const viaRelais = canauxRelais.length > 0
  const [etape, setEtape] = useState(1)
  /**
   * Anti-robot par delai minimal de remplissage (DT-14) : pose au MONTAGE, cote client.
   *
   * Laravel l'etablit cote serveur (Livewire monte sur le serveur), ce qui n'est pas
   * transposable ici : la page etant un composant serveur, calculer l'heure pendant son rendu
   * rendrait celui-ci impur. Poser l'horodatage au montage mesure d'ailleurs plus fidelement le
   * temps pendant lequel le formulaire est reste ouvert dans le navigateur.
   *
   * Contrepartie assumee : un robot peut forger cette valeur. Elle n'est pas le seul rempart —
   * le champ piege et la limitation de debit par IP restent tous deux verifies cote serveur.
   */
  const [horodatageAffichage] = useState(() => Math.floor(Date.now() / 1000))
  const [anonymat, setAnonymat] = useState(false)
  const [categorieId, setCategorieId] = useState('')
  const [descriptionLongueur, setDescriptionLongueur] = useState(0)

  /**
   * Erreurs détectées dans le navigateur, avant tout aller-retour serveur.
   *
   * Elles COMPLÈTENT `etat.erreurs` (le retour du serveur) sans jamais s'y substituer : la
   * validation du navigateur est un confort d'ergonomie, celle des Server Actions reste la seule
   * qui fasse autorité.
   */
  const [erreursClient, setErreursClient] = useState<Record<string, string>>({})
  const formulaireRef = useRef<HTMLFormElement>(null)

  // RGI-03 : les champs d'identité ne sont pas rendus du tout si l'anonymat est coché — pas
  // seulement masqués en CSS, ils ne peuvent donc pas être soumis.
  const visibles = useMemo(
    () => config.champs.filter((c) => !anonymat || !c.identite || c.nom === 'statutPlaignant'),
    [config.champs, anonymat]
  )

  const categorieEstAutre = categoriesAutre.includes(categorieId)

  if (etat.succes) {
    return <Recepisse reference={etat.succes.reference} codeAcces={etat.succes.codeAcces} />
  }

  const champsDe = (n: number) => visibles.filter((c) => c.etape === n)

  // Le serveur fait autorité : son message l'emporte sur celui du navigateur pour un même champ.
  const erreur = (nom: string) => etat.erreurs?.[nom] ?? erreursClient[nom]

  /**
   * Vérifie les champs d'une ou plusieurs étapes, et renvoie la première en défaut.
   *
   * `checkValidity()` fonctionne sur un champ masqué ; c'est `reportValidity()` qui échoue à y
   * placer le curseur. On collecte donc les messages nous-mêmes et on affiche l'étape fautive
   * avant de donner le focus — sinon le navigateur bloquerait l'envoi en désignant un champ que
   * personne ne voit, sans dire lequel.
   */
  function validerEtapes(numeros: number[]): number | null {
    const formulaire = formulaireRef.current
    if (!formulaire) return null

    const messages: Record<string, string> = {}
    let premiereEnDefaut: number | null = null
    let premierChampInvalide: HTMLElement | null = null

    for (const numero of numeros) {
      const champs = formulaire.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(`[data-etape="${numero}"] [name]`)

      for (const champ of champs) {
        if (champ.checkValidity()) continue

        messages[champ.name] = champ.validationMessage

        if (premiereEnDefaut === null) {
          premiereEnDefaut = numero
          premierChampInvalide = champ
        }
      }
    }

    setErreursClient(messages)

    if (premiereEnDefaut !== null) {
      setEtape(premiereEnDefaut)
      // Le focus attend que l'étape fautive soit rendue : le placer avant reviendrait à viser un
      // champ encore masqué, que le navigateur refuse de focaliser.
      requestAnimationFrame(() => premierChampInvalide?.focus())
    }

    return premiereEnDefaut
  }

  function continuer() {
    if (validerEtapes([etape]) !== null) return
    setEtape((e) => Math.min(NB_ETAPES, e + 1))
  }

  return (
    <form
      ref={formulaireRef}
      action={action}
      /*
       * `noValidate` : la validation native est remplacée, pas supprimée.
       *
       * Toutes les étapes restent montées pour que les saisies survivent à la navigation ; le
       * navigateur refuserait alors d'envoyer le formulaire en désignant un champ obligatoire
       * d'une étape masquée, qu'il ne peut pas focaliser — l'envoi échouerait sans qu'aucun
       * message n'apparaisse. `validerEtapes()` reprend le même contrôle, étape par étape, et
       * ramène l'utilisateur devant le champ en cause.
       */
      noValidate
      onInput={(e) => {
        // Une erreur disparaît dès que le champ est retouché : la laisser affichée pendant que
        // la personne corrige donne l'impression que rien ne bouge.
        const nom = (e.target as HTMLElement).getAttribute('name')
        if (nom && erreursClient[nom]) {
          setErreursClient((actuelles) => {
            const suivantes = { ...actuelles }
            delete suivantes[nom]
            return suivantes
          })
        }
      }}
      className="mx-auto max-w-2xl"
    >
      <input type="hidden" name="parcours" value={config.code} />

      {viaRelais && (
        <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
          <Label htmlFor="canalRelais" className="text-sm font-medium">
            Canal d’origine de la déclaration *
          </Label>
          <select
            id="canalRelais"
            name="canalRelais"
            required
            defaultValue=""
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Sélectionner —</option>
            {canauxRelais.map((canal) => (
              <option key={canal.valeur} value={canal.valeur}>
                {canal.libelle}
              </option>
            ))}
          </select>
          {etat.erreurs?.canalRelais && (
            <p className="mt-1 text-sm text-destructive">{etat.erreurs.canalRelais}</p>
          )}
          <p className="mt-2 text-caption text-muted-foreground">
            Vous êtes enregistré comme la personne qui saisit, jamais comme le déclarant.
          </p>
        </div>
      )}
      {/*
        `suppressHydrationWarning` : cette valeur DIFFÈRE volontairement entre le serveur et le
        client. L'initialiseur de `useState` s'exécute une fois au rendu serveur, une fois à
        l'hydratation — quelques secondes plus tard. C'est la valeur du client qui nous intéresse
        (elle mesure le temps pendant lequel le formulaire est resté ouvert), et React la
        conserve ; sans ce marqueur il signalerait un écart à chaque affichage.
      */}
      <input
        type="hidden"
        name="horodatageAffichage"
        value={horodatageAffichage}
        suppressHydrationWarning
      />
      {/* Champ piège (DT-14) : invisible pour un humain, rempli par un robot. */}
      <div aria-hidden className="absolute left-[-9999px]">
        <label htmlFor="piegeAraignee">Ne pas remplir</label>
        <input id="piegeAraignee" name="piegeAraignee" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <h1 className="font-serif text-h1 text-secondary-900">{config.titre}</h1>
      <p className="mt-1 text-sm text-secondary-600">{config.accroche}</p>

      <ol className="mt-6 flex gap-2" aria-label="Progression">
        {LIBELLES_ETAPES.map((libelle, index) => {
          const numero = index + 1
          return (
            <li key={libelle} className="flex-1">
              <div
                className={`h-1 rounded-full transition-colors duration-200 ${
                  numero <= etape ? 'bg-primary' : 'bg-secondary-100'
                }`}
              />
              <span
                className={`mt-1 block text-caption ${
                  numero === etape ? 'text-secondary-900' : 'text-secondary-400'
                }`}
              >
                {libelle}
              </span>
            </li>
          )
        })}
      </ol>

      {etat.erreurGenerale && (
        <Alert variant="destructive" role="alert" className="mt-6">
          <AlertDescription>{etat.erreurGenerale}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 space-y-5">
        {/*
          Les quatre étapes restent MONTÉES, seule leur visibilité change.

          Elles étaient rendues conditionnellement : passer à l'étape 2 démontait les champs de
          l'étape 1, et leurs valeurs disparaissaient du formulaire. Arrivé à l'étape 4, on
          n'envoyait plus que les pièces jointes — tout le reste avait été détruit en chemin.

          RGI-03 reste intact : les champs d'identité ne sont pas seulement masqués quand
          l'anonymat est coché, ils sont retirés de `visibles` et donc absents du DOM.
        */}
        <div data-etape={1} className={etape === 1 ? 'space-y-5' : 'hidden'}>
          <div className="rounded-lg border border-primary-200 bg-primary-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="anonymat"
                checked={anonymat}
                onChange={(e) => setAnonymat(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-secondary-900">
                  Je souhaite rester anonyme
                </span>
                <span className="block text-caption text-secondary-600">
                  Aucune information sur votre identité ne sera enregistrée. Vous recevrez un code
                  pour suivre votre dossier.
                </span>
              </span>
            </label>
          </div>

          {champsDe(1).map((champ) => (
            <ChampFormulaire
              key={champ.nom}
              champ={champ}
              erreur={erreur(champ.nom)}
              directions={directions}
            />
          ))}
        </div>

        <div data-etape={2} className={etape === 2 ? 'space-y-5' : 'hidden'}>
          {champsDe(2).map((champ) => (
            <ChampFormulaire key={champ.nom} champ={champ} erreur={erreur(champ.nom)} directions={directions} />
          ))}
        </div>

        <div data-etape={3} className={etape === 3 ? 'space-y-5' : 'hidden'}>
          <ChampSelect
            nom="categorieId"
            libelle="Catégorie"
            obligatoire
            options={categories}
            valeur={categorieId}
            onChange={setCategorieId}
            erreur={erreur('categorieId')}
          />

          {categorieEstAutre && (
            <ChampTexte
              nom="categorieAutrePrecision"
              libelle="Préciser la catégorie"
              obligatoire
              erreur={erreur('categorieAutrePrecision')}
            />
          )}

          <ChampSelect
            nom="niveauGraviteId"
            libelle="Niveau de gravité"
            obligatoire
            options={niveauxGravite}
            erreur={erreur('niveauGraviteId')}
          />

          <div className="space-y-1.5">
            <Label htmlFor="description">Description des faits</Label>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={LONGUEUR_MAX_DESCRIPTION}
              onChange={(e) => setDescriptionLongueur(e.target.value.length)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-caption text-muted-foreground">
                Facultatif. L’essentiel en quelques phrases ; vous pourrez compléter plus tard.
              </p>
              <p
                className={`text-caption tabular-nums ${
                  descriptionLongueur >= LONGUEUR_MAX_DESCRIPTION
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}
              >
                {descriptionLongueur}/{LONGUEUR_MAX_DESCRIPTION}
              </p>
            </div>
            {erreur('description') && <Erreur message={erreur('description')!} />}
          </div>

          {champsDe(3).map((champ) => (
            <ChampFormulaire key={champ.nom} champ={champ} erreur={erreur(champ.nom)} directions={directions} />
          ))}

          <ChampTexte
            nom="attentesDeclarant"
            libelle="Vos attentes"
            erreur={erreur('attentesDeclarant')}
          />
        </div>

        <div data-etape={4} className={etape === 4 ? 'space-y-1.5' : 'hidden'}>
          <Label htmlFor="fichiers">Pièces jointes</Label>
          <Input id="fichiers" name="fichiers" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf" />
          <p className="text-caption text-muted-foreground">
            5 fichiers maximum, 50 Mo au total. Images, vidéos ou PDF.
          </p>
          {erreur('fichiers') && <Erreur message={erreur('fichiers')!} />}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => setEtape((e) => Math.max(1, e - 1))}
          disabled={etape === 1}
        >
          Précédent
        </Button>

        {etape < NB_ETAPES ? (
          <Button type="button" onClick={continuer}>
            Continuer
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={enCours}
            onClick={(e) => {
              /*
               * Un envoi ne peut pas être déclenché par le geste qui vient de le faire apparaître.
               *
               * « Continuer » et « Envoyer ma déclaration » occupent la même place : à la dernière
               * étape, le premier est remplacé SUR PLACE par le second. Un double-clic sur
               * « Continuer » à l'étape 3 fait donc partir la déclaration — le second clic atteint
               * un bouton qui n'existait pas au premier, et l'étape des pièces jointes est sautée
               * sans avoir été vue. C'est le défaut signalé, reproduit puis figé par un test.
               *
               * `detail` compte les clics d'une même rafale : au-delà de 1, le clic appartient au
               * geste précédent et ne vaut pas décision d'envoyer. Un critère de temps aurait fait
               * dépendre la correction du réglage du système ; celui-ci non.
               */
              if (e.detail > 1) {
                e.preventDefault()
                return
              }

              // Dernier filet : une étape précédente a pu être vidée après coup, en revenant en
              // arrière. On les revérifie toutes, et l'envoi est annulé si l'une manque.
              const etapes = Array.from({ length: NB_ETAPES }, (_, i) => i + 1)
              if (validerEtapes(etapes) !== null) e.preventDefault()
            }}
          >
            {enCours ? 'Envoi en cours…' : 'Envoyer ma déclaration'}
          </Button>
        )}
      </div>
    </form>
  )
}

function Erreur({ message }: { message: string }) {
  return (
    <p role="alert" className="text-caption text-destructive">
      {message}
    </p>
  )
}

function ChampTexte({
  nom,
  libelle,
  obligatoire,
  erreur,
}: {
  nom: string
  libelle: string
  obligatoire?: boolean
  erreur?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nom}>
        {libelle} {obligatoire && <span className="text-destructive">*</span>}
      </Label>
      <Input id={nom} name={nom} required={obligatoire} />
      {erreur && <Erreur message={erreur} />}
    </div>
  )
}

function ChampSelect({
  nom,
  libelle,
  obligatoire,
  options,
  valeur,
  onChange,
  erreur,
}: {
  nom: string
  libelle: string
  obligatoire?: boolean
  options: Option[]
  valeur?: string
  onChange?: (v: string) => void
  erreur?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nom}>
        {libelle} {obligatoire && <span className="text-destructive">*</span>}
      </Label>
      <select
        id={nom}
        name={nom}
        required={obligatoire}
        value={valeur}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— Sélectionner —</option>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      {erreur && <Erreur message={erreur} />}
    </div>
  )
}

function ChampFormulaire({
  champ,
  erreur,
  directions,
}: {
  champ: Champ
  erreur?: string
  directions: Option[]
}) {
  const obligatoire = champ.obligatoire === true || champ.obligatoire === 'siIdentifie'

  if (champ.type === 'case') {
    return (
      <div className="space-y-1.5">
        <label className="flex items-start gap-3">
          <input type="checkbox" name={champ.nom} className="mt-0.5" required={obligatoire} />
          <span>
            <span className="block text-sm text-secondary-900">
              {champ.libelle} {obligatoire && <span className="text-destructive">*</span>}
            </span>
            {champ.aide && <span className="block text-caption text-muted-foreground">{champ.aide}</span>}
          </span>
        </label>
        {erreur && <Erreur message={erreur} />}
      </div>
    )
  }

  if (champ.type === 'select') {
    return (
      <ChampSelect
        nom={champ.nom}
        libelle={champ.libelle}
        obligatoire={obligatoire}
        options={champ.referentiel === 'directions' ? directions : [...(champ.options ?? [])]}
        erreur={erreur}
      />
    )
  }

  if (champ.type === 'zone') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={champ.nom}>
          {champ.libelle} {obligatoire && <span className="text-destructive">*</span>}
        </Label>
        <textarea
          id={champ.nom}
          name={champ.nom}
          rows={3}
          required={obligatoire}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {champ.aide && <p className="text-caption text-muted-foreground">{champ.aide}</p>}
        {erreur && <Erreur message={erreur} />}
      </div>
    )
  }

  const typeHtml =
    champ.type === 'date'
      ? 'date'
      : champ.type === 'datetime'
        ? 'datetime-local'
        : champ.type === 'email'
          ? 'email'
          : champ.type === 'tel'
            ? 'tel'
            : champ.type === 'nombre'
              ? 'number'
              : 'text'

  return (
    <div className="space-y-1.5">
      <Label htmlFor={champ.nom}>
        {champ.libelle} {obligatoire && <span className="text-destructive">*</span>}
      </Label>
      <Input id={champ.nom} name={champ.nom} type={typeHtml} required={obligatoire} />
      {champ.aide && <p className="text-caption text-muted-foreground">{champ.aide}</p>}
      {erreur && <Erreur message={erreur} />}
    </div>
  )
}
