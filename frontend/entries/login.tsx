import { useEffect, useState, type FormEvent } from 'react';
import { mount } from '../mount';
import { bx, type Site } from '../legacy';
import { Field, Panel } from '../components/ui';
import { GoogleIcon } from '../components/GoogleIcon';
import styles from '../components/ui.module.css';

function LoginPage() {
  const [mode,setMode] = useState<'login'|'register'>('login');
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [site,setSite] = useState<Site|null>(null);
  const [error,setError] = useState(new URLSearchParams(location.search).get('erro')||'');
  useEffect(()=>{
    let active=true;
    bx.me().catch(()=>null).then(user=>{
      if (!active) return;
      if (user) { location.href='/perfil'; return; }
      setReady(true);
    });
    bx.site().then(value=>{if(active)setSite(value);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  async function submit(event: FormEvent<HTMLFormElement>, dev=false) {
    event.preventDefault();
    if (busy) return;
    const form=new FormData(event.currentTarget);
    const body={email:String(form.get('email')||''),password:String(form.get('password')||''),...(mode==='register'?{name:String(form.get('name')||'')}:{})};
    setBusy(true); setError('');
    try {
      await bx.api(dev?'/api/auth/dev-login':`/api/auth/${mode}`,{method:'POST',body:dev?{email:body.email}:body});
      location.href=dev?'/perfil':mode==='register'?'/perfil?bemvindo=1':'/';
    } catch (err) {
      const message=err instanceof Error?err.message:'Não foi possível entrar. Tente novamente.';
      setError(message); bx.toast(message); setBusy(false);
    }
  }
  return <div className="center-page"><Panel>
    <p className="eyebrow">SUA CONTA</p><h1 className={styles.title}>Entrar no <em>BX Deck Lab</em></h1><p className={styles.description}>Entre para publicar decks, se inscrever em torneios, montar seu perfil e vender peças.</p>
    <div id="loginError" className={`conflict-banner ${styles.error}`} hidden={!error} role="alert">{error}</div>
    <div className={`pill-toggle ${styles.toggle}`}><button type="button" id="modeLogin" className={mode==='login'?'active':''} aria-pressed={mode==='login'} disabled={busy} onClick={()=>setMode('login')}>Entrar</button><button type="button" id="modeRegister" className={mode==='register'?'active':''} aria-pressed={mode==='register'} disabled={busy} onClick={()=>setMode('register')}>Criar conta</button></div>
    <form id="pwForm" className={styles.form} onSubmit={e=>submit(e)} aria-busy={busy}>
      <div id="nameField" hidden={mode!=='register'}><Field id="fName" name="name" label="Seu nome" maxLength={40} placeholder="Como quer ser chamado" autoComplete="nickname"/></div>
      <Field id="fEmail" name="email" label="E-mail" type="email" placeholder="seu@email.com" required autoComplete="email"/>
      <Field id="fPassword" name="password" label="Senha" type="password" placeholder="mínimo 8 caracteres" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'}/>
      <button className="btn primary" type="submit" id="pwSubmit" disabled={!ready||busy}>{busy?'Enviando…':mode==='login'?'Entrar':'Criar conta'}</button>
    </form>
    <div className={styles.divider}>OU</div>
    <a className={`login-btn ${site&&!site.googleLogin?styles.disabledLink:''}`} id="googleBtn" href="/api/oauth/google" aria-disabled={site?.googleLogin===false} onClick={e=>{if(site&&!site.googleLogin){e.preventDefault();bx.toast('Login Google ainda não configurado neste servidor.');}}}><GoogleIcon/>Entrar com Google</a>
    {site?.devLogin&&<form id="devLogin" className={styles.form} onSubmit={e=>submit(e,true)}><p className={styles.notice}>Login de desenvolvimento (só local):</p><Field label="E-mail de desenvolvimento" id="devEmail" name="email" type="email" required placeholder="seu@email.com"/><button className="btn secondary" disabled={busy||!ready}>Entrar (dev)</button></form>}
    <p className={styles.notice}>Usamos o Google só para autenticar seu e-mail. Nada é publicado em seu nome.</p>
  </Panel></div>;
}
mount(<LoginPage/>);
