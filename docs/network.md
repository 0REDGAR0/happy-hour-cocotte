# Acces reseau stable

Le serveur Node ecoute sur `0.0.0.0` et peut afficher des URLs locales, mais il
ne peut pas imposer seul une IP fixe au reseau. L'adresse IP est attribuee par
la box, le routeur, le hotspot ou la configuration de l'appareil.

## Methode recommandee : reservation DHCP

Sur la box, le routeur ou le hotspot :

1. Trouver l'appareil qui lance le serveur Cocotte dans la liste des appareils connectes.
2. Copier son adresse MAC.
3. Ajouter une reservation DHCP vers une IP stable, par exemple `192.168.1.50`.
4. Redemarrer la connexion Wi-Fi de l'appareil ou renouveler son bail DHCP.
5. Configurer l'application avec :

```env
APP_PORT=3000
PUBLIC_BASE_URL=http://192.168.1.50:3000
```

`PUBLIC_BASE_URL` ne fixe pas l'IP. Il indique seulement au serveur quelle URL
stable afficher dans `/admin` et `/api/server-info`.

## Alternative : IP statique cote appareil

Si Android, Windows ou le systeme qui heberge le serveur le permet, configurer
une IP statique directement dans les reglages Wi-Fi de l'appareil. Il faut
choisir une adresse libre dans le meme reseau que la box ou le hotspot, puis
renseigner la passerelle et le DNS.

Cette solution depend du telephone, de la version Android et du type de hotspot.
Elle est moins pratique qu'une reservation DHCP quand plusieurs appareils se
connectent au meme reseau.

## Alternative : nom local ou URL configuree

Si le reseau fournit un nom local stable, utilisez-le dans `PUBLIC_BASE_URL` :

```env
PUBLIC_BASE_URL=http://cocotte.local:3000
```

Sinon, laissez `PUBLIC_BASE_URL` vide. Le serveur tentera d'afficher les URLs
detectees sur le reseau local dans `/admin` et via `GET /api/server-info`.

## Verification

- `GET /api/server-info` retourne `host`, `port`, `publicBaseUrl`,
  `localNetworkUrls` et `status`.
- La section `Etat systeme` de `/admin` affiche l'URL serveur actuelle et des liens
  rapides vers `/admin`, `/salle` et `/tablette`.
