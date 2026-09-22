'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { compresserLot } from '@/lib/compression-images'
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
   * Horodatage d'affichage SIGNÉ par le serveur (DT-14) — voir `auth/horodatage-signe.ts`.
   *
   * ⚠️ Le formulaire ne le lit pas, ne le recalcule pas et ne le comprend pas : il le renvoie tel
   * quel. C'est ce qui rend le délai minimal de remplissage vérifiable — la valeur était
   * auparavant posée par le navigateur, donc forgeable.
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
 * Il ne mesure pas un intervalle de double-clic — celui-là dépend du réglage du système. Il mesure
 * le temps qu'il faut à un œil pour prendre acte d'un bouton qui vient d'apparaître : en deçà,
 * l'activation visait ce qui occupait la place avant, c'est-à-dire « Continuer ».
 */
const DELAI_ARMEMENT_ENVOI = 700

/*
 * La description est obligatoire, et sans aucune borne de longueur.
 *
 * Le plancher de 20 caractères de RGI-02 a été levé le 08/09/2026 — « Fuite gaz zone B » est un
 * signalement recevable. Le plafond de 200 caractères et son compteur ont suivi le 11/09 (G1) :
 * compter les signes de quelqu'un qui décrit un accident le pousse à en dire moins, alors que
 * c'est le moment où l'on veut qu'il en dise plus.
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
  const viaRelais = canauxRelais.length > 0
  /**
   * L'étape affichée, et le nombre de déplacements demandés.
   *
   * Le compteur n'est pas décoratif : redemander l'étape où l'on se trouve déjà — ce que fait
   * `validerEtapes()` quand le champ fautif appartient à l'étape courante — doit tout de même
   * replacer le curseur. Sans lui, l'état ne changerait pas et l'effet de focus ne s'exécuterait
   * pas.
   */
  const [{ etape, deplacements }, setPosition] = useState({ etape: 1, deplacements: 0 })
  const allerA = (numero: number) => {
    // Tout déplacement désarme l'envoi — y compris un retour vers l'étape 4, qui doit se mériter
    // à nouveau. Le désarmement est posé ici, dans le geste, plutôt que dans l'effet qui arme :
    // un effet n'a pas à modifier l'état qu'il observe.
    setEnvoiArme(false)
    setPosition((p) => ({ etape: numero, deplacements: p.deplacements + 1 }))
  }
  /*
    ⚠️ L'HORODATAGE ANTI-ROBOT VIENT DU SERVEUR, ET IL EST SIGNÉ (DT-14).

    Il était posé ICI, au montage, côté client — et le commentaire d'alors l'assumait : « un robot
    peut forger cette valeur ». C'était vrai, et cela rendait le délai minimal de trois secondes
    inopérant : il suffisait de poster « maintenant − 10 ».

    La raison invoquée à l'époque — calculer l'heure pendant le rendu rendrait le composant
    serveur impur — ne tient plus : la page est en `force-dynamic`, précisément pour que cet
    horodatage soit frais. Il est donc produit et signé au rendu, et le formulaire le renvoie tel
    quel sans le comprendre.

    Voir `server/auth/horodatage-signe.ts` pour ce que la signature ferme, et ce qu'elle ne ferme
    pas.
  */
  const [anonymat, setAnonymat] = useState(false)
  const [categorieId, setCategorieId] = useState('')
  /**
   * Valeurs des champs dont d'autres dépendent — aujourd'hui la seule direction.
   *
   * Le formulaire est non contrôlé partout ailleurs ; ces valeurs-là doivent l'être, parce
   * qu'elles décident du CONTENU d'une autre liste. Changer de direction vide le poste choisi :
   * garder un poste qui n'appartient plus à la direction retenue enverrait au serveur une
   * combinaison qui n'existe pas.
   */
  const [valeursPilotes, setValeursPilotes] = useState<Record<string, string>>({})

  /**
   * Erreurs détectées dans le navigateur, avant tout aller-retour serveur.
   *
   * Elles COMPLÈTENT `etat.erreurs` (le retour du serveur) sans jamais s'y substituer : la
   * validation du navigateur est un confort d'ergonomie, celle des Server Actions reste la seule
   * qui fasse autorité.
   */
  const [erreursClient, setErreursClient] = useState<Record<string, string>>({})
  const formulaireRef = useRef<HTMLFormElement>(null)
  /** Champ à focaliser au prochain déplacement, quand il ne s'agit pas du premier de l'étape. */
  const cibleFocus = useRef<HTMLElement | null>(null)
  /**
   * `false` tant que le bouton d'envoi n'a pas été affiché pour lui-même.
   *
   * Porté par l'attribut `disabled`, et non par un test dans le gestionnaire de clic : désarmé,
   * le bouton est alors inatteignable par TOUTES les routes d'activation — souris, clavier,
   * tactile, technologie d'assistance — et non par les seules que l'on a pensé à intercepter.
   */
  const [envoiArme, setEnvoiArme] = useState(false)
  /**
   * Où en est la réduction des images.
   *
   * `en-cours` barre l'envoi : partir pendant la réduction déposerait les fichiers d'origine —
   * exactement ce que la réduction cherche à éviter — et la course se gagnerait au hasard du
   * débit et de la taille des photos.
   */
  const [reduction, setReduction] = useState<'inactive' | 'en-cours'>('inactive')

  /*
    RGI-03 : les champs d'identité ne sont pas rendus du tout si l'anonymat est coché — pas
    seulement masqués en CSS, ils ne peuvent donc pas être soumis.

    ⚠️ La règle est appelée, pas recopiée. Elle vivait ici en double du serveur, sous forme d'un
    filtre écrit à la main ; un second motif de masquage l'a rendue fausse d'un côté seulement.
    Deux filtres, dont l'un décide de ce qui est RENDU et l'autre de ce qui est ACCEPTÉ, ne
    peuvent que finir par se contredire — et l'écart se lit alors comme un champ affiché puis
    refusé, ou, dans le mauvais sens, comme un champ masqué qu'on peut quand même soumettre.
  */
  const visibles = useMemo(() => champsVisibles(config, anonymat), [config, anonymat])

  /**
   * Un champ conditionnel est-il demandé, au vu de ce qui est coché ?
   *
   * ⚠️ Il n'est pas RENDU quand la condition ne tient pas, jamais seulement masqué en CSS : un
   * champ présent dans le DOM est un champ soumissible. Le serveur refait de toute façon le
   * contrôle — les deux verrous sont voulus — mais le premier évite d'envoyer des valeurs que
   * le second devra jeter.
   *
   * Une case non cochée n'ayant jamais été touchée n'est pas dans `valeursPilotes` : `?? false`
   * la traite comme décochée, ce qu'elle est à l'écran.
   */
  const conditionRemplie = (champ: Champ) =>
    champ.afficherSi === undefined ||
    (valeursPilotes[champ.afficherSi.champ] === 'true') === champ.afficherSi.vaut

  const categorieEstAutre = categoriesAutre.includes(categorieId)

  /**
   * Champs dont la valeur doit remonter à ce composant.
   *
   * Deux raisons de remonter, et une seule mécanique : soit un AUTRE champ dépend de celui-ci
   * (le poste dépend de la direction), soit le champ révèle sa propre saisie libre quand il vaut
   * « Autre ». Dans les deux cas il faut connaître sa valeur courante ; en tenir deux registres
   * séparés aurait dupliqué l'état sans rien y gagner.
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
   * Le curseur suit l'étape affichée.
   *
   * Deux raisons, dont une corrige un défaut. La bonne pratique d'abord : après un changement
   * d'étape, un utilisateur au clavier ou au lecteur d'écran doit se retrouver DANS ce qui vient
   * d'apparaître, pas sur le bouton qu'il vient de presser. Le défaut ensuite : rester sur ce
   * bouton, c'est garder le doigt sur la détente — une seconde pression sur Entrée atteignait
   * l'envoi (voir le bouton de soumission plus bas).
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
   * Le bouton d'envoi s'arme après coup, jamais à l'instant où il apparaît.
   *
   * Le minuteur part du RENDU de l'étape 4, pas du clic qui y a mené : sur un appareil lent, le
   * geste « il ne s'est rien passé, je reclique » arrive tard après le premier clic, mais tôt
   * après l'apparition du bouton. C'est cette seconde distance qui compte.
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
   * `DataTransfer` est le seul moyen d'écrire dans un `FileList`. S'il manque, on n'y touche pas :
   * ce sont alors les fichiers d'origine qui partent, plus lourds mais intacts. Une pièce non
   * réduite vaut mieux qu'une pièce perdue.
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
   * L'ordre compte : peser avant la réduction refuserait des lots que la réduction aurait rendus
   * acceptables — dix photos de téléphone dépassent les bornes à l'état brut, presque jamais une
   * fois réduites.
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
             * Le lot est pesé DANS LE NAVIGATEUR, avant l'envoi.
             *
             * Sans ce contrôle, un lot trop lourd part quand même : il est refusé après que tous
             * les octets ont été transmis — au mieux par le serveur, au pire par le plafond de
             * transport de la Server Action, dont le rejet ne produit aucun message que le
             * formulaire sache afficher. Sur un téléphone en 3G, c'est une longue attente pour
             * une erreur.
             *
             * `setCustomValidity` plutôt qu'un état à part : le message rejoint ainsi la
             * mécanique de `validerEtapes()`, qui affiche l'étape fautive et y pose le curseur,
             * et il barre l'envoi comme le ferait un champ obligatoire vide.
             *
             * La pesée a lieu APRÈS la réduction des images : c'est le lot réellement déposé qui
             * doit tenir dans les bornes, pas celui d'avant.
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
 * Un champ en cascade ne propose que les valeurs rattachées au parent choisi, et RIEN tant qu'il
 * ne l'est pas — proposer les postes de toute l'entreprise ferait une liste inutilisable et
 * laisserait choisir un poste incohérent avec la direction.
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
