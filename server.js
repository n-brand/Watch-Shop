const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const HISTORY_DIR = path.join(ROOT, 'assets', 'models', 'history');
const HISTORY_INDEX = path.join(HISTORY_DIR, 'index.json');
const RENDER_DIR = path.join(ROOT, 'assets', 'img', 'renders');
const MAX_MODEL_BYTES = 30 * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2',
};

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_INDEX, 'utf8'));
  } catch {
    return [];
  }
}

// Only the page itself may write: custom header (forces a CORS preflight we never answer) and same origin
function isTrustedWrite(req) {
  const origin = req.headers.origin;
  return req.headers['x-orvane'] === '1' && (!origin || origin === `http://${HOST}:${PORT}`);
}

function readBody(req, res, maxBytes, onBody) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      res.writeHead(413).end('Body too large');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (!res.writableEnded) onBody(Buffer.concat(chunks));
  });
}

// POST /api/versions/<id>/thumbnail: body is a WebP preview. Existing previews are only replaced with an
// explicit X-Replace: 1 header (index.json stays untouched then). Models are never overwritten.
function saveThumbnail(req, res, id) {
  if (!isTrustedWrite(req)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  readBody(req, res, MAX_THUMB_BYTES, (data) => {
    const index = readIndex();
    const entry = index.find((v) => v.id === id);
    if (!entry) {
      res.writeHead(404).end('Unknown version');
      return;
    }
    if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
      res.writeHead(400).end('Body is not a WebP image');
      return;
    }
    const file = `${id}.webp`;
    const replace = req.headers['x-replace'] === '1';
    if (fs.existsSync(path.join(HISTORY_DIR, file)) && !(replace && entry.thumb === file)) {
      res.writeHead(409).end('Thumbnail already exists');
      return;
    }
    fs.writeFileSync(path.join(HISTORY_DIR, file), data);
    if (!replace) {
      entry.thumb = file;
      fs.writeFileSync(HISTORY_INDEX, JSON.stringify(index, null, 2));
    }
    console.log(`${replace ? 'Replaced' : 'Saved'} thumbnail for ${id} (${(data.length / 1024).toFixed(0)} KB)`);
    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(entry));
  });
}

// POST /api/renders/<name>.webp: product still from tools/render-stills.html. Renders are regenerated, so overwriting is fine.
function saveRender(req, res, name) {
  if (!isTrustedWrite(req)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  readBody(req, res, MAX_THUMB_BYTES, (data) => {
    if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
      res.writeHead(400).end('Body is not a WebP image');
      return;
    }
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    fs.writeFileSync(path.join(RENDER_DIR, `${name}.webp`), data);
    console.log(`Saved render ${name}.webp (${(data.length / 1024).toFixed(0)} KB)`);
    res.writeHead(201).end();
  });
}

// POST /api/versions: body is a .glb, X-Version-Note the URI-encoded description, X-Version-Model the model id
function saveVersion(req, res) {
  if (!isTrustedWrite(req)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  readBody(req, res, MAX_MODEL_BYTES, (data) => {
    if (data.subarray(0, 4).toString('ascii') !== 'glTF') {
      res.writeHead(400).end('Body is not a binary glTF');
      return;
    }

    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const index = readIndex();
    const id = `v${String(index.length + 1).padStart(3, '0')}`;
    let note = '';
    try {
      note = decodeURIComponent(req.headers['x-version-note'] || '').slice(0, 500);
    } catch {
      // keep empty note on malformed encoding
    }
    // Which watch this is (meridian, lumen, ...); entries without it are Meridian versions
    const model = /^[a-z0-9-]{1,30}$/.test(req.headers['x-version-model'] || '') ? req.headers['x-version-model'] : 'meridian';
    const entry = { id, model, file: `${id}.glb`, date: new Date().toISOString(), note, bytes: data.length };
    if (fs.existsSync(path.join(HISTORY_DIR, entry.file))) {
      res.writeHead(409).end(`${entry.file} already exists; index.json out of sync`);
      return;
    }

    fs.writeFileSync(path.join(HISTORY_DIR, entry.file), data);
    index.push(entry);
    fs.writeFileSync(HISTORY_INDEX, JSON.stringify(index, null, 2));
    console.log(`Saved watch version ${id} (${(data.length / 1024).toFixed(0)} KB): ${note}`);
    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(entry));
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  let filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT) || path.basename(filePath).startsWith('.')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  const thumbMatch = req.url.match(/^\/api\/versions\/(v\d{3,})\/thumbnail$/);
  const renderMatch = req.url.match(/^\/api\/renders\/([a-z0-9-]{1,40})\.webp$/);
  if (req.method === 'POST' && req.url === '/api/versions') saveVersion(req, res);
  else if (req.method === 'POST' && thumbMatch) saveThumbnail(req, res, thumbMatch[1]);
  else if (req.method === 'POST' && renderMatch) saveRender(req, res, renderMatch[1]);
  else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res);
  else res.writeHead(405).end('Method not allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`Orvane running at http://${HOST}:${PORT}`);
});
