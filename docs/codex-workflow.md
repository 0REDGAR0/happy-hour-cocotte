# Workflow Codex

Toujours fournir un resume final pour ChatGPT.

## back-v4

- Branche de travail : `back-v4`.
- Offre Happy Hour unique : `Pinte de bière`, 9€ prix normal, 4€ en Happy Hour.
- L'annonce plein ecran automatique est exposee par `happyHourAnnouncement`
  pendant environ 5 secondes au demarrage d'une Happy Hour. Elle est distincte
  de `fullscreenMessage`, qui reste un outil manuel de regie.
- Les bannieres aleatoires restent gerees par `/api/event-banners`,
  `/api/display/random-banner` et `bannerMessage`, avec effacement temporaire
  cote serveur.
- La soundbox de `/bar` appelle `POST /api/soundbox/play` et publie
  `soundboxEvent` dans `/api/state`. Le son final est prevu cote overlay
  Android / TV, avec dedoublonnage par `id`.
