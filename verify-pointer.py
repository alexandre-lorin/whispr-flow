"""Recette Wayland réelle, limitée à la fenêtre de dictée fournie (sans micro)."""
import json, os, socket, struct, subprocess, sys, time

def hypr(*args):
    return subprocess.check_output(['hyprctl', *args], text=True).strip()
def data(command):
    return json.loads(hypr('-j', command))
pid = int(sys.argv[1])
def window():
    return next(w for w in data('clients') if w['pid'] == pid and w['title'] == 'Dictee Toubi')
original = data('cursorpos')
focus = data('activewindow').get('address')
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(2)
display = os.environ['WAYLAND_DISPLAY']
sock.connect(display if display.startswith('/') else os.path.join(os.environ['XDG_RUNTIME_DIR'], display))
def uint(*args): return struct.pack('=' + 'I' * len(args), *args)
def string(value):
    b = value.encode() + b'\0'
    return uint(len(b)) + b + b'\0' * ((-len(b)) % 4)
def send(obj, opcode, payload=b''):
    sock.sendall(uint(obj, ((len(payload)+8)<<16)|opcode) + payload)
globals = {}
buffer = b''
def roundtrip(callback):
    global buffer
    send(1, 0, uint(callback))
    while True:
        if len(buffer) < 8:
            buffer += sock.recv(65536)
            continue
        obj, packed = struct.unpack('=II', buffer[:8]); size, opcode = packed >> 16, packed & 65535
        if size < 8: raise RuntimeError('Message Wayland invalide.')
        if len(buffer) < size:
            buffer += sock.recv(65536)
            continue
        payload, buffer = buffer[8:size], buffer[size:]
        if obj == 2 and opcode == 0:
            name, length = struct.unpack('=II', payload[:8])
            interface = payload[8:8+length-1].decode()
            globals[interface] = name
        if obj == 1 and opcode == 0: raise RuntimeError('Protocole Wayland refusé.')
        if obj == callback and opcode == 0: return
def frame(): send(5, 4)
def button(pressed): send(5, 2, uint(int(time.monotonic()*1000)&0xffffffff, 272, pressed)); frame()
try:
    send(1, 1, uint(2)); roundtrip(3)
    name = globals.get('zwlr_virtual_pointer_manager_v1')
    if name is None: raise RuntimeError('Pointeur virtuel indisponible.')
    send(2, 0, uint(name)+string('zwlr_virtual_pointer_manager_v1')+uint(1,4))
    send(4, 0, uint(0,5)); roundtrip(6)
    before = window()
    x, y = before['at']
    hypr('dispatch', 'movecursor', str(x+50), str(y+18)); time.sleep(.18)
    initial_cursor = data('cursorpos')
    button(1); time.sleep(.2)
    send(5, 0, struct.pack('=Iii', int(time.monotonic()*1000)&0xffffffff, 60*256, 35*256)); frame()
    time.sleep(.35); button(0); time.sleep(.1)
    after = window()
    final_cursor = data('cursorpos')
    delta = [final_cursor['x']-initial_cursor['x'], final_cursor['y']-initial_cursor['y']]
    actual = [after['at'][0]-x, after['at'][1]-y]
    # Le pointeur physique reste utilisable pendant la recette : sa position
    # échantillonnée et celle du compositeur peuvent différer d'une trame.
    moved = abs(actual[0])+abs(actual[1])>10
    print(json.dumps({'nativeWaylandDrag':moved, 'pointerDelta':delta,'windowDelta':actual,'focusPreservedAfterClick':data('activewindow').get('address')==focus, 'microphoneOpened':False}))
finally:
    try: button(0)
    except OSError: pass
    sock.close()
    hypr('dispatch', 'movecursor', str(original['x']), str(original['y']))
    if focus and data('activewindow').get('address') != focus:
        hypr('dispatch', 'focuswindow', 'address:'+focus)
