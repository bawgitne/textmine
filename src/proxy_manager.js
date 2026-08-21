const fs = require('fs');
const path = require('path');
const net = require('net');
const { SocksClient } = require('socks');

class ProxyManager {
  constructor() {
    this.proxyFilePath = path.join(process.cwd(), 'proxy.md');
    this.proxies = [];
    this.currentIndex = 0;
    this.loadProxies();
  }

  // Nạp danh sách proxy từ file proxy.md
  loadProxies() {
    this.proxies = [];
    try {
      if (fs.existsSync(this.proxyFilePath)) {
        const content = fs.readFileSync(this.proxyFilePath, 'utf8');
        const lines = content.split(/\r?\n/);

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

          const parsed = this.parseProxyLine(trimmed);
          if (parsed) {
            this.proxies.push(parsed);
          }
        });
      }
    } catch (e) {
      console.error('[PROXY MANAGER] Lỗi đọc file proxy.md:', e.message);
    }
    return this.proxies;
  }

  // Phân tích cú pháp 1 dòng proxy
  parseProxyLine(rawLine) {
    let line = rawLine.trim();
    let type = 'auto'; // 'http' | 'socks4' | 'socks5' | 'auto'
    let auth = null;

    if (line.startsWith('socks5://')) {
      type = 'socks5';
      line = line.replace('socks5://', '');
    } else if (line.startsWith('socks4://')) {
      type = 'socks4';
      line = line.replace('socks4://', '');
    } else if (line.startsWith('http://')) {
      type = 'http';
      line = line.replace('http://', '');
    } else if (line.startsWith('https://')) {
      type = 'http';
      line = line.replace('https://', '');
    }

    if (line.includes('@')) {
      const parts = line.split('@');
      auth = parts[0];
      line = parts[1];
    }

    const hostPort = line.split(':');
    if (hostPort.length < 2) return null;

    const host = hostPort[0].trim();
    const port = parseInt(hostPort[1].trim(), 10);
    if (!host || isNaN(port)) return null;

    let username = '';
    let password = '';
    if (auth) {
      const authParts = auth.split(':');
      username = authParts[0] || '';
      password = authParts[1] || '';
    }

    return {
      raw: rawLine,
      type,
      host,
      port,
      username,
      password
    };
  }

  // Lấy proxy tiếp theo trong danh sách xoay
  getNextProxy() {
    this.loadProxies();
    if (this.proxies.length === 0) return null;

    const proxy = this.proxies[this.currentIndex % this.proxies.length];
    return proxy;
  }

  // Thử kết nối qua 1 proxy đơn lẻ tới targetHost:targetPort
  async connectSingleProxy(proxy, targetHost, targetPort, timeout = 6000) {
    const typesToTry = proxy.type === 'auto' ? ['http', 'socks5', 'socks4'] : [proxy.type];

    for (const proto of typesToTry) {
      try {
        if (proto === 'socks5' || proto === 'socks4') {
          const socksVersion = proto === 'socks5' ? 5 : 4;
          const options = {
            proxy: {
              host: proxy.host,
              port: proxy.port,
              type: socksVersion
            },
            command: 'connect',
            destination: {
              host: targetHost,
              port: parseInt(targetPort, 10)
            },
            timeout: timeout
          };

          if (proxy.username) options.proxy.userId = proxy.username;
          if (proxy.password) options.proxy.password = proxy.password;

          const info = await SocksClient.createConnection(options);
          return info.socket;
        } else if (proto === 'http') {
          const socket = await new Promise((resolve, reject) => {
            const s = net.connect(proxy.port, proxy.host);
            let settled = false;

            const timer = setTimeout(() => {
              if (!settled) {
                settled = true;
                s.destroy();
                reject(new Error(`Timeout ${timeout}ms`));
              }
            }, timeout);

            s.on('connect', () => {
              let req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
              if (proxy.username || proxy.password) {
                const authStr = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
                req += `Proxy-Authorization: Basic ${authStr}\r\n`;
              }
              req += `\r\n`;
              s.write(req);
            });

            s.once('data', (chunk) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);

              const resp = chunk.toString('utf8');
              if (resp.includes('200')) {
                resolve(s);
              } else {
                s.destroy();
                const status = resp.split('\r\n')[0] || 'Proxy error';
                reject(new Error(`Refused: ${status}`));
              }
            });

            s.on('error', (err) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
              }
            });

            s.on('close', () => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(new Error('Socket closed'));
              }
            });
          });
          return socket;
        }
      } catch (e) {
        // Thử type tiếp theo nếu type hiện tại bị từ chối
      }
    }

    throw new Error(`Proxy ${proxy.host}:${proxy.port} (${proxy.type}) không thể kết nối tới server`);
  }

  // Tự động xoay Proxy từ proxy.md cho đến khi kết nối thành công tới Minecraft Server
  async connectWithRotation(targetHost, targetPort, logFn = console.log, timeoutPerProxy = 5000) {
    this.loadProxies();

    if (this.proxies.length === 0) {
      logFn('warning', `⚠️ File proxy.md rỗng hoặc không có proxy hợp lệ. Đang thử kết nối TRỰC TIẾP (Direct Connect)...`);
      return this.connectDirect(targetHost, targetPort, timeoutPerProxy);
    }

    const startIndex = this.currentIndex;
    const total = this.proxies.length;

    for (let i = 0; i < total; i++) {
      const idx = (startIndex + i) % total;
      const proxy = this.proxies[idx];

      const proxyProtoStr = proxy.type.toUpperCase();
      logFn('info', `🔄 [PROXY XOAY ${i + 1}/${total}] Đang thử kết nối qua Proxy: ${proxyProtoStr} ${proxy.host}:${proxy.port}...`);

      try {
        const socket = await this.connectSingleProxy(proxy, targetHost, targetPort, timeoutPerProxy);
        this.currentIndex = (idx + 1) % total; // Xoay index sẵn cho lượt sau
        logFn('success', `✅ [PROXY SUCCESS] Đã tạo đường truyền thành công qua Proxy [${proxyProtoStr} ${proxy.host}:${proxy.port}] ➔ ${targetHost}:${targetPort}!`);
        return { socket, proxy };
      } catch (err) {
        logFn('warning', `❌ [PROXY FAILED] Proxy [${proxy.host}:${proxy.port}] thất bại: ${err.message}. Tự động xoay sang proxy tiếp theo...`);
      }
    }

    // Nếu tất cả proxy trong proxy.md đều thất bại
    logFn('warning', `⚠️ Tất cả ${total} proxy trong proxy.md đều không thể kết nối. Thử kết nối TRỰC TIẾP (Direct Connection)...`);
    return this.connectDirect(targetHost, targetPort, timeoutPerProxy);
  }

  // Kết nối trực tiếp không qua proxy
  connectDirect(targetHost, targetPort, timeout = 7000) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(parseInt(targetPort, 10), targetHost);
      let timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Direct connection timeout to ${targetHost}:${targetPort}`));
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve({ socket, proxy: null });
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

module.exports = new ProxyManager();
