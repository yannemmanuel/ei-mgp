'use client'

import { useActionState, useMemo, useState } from 'react'
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
}

const LIBELLES_ETAPES = ['Votre identité', 'Contexte', 'Nature de l’évènement', 'Pièces jointes']
const NB_ETAPES = 4
const ETAT_INITIAL: EtatSoumission = {}

export function FormulaireDeclaration({
  config,
  categories,
  categoriesAutre,
  niveauxGravite,
  directions,
}: Props) {
  const [etat, action, enCours] = useActionState(soumettreDeclaration, ETAT_INITIAL)
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
  const erreur = (nom: string) => etat.erreurs?.[nom]

  return (
    <form action={action} className="mx-auto max-w-2xl">
      <input type="hidden" name="parcours" value={config.code} />
      <input type="hidden" name="horodatageAffichage" value={horodatageAffichage} />
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
        {etape === 1 && (
          <>
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
                    Aucune donnée permettant de vous identifier ne sera collectée ni conservée.
                    Vous recevrez un code d’accès pour suivre votre dossier.
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
          </>
        )}

        {etape === 2 &&
          champsDe(2).map((champ) => (
            <ChampFormulaire key={champ.nom} champ={champ} erreur={erreur(champ.nom)} directions={directions} />
          ))}

        {etape === 3 && (
          <>
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
              <Label htmlFor="description">
                Description des faits <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="description"
                name="description"
                rows={5}
                required
                minLength={20}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-caption text-muted-foreground">Au moins 20 caractères.</p>
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
          </>
        )}

        {etape === 4 && (
          <div className="space-y-1.5">
            <Label htmlFor="fichiers">Pièces jointes</Label>
            <Input id="fichiers" name="fichiers" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf" />
            <p className="text-caption text-muted-foreground">
              5 fichiers maximum, 50 Mo au total. Images, vidéos ou PDF.
            </p>
            {erreur('fichiers') && <Erreur message={erreur('fichiers')!} />}
          </div>
        )}
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
          <Button type="button" onClick={() => setEtape((e) => Math.min(NB_ETAPES, e + 1))}>
            Continuer
          </Button>
        ) : (
          <Button type="submit" disabled={enCours}>
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
