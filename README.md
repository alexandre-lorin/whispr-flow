# Dictée globale locale

Dictée vocale locale GPU-first, avec capsule flottante, découpage pendant la parole et collage dans l’application active.

État du dépôt : **Linux / Hyprland en production locale**. Windows et macOS disposent maintenant d’un chemin Electron portable décrit dans [docs/PLATFORMS.md](docs/PLATFORMS.md), en attente d’un test sur les systèmes concernés.

F9 démarre le micro, F9 arrête cette capture et finalise son texte, Maj+F9 annule la capture courante ou les finalisations en attente si le micro est arrêté. Le texte est collé sans Entrée. Une nouvelle capture est possible pendant la finalisation précédente. Les textes terminés sont livrés dans l'ordre des dictées.

La capsule fait 168 × 36 px. Elle apparaît près du curseur au démarrage, reste fixe ensuite et se déplace par glissement. Capture de pointeur côté rendu, déplacement explicite de sa seule fenêtre par Hyprland. `no_initial_focus` et `no_follow_mouse` empêchent le focus à l'apparition et au survol ; un clic de déplacement peut temporairement activer la capsule, puis le focus est rendu à la fenêtre d'origine. L'ancienne règle `no_focus` bloquait les interactions. La capsule est masquée immédiatement après copie/collage. Une erreur reste affichée.

## Pipeline

- `pw-record` : PCM mono 16 kHz, en mémoire uniquement, sans fichier audio ou transcription.
- `audio.cjs` : trames de 20 ms, détection de pauses par niveau RMS adaptatif. Après environ 4 s, une pause de 500 ms clôt un segment. Après 18 s, une pause de 160 ms suffit. Limite technique de 28 s pour une parole continue sans pause, pouvant couper un mot. Les pauses ne terminent jamais une dictée.
- `gpu.cjs` : un `whisper-server` local conserve large-v3-turbo et ses allocations entre requêtes. CUDA est confirmé côté Linux ; Metal/Vulkan/DirectML sont reconnus sur le chemin portable. Requêtes strictement séquentielles et réponses en mémoire. Aucun contexte textuel d'une dictée antérieure n'est envoyé.
- `engine.cjs` : une capture active et plusieurs dictées en finalisation. Les segments sont soumis pendant la parole, puis assemblés dans l'ordre à l'arrêt. Limite technique de capture : 30 minutes. Annuler supprime les données du segmentateur et les travaux en attente ; interrompre un appel n'arrête pas le moteur résident.
- `main.cjs` : sérialise les livraisons, garde l'interface associée à la capture active et ne la masque pas lorsqu'une dictée plus ancienne se termine.

## GPU et priorité Ollama

Démarrage automatique du moteur résident avec le service de session. Backend CUDA confirmé par son signal technique, sans repli silencieux CPU. Whisper est arrêté lorsque le moniteur détecte un runner Ollama ou un modèle occupant de la VRAM dans `/api/ps`. Le micro peut continuer et les segments restent en attente. Rechargement après disparition des runners/modèles, avec temporisation de 2,5 s. Le moteur reste suspendu tant qu'un modèle Ollama demeure résident, même sans génération active.

Cette priorité est coopérative : détection des processus toutes les 300 ms, métadonnées API environ toutes les 1,6 s. Elle n'intercepte pas tous les appels Ollama et ne garantit pas une libération avant la toute première allocation d'un chargement simultané. Aucun prompt, historique ou contenu de réponse Ollama n'est lu. Aucun modèle textuel n'est arrêté par l'application.

Le serveur Whisper écoute uniquement sur 127.0.0.1, port temporaire, routes aléatoires propres au processus. Aucun accès distant, aucun service public, aucun compte ChatGPT. Il s'agit d'une API locale ; il n'y a pas d'API distante ni de coût par dictée. Le serveur ne reçoit que nos WAV construits en mémoire, sans convertisseur ffmpeg. Aucun transcript, audio ou log serveur n'est écrit sur disque.

## Collage et limites

Ctrl+Maj+V pour les terminaux reconnus, Ctrl+V ailleurs. Si l'adresse ou la classe de la fenêtre a changé, copie uniquement. Un champ interne différent dans la même fenêtre ne peut pas être identifié par Hyprland. Une application peut ignorer son raccourci : le résultat reste dans le presse-papiers, dont la conservation dépend du gestionnaire d'historique du bureau. Aucun envoi automatique.

Le découpage par énergie peut être moins précis avec bruit ou voix faible. Les segments indépendants peuvent présenter une ponctuation ou des majuscules différentes à leurs jonctions. Le silence long reste sans effet sur le contrôle F9.

## Installation et commandes

