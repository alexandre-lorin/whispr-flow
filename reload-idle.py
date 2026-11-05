"""Appliquer une mise à jour après la dictée active, sans ouvrir le micro."""
from pathlib import Path
import json, os, subprocess, time, sys

root = Path(__file__).resolve().parent
def state():
    r = subprocess.run(['node', str(root / 'cli.cjs'), 'status'], capture_output=True, text=True, timeout=4)
    if r.returncode:
        return 'offline'
    data = json.loads(r.stdout)
    return 'recording' if data.get('active') else data.get('state')

busy = {'starting', 'recording', 'transcribing', 'waiting'}
deadline = time.monotonic() + 1900
while time.monotonic() < deadline:
    if state() in busy:
        time.sleep(1)
        continue
    time.sleep(.5)
    if state() in busy:
        continue
    subprocess.run(['node', str(root / 'cli.cjs'), 'quit'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(.5)
    env = dict(os.environ)
    env.pop('ELECTRON_RUN_AS_NODE', None)
    command = [str(root.parent / 'electron--terminal-deck/node_modules/electron/dist/electron'), str(root / 'main.cjs'), '--ozone-platform=wayland']
    if '--verify-ui' in sys.argv:
        command.append('--verify-ui')
    subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, start_new_session=True)
    break
