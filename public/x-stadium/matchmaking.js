export class Matchmaking {
  constructor(events) {
    this.events = events;
  }

  async join(format,options = {}) {
    this.close();
    const current = this.session = {format,messages:[]};
    try {
      const response = await fetch('/api/x-stadium/queue',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,...options}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar na fila.');
      const {token,room} = result;
      const url = '/api/x-stadium/queue/'+token;
      if (this.session !== current) {
        fetch(url,{method:'DELETE',keepalive:true}).catch(()=>{});
        return;
      }
      current.url = url;
      if (room) this.events.room(room);
      this.connect(current);
    } catch (error) {
      if (this.session === current) this.fail(error.message);
    }
  }

  receive(session,type,data) {
    if (this.session!==session) return;
    if (type==='match') session.matched = true;
    if (type==='left') this.fail('O adversário saiu da partida.');
    else this.events[type]?.(data);
  }

  connect(session) {
    if (typeof WebSocket!=='function') { this.connectStream(session); return; }
    const url = new URL(session.url+'/socket',location.origin);
    url.protocol = url.protocol==='https:' ? 'wss:' : 'ws:';
    let socket;
    try { socket = session.socket = new WebSocket(url); }
    catch { this.connectStream(session); return; }
    const fallback = () => {
      if (this.session!==session || session.socket!==socket) return;
      session.socket = null;
      socket.close();
      this.connectStream(session);
    };
    session.connectTimer = setTimeout(fallback,1800);
    socket.onopen = () => clearTimeout(session.connectTimer);
    socket.onclose = event => {
      clearTimeout(session.connectTimer);
      if (this.session!==session || session.socket!==socket) return;
      if (!session.matched && event.code===1006) fallback();
      else this.fail('A conexão com a arena caiu.');
    };
    socket.onmessage = message => {
      if (session.socket!==socket) return;
      const {event,payload} = JSON.parse(message.data);
      this.receive(session,event,payload);
    };
  }

  connectStream(session) {
    const stream = session.stream = new EventSource(session.url);
    for (const type of ['queue','match','play','left']) {
      stream.addEventListener(type,event=>this.receive(session,type,JSON.parse(event.data)));
    }
    stream.onerror = () => {
      if (this.session===session) this.fail('A conexão com a arena caiu.');
    };
  }

  send(message) {
    const session = this.session;
    if (!session?.matched) return;
    if (session.socket && session.socket.readyState===WebSocket.OPEN) {
      if (message.type!=='frames' || session.socket.bufferedAmount<24_000) session.socket.send(JSON.stringify({messages:[message]}));
      return;
    }
    if (message.type==='frames') {
      session.pendingFrame = message;
      this.flushFrames(session);
      return;
    }
    session.messages.push(message);
    this.flush(session);
  }

  async flushFrames(session) {
    if (session.sendingFrame || !session.pendingFrame || this.session!==session) return;
    session.sendingFrame = true;
    const frame = session.pendingFrame;
    session.pendingFrame = null;
    try { await this.post(session,[frame]); }
    catch { /* An overdue snapshot is replaced by the next one. */ }
    finally {
      session.sendingFrame = false;
      this.flushFrames(session);
    }
  }

  async post(session,messages) {
    const response = await fetch(session.url+'/play',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}),
    });
    if (!response.ok) throw new Error('A conexão com a partida caiu.');
  }

  async flush(session) {
    if (session.sending || !session.messages.length || this.session !== session) return;
    session.sending = true;
    try {
      await this.post(session,session.messages.splice(0,24));
    } catch (error) {
      if (this.session === session) this.fail(error.message);
    } finally {
      session.sending = false;
      this.flush(session);
    }
  }

  fail(message) {
    const matched = Boolean(this.session?.matched);
    this.close();
    this.events.error(message,matched);
  }

  close() {
    const current = this.session;
    this.session = null;
    clearTimeout(current?.connectTimer);
    current?.socket?.close();
    current?.stream?.close();
    if (current?.url) fetch(current.url,{method:'DELETE',keepalive:true}).catch(()=>{});
  }
}
