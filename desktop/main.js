/* 主进程：内建静态服务（保证 Worker / fetch 可用）+ 桌面窗口 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function startServer(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const root = path.join(__dirname, 'app');
  const srv = await startServer(root);
  const port = srv.address().port;

  const win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0f1114',
    title: 'CV 可视化教学台 · 深度学习的图像基础',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    show: false,
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => app.quit());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL('http://127.0.0.1:' + port + '/index.html');
});

app.on('window-all-closed', () => app.quit());
