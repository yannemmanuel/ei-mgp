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
          '<a href="$1" style="color:#176b55;text-decoration:underline;word-break:break-all">$1</a>'
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
  const action = params.action
    ? `<tr><td style="padding:4px 40px 28px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:10px;background:#176b55">
          <a href="${echapper(lienSecurise(params.action.url))}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${echapper(params.action.libelle)}</a>
        </td></tr></table>
      </td></tr>`
    : ''

  const etiquette = params.etiquette
    ? `<span style="display:inline-block;margin-bottom:14px;padding:6px 10px;border-radius:999px;background:#fff5d6;color:#765500;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${echapper(params.etiquette)}</span>`
    : ''

  const lienPied = params.lienPied
    ? `<div style="margin-bottom:12px;color:#405b53;font-size:13px">
        Vous souhaitez signaler une nouvelle situation ?
        <a href="${echapper(lienSecurise(params.lienPied.url))}" style="color:#176b55;font-weight:700;text-decoration:underline">${echapper(params.lienPied.libelle)}</a>
      </div>`
    : ''

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f6f4;color:#17332b;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${echapper(params.preentete)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4">
    <tr><td align="center" style="padding:32px 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce7e2;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(23,51,43,.08)">
        <tr><td style="padding:24px 40px;background:#f8fbf9;border-bottom:4px solid #d5a800">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td style="width:46px;height:46px;border-radius:13px;background:#176b55;color:#ffffff;text-align:center;font-size:17px;font-weight:800">EI</td>
            <td style="padding-left:14px"><div style="font-size:18px;font-weight:800;color:#17332b">Plateforme EI / MGP</div><div style="margin-top:3px;color:#668078;font-size:12px">Écoute, traitement et amélioration continue</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:34px 40px 10px">
          ${etiquette}
          <h1 style="margin:0 0 20px;color:#17332b;font-size:25px;line-height:1.25">${echapper(params.titre)}</h1>
          <div style="color:#405b53;font-size:15px">${mettreEnForme(params.texte)}</div>
        </td></tr>
        ${action}
        <tr><td style="padding:22px 40px;background:#f8fbf9;border-top:1px solid #e6eeea;color:#71857f;font-size:12px;line-height:1.55">
          ${lienPied}
          Ce message a été envoyé automatiquement par la plateforme EI / MGP.<br>
          Pour votre sécurité, ne transmettez jamais un lien personnel ni vos identifiants.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
