const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;
const port = 4173;
const blocked = /ProcessBuilder|Runtime\.getRuntime|\.exec\(|Files\.delete|System\.exit|Socket\s*\(|ServerSocket|URL\s*\(|Class\.forName/i;

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

function run(command, args, options, timeoutMs) {
  return new Promise((resolve) => {
    const { input, ...spawnOptions } = options;
    const child = spawn(command, args, spawnOptions);
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    child.on('error', err => output += err.message);
    child.stdin.end(input || '');
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, timedOut }); });
  });
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }); return res.end(); }
  if (req.method === 'POST' && req.url === '/api/run') {
    let raw = '';
    req.on('data', piece => { raw += piece; if (raw.length > 120000) req.destroy(); });
    req.on('end', async () => {
      let data;
      try { data = JSON.parse(raw); } catch { return send(res, 400, { ok: false, output: 'Invalid request.' }); }
      const code = String(data.code || '');
      const input = String(data.input || '');
      if (!/public\s+class\s+Main\b/.test(code)) return send(res, 400, { ok: false, output: 'Use public class Main in your Java solution.' });
      if (blocked.test(code)) return send(res, 400, { ok: false, output: 'This local runner blocks operating-system, network, and destructive Java APIs.' });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odyssey-java-'));
      try {
        fs.writeFileSync(path.join(dir, 'Main.java'), code, 'utf8');
        const compile = await run('javac', ['Main.java'], { cwd: dir }, 6000);
        if (compile.code !== 0 || compile.timedOut) return send(res, 200, { ok: false, stage: 'compile', output: compile.timedOut ? 'Compilation timed out.' : compile.output });
        const execute = await run('java', ['Main'], { cwd: dir, input }, 4000);
        return send(res, 200, { ok: execute.code === 0 && !execute.timedOut, stage: 'run', output: execute.timedOut ? 'Execution timed out.' : execute.output });
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    return;
  }
  const url = decodeURIComponent(req.url === '/' ? '/engineers-odyssey.html' : req.url.split('?')[0]);
  const file = path.resolve(root, '.' + url);
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(file);
    const mime = ext === '.html' ? 'text/html' : ext === '.pdf' ? 'application/pdf' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
    send(res, 200, content, mime);
  });
}).listen(port, '127.0.0.1', () => console.log(`Engineer's Odyssey running at http://127.0.0.1:${port}`));
