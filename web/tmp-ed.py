import sys, json
def appliquer(chemin, remplacements):
    brut = open(chemin, 'rb').read().decode('utf-8')
    fin = '\r\n' if '\r\n' in brut else '\n'
    texte = brut.replace('\r\n', '\n')
    for avant, apres in remplacements:
        n = texte.count(avant)
        if n != 1:
            print(f'ECHEC {chemin}: motif trouve {n} fois'); sys.exit(1)
        texte = texte.replace(avant, apres)
    open(chemin, 'wb').write(texte.replace('\n', fin).encode('utf-8'))
    print(f'ok {chemin}')
spec = json.load(open(sys.argv[1], encoding='utf-8'))
for chemin, remplacements in spec.items():
    appliquer(chemin, [(r['avant'], r['apres']) for r in remplacements])
