type ActionCourriel = {
  libelle: string
  url: string
}

type GabaritCourriel = {
  titre: string
  preentete: string
  texte: string
  action?: ActionCourriel
  etiquette?: string
  lienPied?: ActionCourriel
}

import { originePublique } from '@/server/origine-publique'

function echapper(valeur: string): string {
  return valeur
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function lienSecurise(url: string): string {
  try {
    const valeur = new URL(url)
    return valeur.protocol === 'https:' || valeur.protocol === 'http:' ? valeur.href : '#'
  } catch {
    return '#'
  }
}

function mettreEnForme(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .map((bloc) => {
      const contenu = echapper(bloc.trim())
        .replace(
          /(https?:\/\/[^\s&<]+)/g,
          '<a href="$1" style="color:#08783e;font-weight:600;text-decoration:underline;word-break:break-all">$1</a>'
        )
        .replaceAll('\n', '<br>')

      return contenu ? `<p style="margin:0 0 16px;line-height:1.65">${contenu}</p>` : ''
    })
    .join('')
}

/**
 * Gabarit transactionnel commun à tous les courriels EI / MGP.
 *
 * Tables et styles en ligne sont volontaires : Outlook ignore encore une partie importante des
 * mises en page modernes. Le texte brut reste toujours envoyé en parallèle par Nodemailer.
 */
export function creerCourrielHtml(params: GabaritCourriel): string {
  const logo = `${originePublique()}/logo-sodeci.png`
  const action = params.action
    ? `<tr><td class="contenu" style="padding:4px 44px 32px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:8px;background:#08783e;box-shadow:0 3px 8px rgba(8,120,62,.18)">
          <a href="${echapper(lienSecurise(params.action.url))}" style="display:inline-block;padding:15px 24px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none">${echapper(params.action.libelle)}&nbsp;&nbsp;→</a>
        </td></tr></table>
      </td></tr>`
    : ''

  const etiquette = params.etiquette
    ? `<span style="display:inline-block;margin-bottom:16px;padding:6px 10px;border-radius:5px;background:#fff7d6;color:#715600;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${echapper(params.etiquette)}</span>`
    : ''

  const lienPied = params.lienPied
    ? `<div style="margin-bottom:16px;color:#42534b;font-size:13px;line-height:1.6">
        Vous souhaitez signaler une nouvelle situation ?
        <a href="${echapper(lienSecurise(params.lienPied.url))}" style="color:#08783e;font-weight:700;text-decoration:underline">${echapper(params.lienPied.libelle)}</a>
      </div>`
    : ''

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
  <style>@media only screen and (max-width:640px){.cadre{border-radius:0!important}.contenu{padding-left:24px!important;padding-right:24px!important}.logo{width:150px!important}.titre{font-size:23px!important}}</style>
</head>
<body style="margin:0;background:#f2f5f3;color:#1b2e25;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${echapper(params.preentete)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f2f5f3">
    <tr><td align="center" style="padding:34px 12px">
      <table class="cadre" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dce5df;border-radius:14px;overflow:hidden;box-shadow:0 8px 26px rgba(20,55,37,.08)">
        <tr><td style="height:6px;background:#d6a900;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="contenu" style="padding:25px 44px 23px;background:#ffffff;border-bottom:1px solid #e4ebe6">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle">
              <img class="logo" src="${echapper(logo)}" width="174" alt="SODECI" style="display:block;width:174px;max-width:100%;height:auto;border:0">
            </td>
            <td valign="middle" align="right" style="padding-left:18px;color:#08783e;font-size:12px;font-weight:700;line-height:1.45">PLATEFORME<br>EI / MGP</td>
          </tr></table>
        </td></tr>
        <tr><td class="contenu" style="padding:36px 44px 10px">
          ${etiquette}
          <h1 class="titre" style="margin:0 0 21px;color:#152d21;font-size:27px;font-weight:700;line-height:1.25">${echapper(params.titre)}</h1>
          <div style="color:#42534b;font-size:15px;line-height:1.65">${mettreEnForme(params.texte)}</div>
        </td></tr>
        ${action}
        <tr><td class="contenu" style="padding:24px 44px;background:#f7faf8;border-top:1px solid #e3ebe6;color:#6a7b72;font-size:12px;line-height:1.65">
          ${lienPied}
          <strong style="color:#42534b">SODECI — Plateforme EI / MGP</strong><br>
          Déclaration des plaintes et évènements indésirables<br><br>
          Ce message a été envoyé automatiquement. Merci de ne pas y répondre.<br>
          Pour votre sécurité, ne transmettez jamais un lien personnel ni vos identifiants.
        </td></tr>
        <tr><td style="height:5px;background:#08783e;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
