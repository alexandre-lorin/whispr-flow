# Portabilité

## Linux

La version actuelle est la référence validée : Electron, Hyprland, PipeWire, CUDA et Whisper.cpp. Elle est installée localement avec `python3 install.py`.

## Windows

La version portable est maintenant câblée dans `portable-main.cjs` : Electron capture le micro via Web Audio/WASAPI, place la capsule près du curseur, utilise F9/Maj+F9 et colle avec PowerShell/Win32. Elle réutilise le même protocole HTTP local Whisper et accepte CUDA, Vulkan ou DirectML selon le binaire installé. Il reste à valider le parcours sur une machine Windows réelle.

## macOS

La version portable utilise Electron/Web Audio (AVFoundation/CoreAudio), le raccourci global F9, NSPasteboard via `osascript` et le même moteur local. Les journaux du moteur reconnaissent Metal. macOS demandera l’autorisation Microphone et, pour le collage dans une autre application, l’autorisation Accessibilité. Le parcours doit encore être validé sur un Mac réel.

Le dépôt contient donc les chemins Linux, Windows et macOS, mais seuls Linux et la suite Node sont vérifiés ici. Les téléchargements de modèles, binaires Whisper et Electron ne sont pas inclus dans le dépôt. Le chemin du modèle portable est `WHISPR_MODEL` (sinon `~/Whispr Flow/models/ggml-large-v3-turbo.bin`) et le binaire peut être choisi avec `WHISPR_SERVER`.
