import { mount } from '../mount';
import { bx } from '../legacy';
import { Icon, Panel } from '../components/ui';
import styles from '../components/ui.module.css';

const meanings: Record<string,string> = {
  live:'Partida em andamento',done:'Concluída / confirmada',pending:'Aguardando',conflict:'Conflito: precisa do juiz',bye:'Bye (passa direto)',finish:'Torneio encerrado',
  fire:'Reação: fogo',top:'Reação: top',lol:'Reação: risada',wow:'Reação: uau',clip:'Clipe de Partida',unboxing:'Unboxing',channel:'Divulgação de Canal',sale:'Venda / Troca de Bey',result:'Resultado de Torneio',champion:'Campeão',help:'Dúvida / Ajuda',offtopic:'Off-topic',flag:'Denunciar',trash:'Apagar (destrutivo)',warn:'Atenção',shield:'Moderação',ban:'Banir / bloquear',eye:'Revisar / visualizar',
};
async function copy(value: string, fallback: string) {
  try { await navigator.clipboard.writeText(value); bx.toast(`Copiado: ${value}`); }
  catch { bx.toast(fallback); }
}
function IconsPage() {
  return <>
    <div className="hero compact"><div><p className="eyebrow">DESIGN SYSTEM</p><h1>Guia de <em>ícones</em></h1><p>Um só traço (1.9px), cantos arredondados, grade 24×24, sem preenchimento. O mesmo sprite SVG em React e nas páginas existentes, com aparência consistente em cada aparelho.</p></div></div>
    <Panel><h3>Como usar</h3><pre className={styles.code}>{`// React:\n<Icon name="trophy" size={18} />\n\n// Páginas existentes:\nBX.icon('trophy', 18)\n\n// 12–14 em texto; 15–16 em botões; 18–22 em títulos.\n// Cor herdada de currentColor; status usam cores semânticas.`}</pre></Panel>
    <Panel><h3>Cores de status (torneio e partida)</h3><div className={styles.row}>{[['live','Ao vivo'],['done','Concluída'],['pending','Aguardando'],['ready','Pronta'],['conflict','Conflito'],['bye','Bye']].map(([key,label])=><span key={key} className={`m-status ${key}`}><Icon name={key==='ready'?'bolt':key} size={12}/>{label}</span>)}</div>
      <h3 className={styles.sectionTitle}>Tags da comunidade</h3><div className="tag-chips">{['clip','unboxing','channel','sale','result','champion','help','offtopic'].map(key=><span key={key} className={`tag-chip sm ${key}`}><Icon name={key} size={14}/>{meanings[key]}</span>)}</div>
      <h3 className={styles.sectionTitle}>Reações</h3><div className={styles.row}>{['fire','top','lol','wow'].map(key=><span key={key} className="react-btn on"><Icon name={key} size={15}/>{meanings[key].replace('Reação: ','')}</span>)}</div>
      <h3 className={styles.sectionTitle}>Emojis do site</h3><p className={styles.notice}>Nos posts e comentários, digite <code>:codigo:</code> ou use o botão de emojis do editor. Clique para copiar.</p><div className="icon-guide">{Object.entries(bx.EMOJIS).map(([key,name])=><button key={key} type="button" className="icon-tile" data-emo={`:${key}:`} title={`Copiar :${key}:`} onClick={()=>copy(`:${key}:`, `:${key}:`)}><Icon name={name} size={24}/><span>:{key}:</span></button>)}</div>
    </Panel>
    {Object.entries(bx.ICON_GROUPS).map(([group,names])=><Panel key={group}><div className="section-title-row"><div><p className="eyebrow">{group.toUpperCase()}</p><h2>{names.length} ícones</h2></div></div><div className="icon-guide">{names.map(name=><button key={name} type="button" className="icon-tile" data-name={name} title={`Copiar BX.icon('${name}')`} onClick={()=>copy(`BX.icon('${name}', 16)`,name)}><Icon name={name} size={26}/><span>{name}</span>{meanings[name]&&<small>{meanings[name]}</small>}</button>)}</div></Panel>)}
  </>;
}
mount(<IconsPage/>);
