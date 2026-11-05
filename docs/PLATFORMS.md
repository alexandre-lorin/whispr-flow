# Portabilité

## Linux

La version actuelle est la référence validée : Electron, Hyprland, PipeWire, CUDA et Whisper.cpp. Elle est installée localement avec `python3 install.py`.

## Windows

La cible prévue utilise Electron, WASAPI pour la capture, le presse-papiers Win32 et un backend Whisper CUDA ou DirectML. Elle devra remplacer les appels Hyprland et `wl-copy` par des modules Windows natifs, puis être testée sur une RTX 4060.

## macOS

La cible prévue utilise Electron, AVFoundation/CoreAudio, NSPasteboard et Metal. Elle devra gérer séparément les autorisations Microphone et Accessibilité avant de valider le raccourci global et le collage.

Le code Linux n’est pas présenté comme compatible Windows/macOS tant que ces parcours n’ont pas été exécutés sur les systèmes concernés. Les téléchargements de modèles, binaires et dépendances ne sont pas inclus dans le dépôt.
