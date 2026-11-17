# Traduction vocale en direct

Petite app web minimaliste qui écoute votre voix, la traduit en direct dans la
langue de votre choix, affiche le texte et le lit à voix haute.

## Lancer l'app

Aucune installation requise (aucun paquet npm) :

```bash
cd voice-translator
python3 -m http.server 8080
```

Puis ouvrez <http://localhost:8080> dans **Chrome** ou **Edge** (recommandé :
la reconnaissance vocale y est la plus fiable). Autorisez l'accès au micro
quand le navigateur le demande, choisissez vos langues, cliquez sur le micro
et parlez.

> Le micro exige un contexte sécurisé : `localhost` est accepté, un simple
> fichier `file://` ne l'est pas toujours selon le navigateur.

## Fonctionnement

- **Reconnaissance vocale** : Web Speech API (`SpeechRecognition`), en continu,
  avec résultats intermédiaires pour une traduction quasi instantanée.
- **Traduction** : API publique sans clé (Google Translate `gtx`, repli sur
  MyMemory), avec cache local des traductions déjà vues.
- **Lecture** : Web Speech API (`speechSynthesis`) avec la voix correspondant à
  la langue cible.

## Fichiers

- `index.html` — structure de la page
- `styles.css` — interface minimaliste
- `app.js` — logique (micro, traduction, synthèse vocale)

## Confidentialité

L'audio est traité par le moteur de reconnaissance vocale du navigateur et le
texte reconnu est envoyé aux API de traduction publiques pour être traduit.
Rien n'est stocké côté serveur : l'app est 100 % côté client.
