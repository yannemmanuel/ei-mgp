import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Après une action, les écrans qui montrent la donnée modifiée doivent se rafraîchir.
 *
 * ⚠️ LE DÉFAUT QUE CE FICHIER PROTÈGE : chaque action revalidait le seul écran d'où elle était
 * lancée. On changeait le statut d'un dossier, sa fiche se mettait à jour — puis on revenait à la
 * liste, qui affichait encore l'ancien statut. Le retour reçu était « les pages ne sont pas
 * souvent mises à jour après une action » : souvent, et non toujours, parce que l'écran d'origine
 * se rafraîchissait bien.
 *
 * Les deux moitiés de la correction sont tenues ici : les actions passent par le point unique, et
 * ce point nomme vraiment tous les écrans concernés.
 */
const RACINE_ACTIONS = join(process.cwd(), 'src', 'app')

function fichiersDActions(): string[] {
  const parcourir = (depuis: string): string[] =>
    readdirSync(depuis).flatMap((entree) => {
      const chemin = join(depuis, entree)
      if (statSync(chemin).isDirectory()) {
        return entree === '__tests__' ? [] : parcourir(chemin)
      }
      return /actions[^/]*\.ts$/.test(entree) ? [chemin] : []
    })

  return parcourir(RACINE_ACTIONS).filter((f) => readFileSync(f, 'utf8').includes("'use server'"))
}

describe('⚠️ Les actions d’un dossier rafraîchissent TOUS les écrans concernés', () => {
  it('passent par le point unique, jamais par un chemin écrit à la main', () => {
    /*
      Une action qui énumère ses propres chemins finit par en oublier un le jour où un écran se
      met à lire la même donnée — et l'oubli ne se voit pas : la page affiche simplement quelque
      chose d'ancien, sans erreur, sans trace.
    */
    const enFaute: string[] = []

    for (const fichier of fichiersDActions()) {
      const source = readFileSync(fichier, 'utf8')

      if (/revalidatePath\(`\/dossiers\//.test(source)) {
        enFaute.push(fichier.replace(process.cwd(), '').replace(/\\/g, '/'))
      }
    }

    expect(
      enFaute,
      `ces actions revalident un dossier à la main au lieu d’appeler revaliderDossier() :\n  ${enFaute.join('\n  ')}`
    ).toEqual([])
  })

  it('⚠️ le point unique nomme la LISTE et le TABLEAU DE BORD, pas seulement la fiche', () => {
    // C'est précisément ce qui manquait. Sans ces deux lignes, la correction serait purement
    // cosmétique : le point serait unique, et toujours incomplet.
    const source = readFileSync(join(process.cwd(), 'src', 'server', 'revalidation.ts'), 'utf8')
    const corps = source.slice(source.indexOf('export function revaliderDossier'))

    for (const chemin of ['/dossiers', '/dashboard', '/investigations', '/actions-correctives']) {
      expect(corps, `« ${chemin} » n’est plus revalidé après un changement de dossier`).toContain(
        `revalidatePath('${chemin}')`
      )
    }

    expect(corps, 'la fiche elle-même n’est plus revalidée').toContain('`/dossiers/${dossierId}`')
  })

  it('⚠️ un changement d’habilitation rafraîchit ce que les gens VOIENT', () => {
    /*
      Cocher un type de déclaration sur un rôle change le périmètre de tous ses porteurs : leurs
      listes et leur tableau de bord. Ne revalider que l'écran des habilitations laissait ces
      pages annoncer un périmètre qui n'était plus le bon.
    */
    const source = readFileSync(join(process.cwd(), 'src', 'server', 'revalidation.ts'), 'utf8')
    const corps = source.slice(
      source.indexOf('export function revaliderHabilitations'),
      source.indexOf('export function revaliderComptes')
    )

    for (const chemin of ['/administration/utilisateurs', '/dossiers', '/dashboard']) {
      expect(corps, `« ${chemin} » n’est pas rafraîchi après un changement d’habilitation`).toContain(
        chemin
      )
    }
  })
})

describe('⚠️ Toute action serveur revalide quelque chose', () => {
  it('n’en laisse aucune modifier sans rafraîchir, sauf à rediriger', () => {
    /*
      Une action qui écrit sans revalider laisse l'écran sur ses anciennes données — le symptôme
      exact qui a été remonté.

      ⚠️ DEUX EXCEPTIONS LÉGITIMES, et elles sont nommées : une action qui REDIRIGE emmène sur une
      page rendue à neuf, et une action qui rafraîchit elle-même par `router.refresh()` côté
      client n'a pas besoin du cache serveur. Les taire en bloc aurait vidé ce cas de son sens.
    */
    const sansRafraichissement: string[] = []

    for (const fichier of fichiersDActions()) {
      const source = readFileSync(fichier, 'utf8')
      const nom = fichier.replace(process.cwd(), '').replace(/\\/g, '/')

      const ecrit = /export async function action/.test(source)
      if (!ecrit) continue

      const rafraichit =
        /revalidatePath\(/.test(source) ||
        /revalider(Dossier|Habilitations|Comptes)\(/.test(source) ||
        /redirect\(/.test(source)

      if (!rafraichit) sansRafraichissement.push(nom)
    }

    /*
      Deux exceptions, nommées une par une plutôt que tolérées en bloc :

        - la cloche de notifications appelle `router.refresh()` elle-même, le compteur vivant
          dans la coquille et non dans une page ;
        - la première connexion est une page à usage unique : elle rend la main au client, qui
          renvoie vers la connexion. Il n'y a aucune liste derrière à rafraîchir.
    */
    const tolerees = [
      '/src/app/(app)/notifications-actions.ts',
      '/src/app/(auth)/premiere-connexion/[jeton]/actions.ts',
    ]

    expect(
      sansRafraichissement.filter((f) => !tolerees.includes(f)),
      'ces actions écrivent sans rien rafraîchir'
    ).toEqual([])
  })
})
