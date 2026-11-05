from pathlib import Path
import datetime, subprocess, sys

root = Path(__file__).resolve().parent
config = Path.home() / '.config/hypr/hyprland.conf'
text = config.read_text()
start, end = '# >>> Dictée globale locale', '# <<< Dictée globale locale'
if start in text and end in text:
    a = text.index(start)
    b = text.index(end, a) + len(end)
    text = text[:a] + text[b:]
text = text.replace('bind = , F9, exec, true', '# F9 remplacée par la dictée globale locale.')
command = f'/usr/bin/node "{root}/cli.cjs"'
runtime = root.parent / 'electron--terminal-deck/node_modules/electron/dist/electron'
block = f'''{start}
# F9 démarre/termine ; Maj+F9 annule. Aucun envoi automatique.
bind = , F9, exec, {command} toggle
bind = SHIFT, F9, exec, {command} cancel
windowrule = match:title ^(Dictee Toubi)$, float on, no_initial_focus on, no_follow_mouse on, pin on, size 168 36, border_size 0, no_shadow on, no_blur on, no_anim on, rounding 0
exec-once = "{runtime}" "{root}/main.cjs" --ozone-platform=wayland
{end}
'''
backup = config.with_name(config.name + '.before-global-dictation-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.write_text(config.read_text())
config.write_text(text.rstrip() + '\n\n' + block)
subprocess.run(['hyprctl', 'reload', 'config-only'], check=True, capture_output=True)
result = subprocess.run(['hyprctl', 'configerrors'], capture_output=True, text=True)
if result.returncode or result.stdout.strip():
    config.write_text(backup.read_text())
    subprocess.run(['hyprctl', 'reload', 'config-only'], capture_output=True)
    sys.exit('Configuration refusée ; configuration précédente restaurée.')
print('F9 et Maj+F9 activées. Démarrage automatique configuré. Sauvegarde conservée.')
