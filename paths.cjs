const path = require('node:path');
const fs = require('node:fs');
const root = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, process.argv.includes('--verify-isolated')?'toubi-dictee-check':'toubi-dictee');
fs.mkdirSync(root, {recursive:true,mode:0o700});
const stat = fs.lstatSync(root);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('Dossier de dictée non sûr.');
module.exports = {root, socket:path.join(root,'control.sock'), electron:path.resolve(__dirname,'../electron--terminal-deck/node_modules/electron/dist/electron')};
