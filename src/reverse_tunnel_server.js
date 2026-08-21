/**
 * ESP32-C3 REVERSE TUNNEL SERVER MODULE FOR TEXTMINE
 * Integrates ESP32-C3 Home Proxy into Railway / Node.js backend.
 */

const net = require('net');

class ReverseTunnelServer {
    constructor() {
        this.tunnelPort = process.env.TUNNEL_PORT || 9000;
        this.socksPort = process.env.SOCKS_PORT || 1080;
        
        this.esp32Socket = null;
        this.esp32RemoteAddress = null;
        this.connectionMap = new Map();
        this.nextConnId = 1;
        this.tunnelServer = null;
        this.socksServer = null;
        this.connectedTime = null;
    }

    start() {
        // 1. Lắng nghe kết nối Reverse Tunnel từ ESP32 ở nhà (TCP 9000)
        this.tunnelServer = net.createServer((socket) => {
            console.log(`[ESP32 TUNNEL] 🔌 ESP32 SuperMini đã kết nối từ IP: ${socket.remoteAddress}`);
            this.esp32Socket = socket;
            this.esp32RemoteAddress = socket.remoteAddress;
            this.connectedTime = new Date();

            let buf = Buffer.alloc(0);

            socket.on('data', (data) => {
                buf = Buffer.concat([buf, data]);

                while (buf.length >= 5) {
                    const cmd = buf[0];
                    const connId = buf.readUInt16BE(1);
                    const len = buf.readUInt16BE(3);

                    if (buf.length < 5 + len) break; // Chưa đủ gói

                    const payload = buf.subarray(5, 5 + len);
                    buf = buf.subarray(5 + len);

                    if (cmd === 0x02) { // CMD_DATA
                        const clientSock = this.connectionMap.get(connId);
                        if (clientSock) {
                            clientSock.write(payload);
                        }
                    } else if (cmd === 0x03) { // CMD_CLOSE
                        const clientSock = this.connectionMap.get(connId);
                        if (clientSock) {
                            clientSock.end();
                            this.connectionMap.delete(connId);
                        }
                    } else if (cmd === 0x04) { // CMD_PONG
                        // Heartbeat alive
                    }
                }
            });

            socket.on('close', () => {
                console.log('⚠️ [ESP32 TUNNEL] ESP32 ở nhà bị ngắt kết nối!');
                this.esp32Socket = null;
                this.esp32RemoteAddress = null;
                this.connectedTime = null;
                for (let [id, sock] of this.connectionMap) {
                    sock.destroy();
                }
                this.connectionMap.clear();
            });

            socket.on('error', (err) => {
                console.error('[ESP32 TUNNEL ERROR]', err.message);
            });
        });

        this.tunnelServer.listen(this.tunnelPort, '0.0.0.0', () => {
            console.log(`🚀 [ESP32 TUNNEL] Lắng nghe kết nối từ ESP32 tại port ${this.tunnelPort}`);
        });

        // 2. Lắng nghe SOCKS5 Proxy Server tại 127.0.0.1:1080 (Dành cho Mineflayer Bot)
        this.socksServer = net.createServer((client) => {
            if (!this.esp32Socket) {
                console.log('❌ [SOCKS5] Từ chối Bot: ESP32 SuperMini ở nhà chưa kết nối!');
                client.destroy();
                return;
            }

            const connId = this.nextConnId++;
            if (this.nextConnId > 65000) this.nextConnId = 1;
            this.connectionMap.set(connId, client);

            let stage = 0;

            client.on('data', (data) => {
                if (stage === 0) { // Handshake
                    if (data[0] !== 0x05) { client.destroy(); return; }
                    client.write(Buffer.from([0x05, 0x00])); // NO AUTH REQUIRED
                    stage = 1;
                } else if (stage === 1) { // Connect Request
                    if (data[0] !== 0x05 || data[1] !== 0x01) { client.destroy(); return; }
                    
                    const atyp = data[3];
                    let host = '';
                    let port = 0;
                    let offset = 4;

                    if (atyp === 0x01) { // IPv4
                        host = data.subarray(4, 8).join('.');
                        offset = 8;
                    } else if (atyp === 0x03) { // Domain
                        const len = data[4];
                        host = data.subarray(5, 5 + len).toString('ascii');
                        offset = 5 + len;
                    } else {
                        client.destroy();
                        return;
                    }

                    port = data.readUInt16BE(offset);

                    // Gửi lệnh OPEN kết nối sang ESP32
                    const hostBuf = Buffer.from(host, 'ascii');
                    const openPayload = Buffer.alloc(3 + hostBuf.length);
                    openPayload.writeUInt16BE(port, 0);
                    openPayload[2] = hostBuf.length;
                    hostBuf.copy(openPayload, 3);

                    this.sendFrame(0x01, connId, openPayload);

                    // Trả lời SOCKS5 OK cho Mineflayer bot
                    const resp = Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]);
                    client.write(resp);
                    stage = 2; // Data streaming
                } else if (stage === 2) {
                    this.sendFrame(0x02, connId, data);
                }
            });

            client.on('close', () => {
                this.sendFrame(0x03, connId);
                this.connectionMap.delete(connId);
            });

            client.on('error', () => {
                this.sendFrame(0x03, connId);
                this.connectionMap.delete(connId);
            });
        });

        this.socksServer.listen(this.socksPort, '127.0.0.1', () => {
            console.log(`✅ [SOCKS5 SERVER] Đã mở SOCKS5 Proxy cho Bot tại 127.0.0.1:${this.socksPort}`);
        });

        // Heartbeat ping giữ kết nối mỗi 10 giây
        setInterval(() => {
            if (this.esp32Socket) {
                this.sendFrame(0x04, 0);
            }
        }, 10000);
    }

    sendFrame(cmd, connId, payload = Buffer.alloc(0)) {
        if (!this.esp32Socket) return false;
        const header = Buffer.alloc(5);
        header[0] = cmd;
        header.writeUInt16BE(connId, 1);
        header.writeUInt16BE(payload.length, 3);
        this.esp32Socket.write(Buffer.concat([header, payload]));
        return true;
    }

    getStatus() {
        return {
            online: this.esp32Socket !== null,
            remoteAddress: this.esp32RemoteAddress,
            connectedTime: this.connectedTime,
            socks5: `socks5://127.0.0.1:${this.socksPort}`,
            activeConnections: this.connectionMap.size
        };
    }
}

module.exports = new ReverseTunnelServer();
