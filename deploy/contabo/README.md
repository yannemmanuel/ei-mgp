# Déploiement Contabo

Cette cible exécute l'application directement avec Node.js 22, derrière Nginx et sous la
surveillance de systemd. PostgreSQL n'est ni créé, ni réinitialisé par cette procédure.

## Préparation unique du VPS

Sur Ubuntu 24.04, installer Git, Nginx, Certbot, PostgreSQL Client et Node.js 22, puis créer le
compte système et les répertoires :

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin ei-mgp
sudo mkdir -p /opt/ei-mgp /etc/ei-mgp /var/lib/ei-mgp/storage/private
sudo chown -R ei-mgp:ei-mgp /opt/ei-mgp /var/lib/ei-mgp
sudo chmod 750 /etc/ei-mgp /var/lib/ei-mgp
```

Cloner exclusivement `main` :

```bash
sudo -u ei-mgp git clone --branch main --single-branch \
  https://github.com/yannemmanuel/ei-mgp.git /opt/ei-mgp/current
```

Copier `variables-production.example` vers `/etc/ei-mgp/ei-mgp.env`, renseigner les valeurs puis
protéger le fichier :

```bash
sudo chown root:ei-mgp /etc/ei-mgp/ei-mgp.env
sudo chmod 640 /etc/ei-mgp/ei-mgp.env
```

La clé Resend doit être une nouvelle clé, l'ancienne ayant été exposée dans une sortie de test.

## Première installation

```bash
cd /opt/ei-mgp/current
sudo -u ei-mgp npm ci
sudo -u ei-mgp npm run build
```

Avant toute évolution de la base existante, faire une sauvegarde :

```bash
sudo -u ei-mgp bash -c 'set -a; source /etc/ei-mgp/ei-mgp.env; set +a; npm run sauvegarde'
sudo -u ei-mgp bash -c 'set -a; source /etc/ei-mgp/ei-mgp.env; set +a; npm run db:evolutions'
```

La seconde commande est volontairement en lecture seule. Examiner sa sortie avant d'utiliser
`npm run db:evolutions -- --appliquer`. Ne jamais exécuter `prisma migrate reset`, `db push` ou
`migrate dev` sur la production.

Installer ensuite le service :

```bash
sudo cp deploy/contabo/ei-mgp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ei-mgp
sudo systemctl status ei-mgp --no-pager
```

## Nginx et HTTPS

Dans `deploy/contabo/nginx.conf`, remplacer `VOTRE_DOMAINE`, puis :

```bash
sudo cp deploy/contabo/nginx.conf /etc/nginx/sites-available/ei-mgp
sudo ln -s /etc/nginx/sites-available/ei-mgp /etc/nginx/sites-enabled/ei-mgp
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d VOTRE_DOMAINE
```

Le DNS du domaine doit pointer vers l'adresse IPv4 publique du VPS avant Certbot. Le fichier
fourni démarre volontairement en HTTP : Certbot ajoute ensuite le bloc TLS et la redirection
HTTPS, sans que `nginx -t` dépende d'un certificat qui n'existe pas encore.

## Mise à jour sans perte de données

```bash
cd /opt/ei-mgp/current
sudo -u ei-mgp git fetch origin main
sudo -u ei-mgp git pull --ff-only origin main
sudo -u ei-mgp npm ci
sudo -u ei-mgp npm run build
sudo -u ei-mgp bash -c 'set -a; source /etc/ei-mgp/ei-mgp.env; set +a; npm run db:evolutions'
sudo systemctl restart ei-mgp
sudo systemctl status ei-mgp --no-pager
```

Appliquer les évolutions uniquement après sauvegarde et lecture de la liste annoncée. Les pièces
jointes restent dans `/var/lib/ei-mgp/storage/private`, hors du dépôt et hors des déploiements.

## Vérifications après ouverture

```bash
curl -I https://VOTRE_DOMAINE/login
curl -I https://VOTRE_DOMAINE/declarer
sudo journalctl -u ei-mgp -n 100 --no-pager
```

Tester ensuite manuellement : connexion, création d'une déclaration avec pièce jointe, suivi par
référence et code, création d'un compte et réception du courriel Resend.
