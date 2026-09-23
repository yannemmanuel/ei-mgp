'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { compresserLot } from '@/lib/compression-images'
import { useRetourEnToast } from '@/lib/retour-operation'
import {
  MAX_FICHIERS,
  MAX_MEGAOCTETS_TOTAL,
  verifierLotSuperficiellement,
} from '@/lib/limites-pieces-jointes'
import {
  champsVisibles,
  type Champ,
  type ParcoursConfig,
} from '@/server/services/declaration/parcours-config'
import { soumettreDeclaration, type EtatSoumission } from './actions'
import { Recepisse } from './recepisse'

type Option = { valeur: string; libelle: string }

/** Une option qui n'apparaît que sous un parent donné — un poste sous sa direction. */
type OptionLiee = Option & { parent: string }

/**
 * Les listes administrables qui alimentent les formulaires.
 *
 * Regroupées plutôt que passées une par une : quatre nouvelles listes en props séparées auraient
 * fait une signature que personne ne relit.
 */
export type Referentiels = {
  directions: Option[]
  postes: OptionLiee[]
  lieux: Option[]
  villes: Option[]
}

type Props = {
  config: ParcoursConfig
  categories: Option[]
  categoriesAutre: string[]
  niveauxGravite: Option[]
  referentiels: Referentiels
  /**
   * Horodatage d'affichage signé par le serveur (DT-14).
   *
   * ⚠️ Renvoyé tel quel, jamais lu ni recalculé : c'est ce qui rend le délai minimal de
   * remplissage vérifiable. Posé par le navigateur, il était forgeable.
   */
  horodatageSigne: string
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

/**
 * Délai pendant lequel « Envoyer ma déclaration » reste inerte après son apparition (ms).
 *
 * Mesure le temps qu'il faut pour prendre acte d'un bouton qui vient d'apparaître : en deçà,
 * l'activation visait « Continuer », qui occupait la place. Pas un intervalle de double-clic,
 * qui dépendrait du réglage du système.
 */
const DELAI_ARMEMENT_ENVOI = 700

/*
 * La description est obligatoire et sans borne de longueur : « Fuite gaz zone B » est un
 * signalement recevable, et compter les signes de quelqu'un qui décrit un accident le pousse à
 * en dire moins (RGI-02, révisée les 08 et 11/09/2026).
 */
const ETAT_INITIAL: EtatSoumission = {}

export function FormulaireDeclaration({
  config,
  categories,
  categoriesAutre,
  niveauxGravite,
  referentiels,
  horodatageSigne,
  soumettre = soumettreDeclaration,
  canauxRelais = [],
}: Props) {
  const [etat, action, enCours] = useActionState(soumettre, ETAT_INITIAL)

  /*
   * Seule l'erreur GÉNÉRALE part en notification ; les erreurs de champ restent sous le champ à
   * corriger. `useMemo` indexé sur `etat` : un objet neuf à chaque rendu ferait revenir la
   * notification sans qu'aucun envoi n'ait eu lieu.
   */
  useRetourEnToast(useMemo(() => ({ erreur: etat.erreurGenerale }), [etat]))
  const viaRelais = canauxRelais.length > 0
  /**
   * L'étape affichée, et le nombre de déplacements demandés.
   *
   * Le compteur sert à replacer le curseur quand on redemande l'étape courante — ce que fait
   * `validerEtapes()` : sans lui l'état ne changerait pas, et l'effet de focus non plus.
   */
  const [{ etape, deplacements }, setPosition] = useState({ etape: 1, deplacements: 0 })
  const allerA = (numero: number) => {
    // Tout déplacement désarme l'envoi — y compris un retour vers l'étape 4, qui doit se mériter
    // à nouveau. Le désarmement est posé ici, dans le geste, plutôt que dans l'effet qui arme :
    // un effet n'a pas à modifier l'état qu'il observe.
    setEnvoiArme(false)
    setPosition((p) => ({ etape: numero, deplacements: p.deplacements + 1 }))
  }
  const [anonymat, setAnonymat] = useState(false)
  const [categorieId, setCategorieId] = useState('')
  /**
   * Valeurs des champs dont d'autres dépendent — aujourd'hui la seule direction.
   *
   * Contrôlées, à la différence du reste du formulaire, parce qu'elles décident du contenu d'une
   * autre liste : changer de direction vide le poste, qui n'y appartiendrait plus.
   */
  const [valeursPilotes, setValeursPilotes] = useState<Record<string, string>>({})

  /**
   * Erreurs détectées dans le navigateur, avant tout aller-retour serveur.
   *
   * Complètent `etat.erreurs` sans s'y substituer : la validation du navigateur est un confort,
   * celle des Server Actions fait seule autorité.
   */
  const [erreursClient, setErreursClient] = useState<Record<string, string>>({})
  const formulaireRef = useRef<HTMLFormElement>(null)
  /** Champ à focaliser au prochain déplacement, quand il ne s'agit pas du premier de l'étape. */
  const cibleFocus = useRef<HTMLElement | null>(null)
  /**
   * `false` tant que le bouton d'envoi n'a pas été affiché pour lui-même.
   *
   * Porté par `disabled` plutôt que par un test dans le gestionnaire de clic : désarmé, le bouton
   * est inatteignable par TOUTES les routes d'activation, pas seulement celles qu'on intercepte.
   */
  const [envoiArme, setEnvoiArme] = useState(false)
  /** `en-cours` barre l'envoi : partir maintenant déposerait les fichiers d'origine. */
  const [reduction, setReduction] = useState<'inactive' | 'en-cours'>('inactive')

  /*
    RGI-03 : en anonymat, les champs d'identité ne sont pas rendus du tout — donc pas soumissibles.

    ⚠️ La règle est APPELÉE, jamais recopiée : deux filtres, l'un décidant de ce qui est rendu et
    l'autre de ce qui est accepté, finissent par se contredire.
  */
  const visibles = useMemo(() => champsVisibles(config, anonymat), [config, anonymat])

  /**
   * Un champ conditionnel est-il demandé, au vu de ce qui est coché ?
   *
   * ⚠️ Non RENDU quand la condition ne tient pas, jamais seulement masqué : un champ présent dans
   * le DOM est soumissible. Le serveur refait le contrôle — les deux verrous sont voulus.
   *
   * `?? false` : une case jamais touchée n'est pas dans `valeursPilotes`, et vaut décochée.
   */
  const conditionRemplie = (champ: Champ) =>
    champ.afficherSi === undefined ||
    (valeursPilotes[champ.afficherSi.champ] === 'true') === champ.afficherSi.vaut

  const categorieEstAutre = categoriesAutre.includes(categorieId)

  /**
   * Champs dont la valeur doit remonter ici : un autre champ en dépend, ou il révèle sa propre
   * saisie libre sur « Autre ». Un seul registre pour les deux cas.
   */
  const pilotes = useMemo(() => {
    const noms = new Set<string>()

    for (const c of config.champs) {
      if (c.dependDe !== undefined) noms.add(c.dependDe)
      if (c.precisionSi) noms.add(c.nom)
      // La case « Je suis la personne concernée » commande l'apparition du rattachement du
      // déclarant : son état doit donc remonter, au même titre qu'une liste dont une autre dépend.
      if (c.afficherSi) noms.add(c.afficherSi.champ)
    }

    return noms
  }, [config])

  /*
   * Le curseur suit l'étape affichée : au clavier comme au lecteur d'écran, on doit se retrouver
   * DANS ce qui vient d'apparaître. Rester sur le bouton, c'était aussi garder le doigt sur la
   * détente — une seconde pression sur Entrée atteignait l'envoi.
   *
   * `deplacements` et non `etape` en dépendance : voir sa déclaration.
   */
  useEffect(() => {
    if (deplacements === 0) return // montage : ne pas arracher le curseur au chargement de la page

    const conteneur = formulaireRef.current?.querySelector<HTMLElement>(`[data-etape="${etape}"]`)
    const aFocaliser =
      cibleFocus.current ??
      conteneur?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea'
      ) ??
      null

    cibleFocus.current = null
    aFocaliser?.focus()
  }, [deplacements, etape])

  /*
   * Le minuteur part du RENDU de l'étape 4, pas du clic qui y a mené : sur un appareil lent, le
   * geste « il ne s'est rien passé, je reclique » arrive tôt après l'apparition du bouton.
   */
  useEffect(() => {
    if (etape !== NB_ETAPES) return

    const minuteur = setTimeout(() => setEnvoiArme(true), DELAI_ARMEMENT_ENVOI)
    return () => clearTimeout(minuteur)
  }, [etape, deplacements])

  if (etat.succes) {
    return <Recepisse reference={etat.succes.reference} codeAcces={etat.succes.codeAcces} />
  }

  const champsDe = (n: number) =>
    visibles.filter((c) => c.etape === n && conditionRemplie(c))

  // Le serveur fait autorité : son message l'emporte sur celui du navigateur pour un même champ.
  const erreur = (nom: string) => etat.erreurs?.[nom] ?? erreursClient[nom]

  /**
   * Vérifie les champs d'une ou plusieurs étapes, et renvoie la première en défaut.
   *
   * `checkValidity()` marche sur un champ masqué, `reportValidity()` non : on collecte donc les
   * messages soi-même et on affiche l'étape fautive avant de donner le focus.
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
      // Le focus n'est pas posé ici : viser un champ encore masqué, que le navigateur refuse de
      // focaliser. Il est confié au déplacement, qui l'applique une fois l'étape fautive rendue.
      cibleFocus.current = premierChampInvalide
      allerA(premiereEnDefaut)
    }

    return premiereEnDefaut
  }

  function continuer() {
    if (validerEtapes([etape]) !== null) return
    allerA(Math.min(NB_ETAPES, etape + 1))
  }

  /**
   * Remplace le contenu du champ fichier par les images réduites.
   *
   * `DataTransfer` est le seul moyen d'écrire dans un `FileList`. Absent, on n'y touche pas : une
   * pièce non réduite vaut mieux qu'une pièce perdue.
   */
  function remplacerFichiers(champ: HTMLInputElement, fichiers: File[]) {
    if (typeof DataTransfer !== 'function') return

    const transfert = new DataTransfer()
    for (const fichier of fichiers) transfert.items.add(fichier)
    champ.files = transfert.files
  }

  /**
   * Réduit les images choisies, puis pèse le lot RÉELLEMENT déposé.
   *
   * L'ordre compte : peser avant refuserait des lots que la réduction aurait rendus acceptables.
   */
  async function reduirePuisVerifier(champ: HTMLInputElement) {
    const choisis = Array.from(champ.files ?? [])

    if (choisis.length === 0) {
      champ.setCustomValidity('')
      return
    }

    setReduction('en-cours')

    try {
      remplacerFichiers(champ, await compresserLot(choisis))
    } finally {
      setReduction('inactive')
    }

    // Ce qui est pesé est ce que contient le champ : si le remplacement n'a pas pu avoir lieu, ce
    // sont les fichiers d'origine qui partiront, et ce sont eux qui doivent tenir dans les bornes.
    champ.setCustomValidity(verifierLotSuperficiellement(Array.from(champ.files ?? [])) ?? '')
  }

  return (
    <form
      ref={formulaireRef}
      action={action}
      /*
       * `noValidate` : la validation native est remplacée, pas supprimée. Les étapes restant
       * toutes montées, le navigateur bloquerait l'envoi sur un champ masqué qu'il ne peut pas
       * focaliser — sans aucun message. `validerEtapes()` reprend le contrôle étape par étape.
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
      {/*
        Renvoyé VERBATIM : le client ne le lit ni ne le recalcule. Plus d'écart d'hydratation à
        taire — la valeur est la même au rendu serveur et à l'hydratation, puisqu'elle vient du
        serveur.
      */}
      <input type="hidden" name="horodatageAffichage" value={horodatageSigne} />
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
              erreurPrecision={erreur(`${champ.nom}Precision`)}
              referentiels={referentiels}
              valeursPilotes={valeursPilotes}
              onPilote={(nom, valeur) => setValeursPilotes((v) => ({ ...v, [nom]: valeur }))}
              pilote={pilotes.has(champ.nom)}
            />
          ))}
        </div>

        <div data-etape={2} className={etape === 2 ? 'space-y-5' : 'hidden'}>
          {champsDe(2).map((champ) => (
            <ChampFormulaire
              key={champ.nom}
              champ={champ}
              erreur={erreur(champ.nom)}
              erreurPrecision={erreur(`${champ.nom}Precision`)}
              referentiels={referentiels}
              valeursPilotes={valeursPilotes}
              onPilote={(nom, valeur) => setValeursPilotes((v) => ({ ...v, [nom]: valeur }))}
              pilote={pilotes.has(champ.nom)}
            />
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

          {/* L'EI ne la demande plus : elle est qualifiée au traitement (EI8). */}
          {config.graviteSaisieParLeDeclarant && (
            <ChampSelect
              nom="niveauGraviteId"
              libelle="Niveau de gravité"
              obligatoire
              options={niveauxGravite}
              erreur={erreur('niveauGraviteId')}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description des faits <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="description"
              name="description"
              rows={5}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-caption text-muted-foreground">
              Décrivez les faits aussi longuement que nécessaire.
            </p>
            {erreur('description') && <Erreur message={erreur('description')!} />}
          </div>

          {champsDe(3).map((champ) => (
            <ChampFormulaire
              key={champ.nom}
              champ={champ}
              erreur={erreur(champ.nom)}
              erreurPrecision={erreur(`${champ.nom}Precision`)}
              referentiels={referentiels}
              valeursPilotes={valeursPilotes}
              onPilote={(nom, valeur) => setValeursPilotes((v) => ({ ...v, [nom]: valeur }))}
              pilote={pilotes.has(champ.nom)}
            />
          ))}

          {/* Propre aux griefs : l'EI ne demande pas au déclarant ce qu'il attend (EI10). */}
          {config.attentesDeclarant && (
            <ChampTexte
              nom="attentesDeclarant"
              libelle="Vos attentes"
              erreur={erreur('attentesDeclarant')}
            />
          )}
        </div>

        <div data-etape={4} className={etape === 4 ? 'space-y-1.5' : 'hidden'}>
          <Label htmlFor="fichiers">Pièces jointes</Label>
          <Input
            id="fichiers"
            name="fichiers"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf"
            /*
             * Le lot est pesé dans le navigateur, APRÈS la réduction : sinon il n'est refusé
             * qu'une fois tous les octets transmis, et le plafond de transport de la Server
             * Action rejette sans message affichable.
             *
             * `setCustomValidity` plutôt qu'un état à part : le message rejoint `validerEtapes()`
             * et barre l'envoi comme un champ obligatoire vide.
             */
            onChange={(e) => reduirePuisVerifier(e.currentTarget)}
          />
          <p className="text-caption text-muted-foreground">
            {MAX_FICHIERS} fichiers maximum, {MAX_MEGAOCTETS_TOTAL} Mo au total. Images, vidéos ou
            PDF. Les photos sont réduites automatiquement avant l’envoi.
          </p>
          {reduction === 'en-cours' && (
            <p role="status" className="text-caption text-muted-foreground">
              Réduction des images en cours…
            </p>
          )}
          {erreur('fichiers') && <Erreur message={erreur('fichiers')!} />}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => allerA(Math.max(1, etape - 1))}
          disabled={etape === 1}
        >
          Précédent
        </Button>

        {/*
          Un envoi ne peut pas être déclenché par le geste qui vient de le faire apparaître.

          « Continuer » et « Envoyer ma déclaration » occupent la même place : à la dernière étape,
          le premier cède la place au second. Toute répétition du geste d'activation — double-clic,
          seconde pression sur Entrée, « il ne s'est rien passé, je reclique » — atteint donc
          l'envoi, et l'étape des pièces jointes est franchie sans avoir été vue. C'est le défaut
          signalé, reproduit puis figé par des tests, geste par geste.

          Trois dispositions distinctes le referment, aucune ne suffisant seule :

          1. `key` — les deux boutons ne partagent plus leur nœud du DOM. React remplaçait
             l'attribut `type` sur place, et le bouton d'envoi héritait ainsi du FOCUS de
             « Continuer » : une seconde pression sur Entrée envoyait la déclaration. Deux clés
             distinctes en font deux éléments, et le focus ne se transmet plus.
          2. `envoiArme` — désarmé pendant un court instant après son apparition, le bouton est
             inatteignable par toutes les routes d'activation à la fois (voir sa déclaration).
             C'est la seule qui couvre le pointeur : la souris, elle, ne suit pas le focus, et le
             second clic tombe sur les mêmes coordonnées quel que soit le nœud qui s'y trouve.
          3. `e.detail` — une rafale de clics reste une rafale même passé le délai d'armement, si
             le système est réglé sur un intervalle long. Au-delà de 1, le clic appartient au geste
             précédent.
        */}
        {etape < NB_ETAPES ? (
          <Button key="continuer" type="button" onClick={continuer}>
            Continuer
          </Button>
        ) : (
          <Button
            key="envoyer"
            type="submit"
            disabled={enCours || !envoiArme || reduction === 'en-cours'}
            onClick={(e) => {
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
  aide,
  desactive = false,
}: {
  nom: string
  libelle: string
  obligatoire?: boolean
  options: Option[]
  valeur?: string
  onChange?: (v: string) => void
  erreur?: string
  aide?: string
  desactive?: boolean
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
        disabled={desactive}
        value={valeur}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">— Sélectionner —</option>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      {aide && <p className="text-caption text-muted-foreground">{aide}</p>}
      {erreur && <Erreur message={erreur} />}
    </div>
  )
}

/**
 * Les options d'un select : liste figée de la configuration, ou référentiel administrable.
 *
 * Un champ en cascade ne propose que les valeurs du parent choisi, et rien tant qu'il ne l'est
 * pas — sans quoi on pourrait retenir un poste incohérent avec la direction.
 */
function optionsDe(champ: Champ, referentiels: Referentiels, parent: string | null): Option[] {
  if (champ.referentiel === undefined) return [...(champ.options ?? [])]

  if (champ.referentiel === 'postes') {
    if (parent === null || parent === '') return []
    return referentiels.postes.filter((poste) => poste.parent === parent)
  }

  return referentiels[champ.referentiel]
}

function ChampFormulaire({
  champ,
  erreur,
  erreurPrecision,
  referentiels,
  valeursPilotes,
  onPilote,
  pilote,
}: {
  champ: Champ
  erreur?: string
  /** Erreur portant sur la saisie libre d'un « Autre », rattachée à `<champ>Precision`. */
  erreurPrecision?: string
  referentiels: Referentiels
  /** Valeurs des champs dont d'autres dépendent, par nom de champ. */
  valeursPilotes: Record<string, string>
  onPilote: (nom: string, valeur: string) => void
  /** Un autre champ de ce formulaire dépend de celui-ci : sa valeur doit être remontée. */
  pilote: boolean
}) {
  const obligatoire = champ.obligatoire === true || champ.obligatoire === 'siIdentifie'

  if (champ.type === 'case') {
    return (
      <div className="space-y-1.5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name={champ.nom}
            className="mt-0.5"
            required={obligatoire}
            // Remontée seulement quand un autre champ en dépend : ailleurs, le formulaire reste
            // non contrôlé, et c'est ce qui préserve les saisies entre les étapes.
            onChange={
              pilote ? (e) => onPilote(champ.nom, e.target.checked ? 'true' : 'false') : undefined
            }
          />
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
    const parent = champ.dependDe ? (valeursPilotes[champ.dependDe] ?? '') : null
    // « Autre » appelle une saisie libre : elle n'apparaît que sur cette valeur-là.
    const precisionOuverte =
      champ.precisionSi !== undefined &&
      (valeursPilotes[champ.nom] ?? '') === champ.precisionSi.valeur

    return (
      <>
        <ChampSelect
          nom={champ.nom}
          libelle={champ.libelle}
          obligatoire={obligatoire}
          options={optionsDe(champ, referentiels, parent)}
          erreur={erreur}
          aide={champ.aide}
          // Tant que la direction n'est pas choisie, la liste est vide : la désactiver le dit, là
          // où une liste vide et cliquable laisse croire qu'aucun poste n'existe.
          desactive={parent === ''}
          onChange={pilote ? (valeur) => onPilote(champ.nom, valeur) : undefined}
        />

        {/*
          Rendue SEULEMENT quand « Autre » est retenu, jamais masquée en CSS.

          Un champ présent dans le DOM est un champ soumissible : le garder caché laisserait
          partir la saisie d'un « Autre » qu'on vient d'abandonner pour un poste de la liste. Le
          serveur l'écarte aussi de son côté — les deux verrous sont voulus.
        */}
        {precisionOuverte && champ.precisionSi && (
          <ChampTexte
            nom={`${champ.nom}Precision`}
            libelle={champ.precisionSi.libelle}
            obligatoire
            erreur={erreurPrecision}
          />
        )}
      </>
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
