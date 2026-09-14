import { Component, type ReactNode, type InputHTMLAttributes } from 'react';
import styles from './ui.module.css';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg className="vicon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}
export function Panel({ children }: { children: ReactNode }) {
  return <section className={`panel-card ${styles.panel}`}>{children}</section>;
}
export function Field({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return <div><label className={styles.label} htmlFor={id}>{label}</label><input id={id} {...props} /></div>;
}
export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (this.state.failed) return <Panel><h1>Não foi possível abrir esta tela</h1><p>Seus dados continuam salvos. Tente carregar novamente.</p><button className="btn primary" onClick={() => location.reload()}>Tentar novamente</button></Panel>;
    return this.props.children;
  }
}