Prérequis Linux : Hyprland, PipeWire (`pw-record`), `wl-copy`, `whisper-server`/ggml CUDA et le modèle `~/.local/share/falcon/models/ggml-large-v3-turbo.bin`. Windows/macOS utilisent `portable-main.cjs` avec Electron, un `whisper-server` local et le modèle `WHISPR_MODEL` (ou `~/Whispr Flow/models/ggml-large-v3-turbo.bin`). Le binaire peut être indiqué par `WHISPR_SERVER`. Les chemins portables sont implémentés mais non testés ici sur une machine Windows/macOS.

Sur Windows ou macOS : installer Node.js 20+, cloner le dépôt, lancer `npm install`, placer le modèle GGML à l’emplacement indiqué puis lancer `npm start`. Au premier lancement, autoriser le microphone ; sur macOS, autoriser aussi l’Accessibilité pour le collage dans l’application active. F9 démarre/arrête et Maj+F9 annule.

`python3 install.py` configure Hyprland avec sauvegarde et restauration si rejet. `node cli.cjs status` retourne uniquement les états, les nombres de travaux, le PID GPU et les tailles techniques des buffers. `cancel`, `quit`, `preview` : annuler, arrêter, aperçu sans micro. `quit` arrête aussi Whisper et libère la VRAM ; retirer le bloc délimité du fichier Hyprland désactive autostart et raccourcis. `reload-idle.py` applique une mise à jour après les travaux actifs, sans couper un enregistrement.

## Validation

`npm run check`, `npm test` : découpage pendant capture, silences, captures simultanées à la finalisation avec décodeur de fixture, annulation de file suspendue, placement multi-écrans et raccourcis de collage. Ce banc ne prouve pas la voix réelle.

`verify-gpu.cjs` emploie le vrai serveur CUDA et l'audio public JFK. Contrôle du 5 novembre 2026 : 11 s d'audio transcrites en 0,51 s avec modèle chargé ; environ 1 984 MiB GPU, KV self/cross/pad environ 49,81 MiB au total. Libération effective du processus GPU lors du signal de priorité simulé, reprise du segment en attente et réutilisation du même worker entre requêtes confirmées. Aucun appel de génération Ollama ni microphone pendant ce contrôle. Ces délais ne garantissent pas le temps des dictées personnelles.

La recette Electron isolée conserve le focus à l'affichage et vérifie le mouvement de la vraie fenêtre au moyen du protocole de pointeur virtuel Wayland. Le mouvement a été observé après correction des règles de focus. Le pointeur physique reste utilisable et peut perturber la comparaison exacte des coordonnées pendant la recette. Aucun screenshot de bureau ni capture de microphone ; les captures ne contiennent que le rendu de la capsule.

## Correction placement et latence — 5 novembre 2026

La CLI fige les coordonnées du curseur dès son invocation et les transmet au service. Le rendu acquitte sa mise en invisibilité avant le remappage ; la capsule reste invisible tant que Hyprland n'a pas confirmé ses coordonnées exactes. L'animation du compositeur est désactivée pour cette seule fenêtre. La CLI garde la compatibilité avec un service plus ancien pendant une mise à jour.

`wl-copy` était auparavant lancé avec `execFile` et des flux capturés : le processus détaché qui conservait la sélection gardait les pipes ouverts, retardant le callback d'environ 3 010 ms. Il est désormais lancé avec stdout/stderr ignorés et acquittement sur la sortie du parent. Contrôle natif : 8 ms, texte de fixture confirmé dans le vrai presse-papiers. Le délai total de transcription reste distinct. `status.lastDelivery` donne uniquement la durée de livraison en millisecondes, sans texte ; `status.placement.matched` confirme le dernier placement.

## Erreurs intermittentes

Une erreur ne redimensionne plus la capsule. Une erreur de placement masque la fenêtre au lieu de rendre visible son emplacement provisoire au centre. Les délais maximaux de remappage sont plus tolérants lorsque le compositeur est chargé, sans délai ajouté au chemin normal. Les coupures réseau locales ECONNRESET/ECONNREFUSED/EPIPE déclenchent une seule reprise du segment avec le moteur rechargé ; une panne permanente termine le travail en erreur, sans boucle infinie. Les diagnostics accessibles via `node cli.cjs status` restent uniquement en mémoire : 20 codes fixes horodatés, aucun message brut, audio ou texte dicté.

Régressions vérifiées : reprise d'un segment et borne d'une seule tentative avec transport de fixture, exclusion du texte privé des diagnostics, affichage natif d'une erreur simulée sans déplacement ni agrandissement. Le message exact rapporté par Toubi n'a pas été reproduit ; ces corrections ne prétendent pas identifier toutes les causes possibles.
