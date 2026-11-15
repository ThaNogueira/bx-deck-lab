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
      const stream = current.stream = new EventSource(url);
      for (const type of ['queue','match','play','left']) {
        stream.addEventListener(type,event=>{
          if (this.session !== current) return;
          const data = JSON.parse(event.data);
          if (type === 'match') current.matched = true;
          if (type === 'left') this.fail('O adversário saiu da partida.');
          else this.events[type](data);
        });
      }
      stream.onerror = () => {
        if (this.session === current) this.fail('A conexão com a arena caiu.');
      };
    } catch (error) {
      if (this.session === current) this.fail(error.message);
    }
  }

  send(message) {
    const session = this.session;
    if (!session?.matched) return;
    const tail = session.messages.at(-1);
    if (message.type === 'frames' && tail?.type === 'frames') session.messages.pop();
    session.messages.push(message);
    this.flush(session);
  }

  async flush(session) {
    if (session.sending || !session.messages.length || this.session !== session) return;
    session.sending = true;
    try {
      const response = await fetch(session.url+'/play',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:session.messages.splice(0,24)}),
      });
      if (!response.ok) throw new Error('A conexão com a partida caiu.');
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
    current?.stream?.close();
    if (current?.url) fetch(current.url,{method:'DELETE',keepalive:true}).catch(()=>{});
  }
}
