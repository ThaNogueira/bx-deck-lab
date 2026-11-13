const PREFIX = 'xstadium-';
const ROOM = /^[A-Z2-9]{6}$/;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => CHARS[byte % CHARS.length]).join('');
}

export class Link {
  constructor(onStatus, onMessage) {
    this.onStatus = onStatus;
    this.onMessage = onMessage;
  }

  open(code, host) {
    this.close();
    this.code = code.trim().toUpperCase();
    if (!ROOM.test(this.code)) {
      this.onStatus('Digite um código de sala com 6 caracteres.');
      return;
    }
    this.host = host;
    const Peer = window.Peer;
    const peer = host ? new Peer(PREFIX + this.code.toLowerCase()) : new Peer();
    this.peer = peer;
    this.onStatus(host ? 'Criando sala…' : 'Conectando à sala…');
    this.timeout = setTimeout(() => this.fail('A conexão demorou demais. Confira o código ou tente criar outra sala.'), 19000);
    peer.on('open', () => {
      if (peer !== this.peer) return;
      if (host) {
        clearTimeout(this.timeout);
        this.onStatus('Sala ' + this.code + ' criada. Envie o código ao outro jogador.');
      } else {
        this.attach(peer.connect(PREFIX + this.code.toLowerCase(), { reliable: true, serialization: 'json', label: 'x-stadium' }));
      }
    });
    peer.on('connection', conn => {
      if (peer !== this.peer || !host || this.conn) {
        conn.on('open', () => conn.close());
        return;
      }
      this.attach(conn);
    });
    peer.on('error', err => {
      if (peer !== this.peer || this.conn?.open) return;
      const msg = {
        'peer-unavailable': 'Sala não encontrada. Confira o código e deixe a aba do anfitrião aberta.',
        'unavailable-id': 'Esse código já está em uso. Crie outra sala.',
        'browser-incompatible': 'Este navegador não oferece suporte à conexão direta.',
      }[err.type] || 'O serviço de conexão está indisponível. Tente novamente em instantes.';
      this.fail(msg);
    });
  }

  attach(conn) {
    this.conn = conn;
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.fail('A conexão direta falhou. Teste em outra rede ou use o modo local.'), 15000);
    conn.on('open', () => {
      if (conn !== this.conn) return;
      clearTimeout(this.timeout);
      this.onStatus('Jogadores conectados.', 'connected');
    });
    conn.on('data', data => {
      if (conn === this.conn && data && typeof data.type === 'string') this.onMessage(data);
    });
    conn.on('close', () => { if (conn === this.conn) this.fail('O outro jogador saiu da sala.'); });
    conn.on('error', () => { if (conn === this.conn) this.fail('A conexão com o outro jogador caiu.'); });
  }

  fail(message) {
    this.close();
    this.onStatus(message, 'closed');
  }

  send(data) {
    if (this.conn?.open) this.conn.send(data);
  }

  close() {
    clearTimeout(this.timeout);
    const peer = this.peer;
    this.peer = this.conn = null;
    this.code = '';
    peer?.destroy();
  }
}
