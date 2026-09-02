(() => {
  'use strict';

  const DEFAULT_TEXT = '';

  const KIND_LABEL = {
    blade: 'Lâminas', ratchet: 'Catracas', bit: 'Pontas', lock: 'Lock Chips CX',
    main: 'Main Blades CX', assist: 'Assist Blades CX', over: 'Over Blades CX Expand', integrated: 'Lâminas integradas', rib: 'Ratchet-Integrated Bits'
  };

  const BIT_NAMES = {
    A:'Accel', B:'Ball', BS:'Bound Spike', C:'Cyclone', DB:'Disc Ball', DS:'Disk Spike', D:'Dot', E:'Elevate',
    F:'Flat', FB:'Free Ball', FF:'Free Flat', GB:'Gear Ball', GF:'Gear Flat', GN:'Gear Needle', GP:'Gear Point',
    GR:'Gear Rush', GU:'Gear Unite', G:'Glide', H:'Hexa', HN:'High Needle', HT:'High Taper', I:'Ignition', J:'Jolt',
    K:'Kick', L:'Level', LF:'Low Flat', LO:'Low Orb', LR:'Low Rush', M:'Merge', MN:'Metal Needle', NR:'Narrow',
    N:'Needle', O:'Orb', P:'Point', Q:'Quake', RA:'Rubber Accel', R:'Rush', S:'Spike', T:'Taper', TK:'Trans Kick',
    TP:'Trans Point', UF:'Under Flat', UN:'Under Needle', U:'Unite', V:'Vortex', WB:'Wall Ball', WW:'Wall Wedge',
    W:'Wedge', Y:'Yield', Z:'Zap'
  };


  // Heurística de comportamento. Escala 0–10 usada pelo analisador; não substitui testes no estádio.
  const BIT_PROFILE = {
    S:{type:'Defense', atk:1.5, def:6.5, sta:5.5, aggr:1.5, control:8, note:'Ponta fina e calma. Fica mais central, prioriza estabilidade e defesa, mas pode perder stamina se inclinar.'},
    F:{type:'Attack', atk:8, def:2.5, sta:3.5, aggr:8.5, control:5.5, note:'Attack clássico: rápido e agressivo, entra na X-Line com facilidade. Mais previsível e seguro que LF, mas ainda gasta bastante stamina.'},
    B:{type:'Stamina', atk:2, def:4.5, sta:8.5, aggr:2, control:7.5, note:'Stamina consistente e relativamente estável. Ótima para spin finish, mas a resistência a Burst é menor que a de Bits de ataque/balance.'},
    T:{type:'Balance', atk:6.5, def:4.5, sta:5.5, aggr:6, control:7, note:'Balance ofensiva: ataque consistente com mais controle e stamina que F/LF. Boa para quem quer pressionar sem apostar tudo em KO.'},
    GP:{type:'Balance', atk:7, def:3.5, sta:5, aggr:7.5, control:5.5, note:'Muda bastante com o ângulo: inclinado fica agressivo; reto tende a permanecer mais no centro. Versátil, mas menos previsível.'},
    LF:{type:'Attack', atk:9, def:2, sta:2.5, aggr:9.5, control:4.5, note:'Attack baixo e muito agressivo. A altura reduzida ajuda upper attacks, mas cobra stamina e aumenta o risco de sair do estádio.'},
    V:{type:'Attack', atk:8.5, def:2.5, sta:3, aggr:9, control:5, note:'Attack de alta mobilidade, feito para buscar contato e Xtreme Dashes com frequência. Forte pressão, pouca economia de stamina.'},
    W:{type:'Defense', atk:1.5, def:7, sta:6.5, aggr:1.5, control:8, note:'Ponta defensiva de baixa mobilidade. Procura absorver impacto e manter posição, sacrificando capacidade de perseguição.'},
    K:{type:'Balance', atk:7.5, def:4, sta:6, aggr:7, control:6.5, note:'Balance ofensiva muito competente: comportamento próximo de Rush, mas preserva mais stamina. Boa opção para ataque mais seguro.'},
    LO:{type:'Stamina', atk:2.5, def:5, sta:8, aggr:2.5, control:8, note:'Stamina baixa e compacta. Favorece estabilidade e centro do estádio, com altura reduzida que ajuda a evitar contato alto.'},
    J:{type:'Attack', atk:8.5, def:2, sta:3, aggr:9, control:4.5, note:'Attack muito agressivo e nervoso. Excelente para buscar impactos cedo, mas exige bom lançamento para não desperdiçar energia.'},
    GN:{type:'Defense', atk:2.5, def:7, sta:5.5, aggr:2.5, control:7, note:'Defense com engrenagens: central quando está estável, mas pode ganhar movimento ao tocar a X-Line. Mais ativo que Needle.'},
    N:{type:'Defense', atk:1.5, def:7.5, sta:6, aggr:1, control:8.5, note:'Defense bem central e controlada. Boa estabilidade, pouca movimentação e pouca capacidade de perseguir adversários.'},
    O:{type:'Stamina', atk:2, def:5, sta:8, aggr:2, control:8, note:'Stamina de movimento calmo e boa estabilidade. Normalmente oferece mais segurança defensiva que uma ponta totalmente agressiva.'},
    FB:{type:'Stamina', atk:1.5, def:4.5, sta:9, aggr:1.5, control:8, note:'Especialista em stamina. A esfera livre reduz atrito e prolonga rotação; excelente para spin finish, mas com Burst Resistance mais baixa.'},
    DS:{type:'Defense', atk:2, def:7.5, sta:5.5, aggr:2, control:8, note:'Defense estável com disco de apoio. Favorece resistência a inclinação e contato, em troca de pouca agressividade.'},
    I:{type:'Attack', atk:8, def:3, sta:3.5, aggr:8.5, control:5, note:'Attack voltada a arrancadas e contato. Boa para pressão ofensiva, com stamina apenas suficiente para lutas curtas.'},
    MN:{type:'Defense', atk:1, def:7, sta:7, aggr:1, control:9, note:'Ponta metálica muito estável, porém BANIDA por padrão na WBO por poder danificar o estádio.'},
    R:{type:'Attack', atk:8, def:3, sta:5, aggr:7.5, control:7, note:'Attack mais eficiente que Flat: Xtreme Dashes menos explosivos, porém mais frequentes e com menor gasto de stamina.'},
    LR:{type:'Attack', atk:8.8, def:2.5, sta:4.5, aggr:8.5, control:6.5, note:'Rush em altura baixa. Mantém a eficiência de Rush e facilita upper attacks, sendo ótima em Blades que querem pegar por baixo.'},
    L:{type:'Attack', atk:8.5, def:3, sta:4, aggr:8, control:6.5, note:'Attack rápida e baixa, muito usada em combinações ofensivas modernas. Boa pressão com controle melhor que flats extremos.'},
    H:{type:'Balance', atk:4.5, def:7.5, sta:6.5, aggr:3.5, control:8.5, note:'Balance defensiva muito estável. A geometria hexagonal ajuda a se reerguer e controlar inclinação, sendo excelente para combos pesados.'},
    E:{type:'Stamina', atk:4, def:4.5, sta:7.5, aggr:4, control:6.5, note:'Stamina/balance com comportamento variável e boa capacidade de sobreviver inclinada. Muito usada em combinações de giro oposto.'},
    P:{type:'Balance', atk:6.5, def:4, sta:6, aggr:6, control:7, note:'Balance versátil: pode atacar quando inclinado e ficar mais calmo quando lançado reto. Ótima para ajustar o papel pelo lançamento.'},
    A:{type:'Attack', atk:9, def:2, sta:2.5, aggr:9.5, control:4, note:'Attack extremamente veloz, com Xtreme Dashes fortes. Alto potencial de KO, mas alto consumo de stamina e risco de auto-KO.'},
    UN:{type:'Balance', atk:5.5, def:5.5, sta:6.5, aggr:5, control:7.5, note:'Balance moderada, alternando entre movimento e estabilidade. Boa para builds que querem flexibilidade sem extremos.'},
    U:{type:'Balance', atk:5.5, def:5.5, sta:6.5, aggr:5, control:7.5, note:'Balance moderada, alternando entre movimento e estabilidade. Boa para builds que querem flexibilidade sem extremos.'},
    TP:{type:'Balance', atk:6, def:5, sta:6, aggr:5.5, control:7, note:'Balance de comportamento misto. Permite ajustar o padrão de movimento e tende a funcionar como opção intermediária.'},
    HT:{type:'Balance', atk:5.5, def:5, sta:5.5, aggr:5.5, control:6.5, note:'Taper mais alta. Mantém o conceito de balance ofensiva, mas a altura muda os ângulos de contato e pode aumentar vulnerabilidade a upper attacks.'},
    DB:{type:'Stamina', atk:2, def:5.5, sta:8, aggr:2, control:7.5, note:'Stamina com apoio amplo. Boa rotação e estabilidade, buscando resistir a inclinação sem ficar muito móvel.'},
    D:{type:'Defense', atk:1.5, def:7, sta:6.5, aggr:1.5, control:8, note:'Ponta de contato pequeno e controlado. Fica mais central e privilegia defesa/stamina em vez de movimento.'},
    GF:{type:'Attack', atk:9.5, def:1.5, sta:2, aggr:10, control:3.5, note:'Uma das opções mais agressivas: muita velocidade e contato com a X-Line, mas grande consumo de stamina e maior risco de auto-KO.'},
    HN:{type:'Defense', atk:1.5, def:6.5, sta:6, aggr:1, control:8, note:'Needle mais alta. Continua defensiva e central, mas a altura maior muda os ângulos de impacto e pode facilitar ataques por baixo.'},
    TR:{type:'Attack', atk:6.8, def:4.2, sta:6.2, aggr:6.5, control:5.5, note:'Turbo (Tr) integra Ratchet e Bit. Começa sobre uma ponta fina de maior stamina e, ao perder rotação, retrai essa ponta e passa a se mover de forma mais agressiva. O gimmick é interessante, mas a re-aceleração tardia tende a ser menos forte que um ataque dedicado.'}
  };

  const BLADE_PROFILE = {
    'blade:rhinohorn':{atk:4,def:7.5,sta:4.5, role:'defesa compacta', trait:'perfil arredondado voltado a absorver impactos'},
    'blade:dransword':{atk:8,def:3.5,sta:3.5, role:'ataque direto', trait:'contato agressivo e bom potencial de smash attack'},
    'blade:wizardarrow':{atk:3,def:4.5,sta:7.5, role:'stamina', trait:'forma relativamente arredondada e boa conservação de rotação'},
    'blade:hellsscythe':{atk:6,def:5.5,sta:6, role:'balance', trait:'contatos versáteis que funcionam tanto em pressão quanto em sobrevivência'},
    'blade:pteraswing':{atk:4,def:4.5,sta:6.5, role:'stamina/balance', trait:'perfil mais suave, adequado a partidas de rotação'},
    'blade:unicornsting':{atk:6,def:6,sta:5.5, role:'balance', trait:'distribuição relativamente uniforme e contatos controláveis'},
    'blade:sharkedge':{atk:9,def:2.5,sta:2.5, role:'ataque de upper', trait:'arestas inclinadas que buscam pegar o adversário por baixo e levantar seu eixo'},
    'blade:meteordragoon':{atk:7.5,def:4,sta:6, role:'ataque/balance de giro oposto', trait:'boa pressão ofensiva com potencial de equalização em matchups de giro oposto'},
    'blade:sphinxcowl':{atk:3.5,def:7,sta:4.5, role:'defesa', trait:'formato voltado a absorção e estabilidade'},
    'blade:knightshield':{atk:3,def:7.5,sta:5, role:'defesa', trait:'perfil defensivo e arredondado, buscando desviar impactos'},
    'blade:shelterdrake':{atk:3.5,def:5.5,sta:7, role:'stamina', trait:'perfil pensado para estabilidade e preservação de rotação'},
    'blade:heavensring':{atk:3,def:7,sta:5.5, role:'defesa', trait:'contato mais fechado e resistente a impactos'},
    'integrated:valor-bison':{atk:3,def:5.5,sta:7.5, role:'stamina integrada', trait:'conjunto integrado voltado a rotação estável'},
    'main:brave':{atk:8,def:4,sta:4, role:'ataque CX', trait:'Main Blade ofensiva com contatos fortes'},
    'main:blast':{atk:8.7,def:3.8,sta:5, role:'ataque CX pesado', trait:'três contatos descendentes voltados a smash/destabilização, com mais massa e stamina que Brave'},
    'main:dark':{atk:4,def:7.5,sta:5, role:'defesa CX', trait:'Main Blade de perfil defensivo'},
    'main:reaper':{atk:6.5,def:5,sta:5.5, role:'balance CX', trait:'contatos mistos para ataque e estabilidade'},
    'main:arc':{atk:3.5,def:5,sta:7.5, role:'stamina CX', trait:'Main Blade voltada a rotação e estabilidade'},
    'main:blitz':{atk:9,def:3,sta:3.5, role:'ataque CX Expand', trait:'Metal Blade agressiva, orientada a impactos fortes'},
    // Perfis extras para peças populares que o usuário pode adicionar futuramente.
    'blade:buster-dran':{atk:9.3,def:2.5,sta:2.5, role:'ataque explosivo', trait:'lâmina assimétrica de impacto forte, especialmente perigosa em contatos iniciais'},
    'blade:dranbuster':{atk:9.3,def:2.5,sta:2.5, role:'ataque explosivo', trait:'lâmina assimétrica de impacto forte, especialmente perigosa em contatos iniciais'},
    'blade:wizardrod':{atk:2.5,def:5.5,sta:9.2, role:'stamina de alto nível', trait:'distribuição de massa muito eficiente para rotação e estabilidade'},
    'blade:aeropegasus':{atk:8.5,def:4.5,sta:5.5, role:'ataque pesado', trait:'boa massa e contatos fortes com capacidade de KO'},
    'blade:sharkscale':{atk:9,def:3,sta:3.5, role:'ataque de upper', trait:'contatos inclinados voltados a levantar e desestabilizar o oponente'},
    'blade:wyvernhover':{atk:4.5,def:6,sta:7.5, role:'balance/stamina', trait:'perfil estável que aceita Bits ofensivas sem perder totalmente a capacidade de sobreviver'},
    'blade:silverwolf':{atk:3.5,def:6.5,sta:8.5, role:'stamina/defesa', trait:'massa e formato voltados à estabilidade e rotação prolongada'},
    'blade:phoenixwing':{atk:8.5,def:5,sta:4.5, role:'ataque pesado', trait:'grande massa e contatos de smash que recompensam lançamentos agressivos'},
    'blade:whalewave':{atk:7.5,def:5,sta:5.5, role:'balance ofensivo', trait:'massa alta e contatos fortes capazes de pressionar sem ser totalmente glass cannon'},
    'blade:cobaltdragoon':{atk:7,def:4.5,sta:7, role:'balance de giro esquerdo', trait:'giro oposto e boa massa, permitindo pressão e equalização em matchups específicos'},
    'blade:hellschain':{atk:5.5,def:6.5,sta:6, role:'balance defensivo', trait:'contatos relativamente controlados e boa capacidade de absorver impacto'},
    'blade:knightmail':{atk:5,def:7.5,sta:6, role:'defesa pesada', trait:'perfil resistente que busca manter estabilidade sob contato'},
    'blade:meteordragoon':{atk:7.5,def:4,sta:6, role:'ataque/balance de giro oposto', trait:'boa pressão ofensiva com potencial de equalização em matchups de giro oposto'}
  };

  const ASSIST_MOD = {
    'assist:slash':{atk:1.0,def:0,sta:-0.2, note:'Slash reforça o caráter ofensivo.'},
    'assist:bumper':{atk:-0.2,def:1.0,sta:0.2, note:'Bumper acrescenta amortecimento e defesa.'},
    'assist:turn':{atk:0.3,def:0.4,sta:0.4, note:'Turn mantém um perfil equilibrado.'},
    'assist:round':{atk:-0.2,def:0.5,sta:0.8, note:'Round favorece estabilidade e stamina.'},
    'assist:knuckle':{atk:0.8,def:0.3,sta:-0.1, note:'Knuckle aumenta o potencial de contato.'},
    'assist:assault':{atk:0.9,def:0.1,sta:-0.1, note:'Assault engrossa e apoia os contatos de Blast, reforçando smash e pressão ofensiva.'},
    'assist:heavy':{atk:0.8,def:0.5,sta:0.3, note:'Heavy adiciona bastante massa em altura baixa e costuma favorecer CX ofensivos sem esconder tanto os contatos da Main Blade.'},
    'assist:wheel':{atk:-0.3,def:0.7,sta:1.0, note:'Wheel acrescenta massa e contato arredondado, normalmente puxando CX para estabilidade, defesa e stamina.'}
  };

  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const partId = (kind, name) => `${kind}:${slug(name)}`;

  function P(kind, name, opts={}) {
    return {
      id: partId(kind,name), kind, name, display: opts.display || name, wiki: opts.wiki || wikiTitle(kind,name),
      abbrev: opts.abbrev || '', aliases: opts.aliases || [], banned: opts.banned || false,
      basicLock: opts.basicLock || false, requiresOver: opts.requiresOver || false,
      type: opts.type || '', stats: opts.stats || null, note: opts.note || '', behavior: opts.behavior || '',
      geometry: opts.geometry || '', spin: opts.spin || '', weight: opts.weight || '', line: opts.line || '',
      source: opts.source || '', image: opts.image || '', remoteCode: opts.remoteCode || '',
      parentId: opts.parentId || '', serverId: opts.serverId || '', colorLabel: opts.colorLabel || ''
    };
  }

  function wikiTitle(kind, name) {
    const prefix = {blade:'Blade', ratchet:'Ratchet', bit:'Bit', lock:'Lock Chip', main:'Main Blade', assist:'Assist Blade', over:'Over Blade', integrated:'Ratchet-Integrated Blade', rib:'Ratchet Integrated Bit'}[kind];
    return `${prefix} - ${name}`;
  }

  const PARTS = {};
  function reg(part) {
    const old=PARTS[part.id];
    if(old){
      const aliases=[...(old.aliases||[]),...(part.aliases||[])].filter(Boolean);
      const merged={...old,...part,display:old.display||part.display,aliases:[...new Set(aliases)]};
      for(const k of ['stats','note','behavior','geometry','spin','weight','line','source','image','remoteCode','type','serverId','parentId','colorLabel','images']){
        if((part[k]===null || part[k]==='') && old[k]) merged[k]=old[k];
      }
      PARTS[part.id]=merged;
    } else PARTS[part.id]=part;
    return part.id;
  }

  /** Funde uma peça local duplicada na canônica: move quantidades manuais, filhas e referências de deck/sessão. */
  function mergeLocalPart(dup, canon){
    if(!dup||!canon||dup.id===canon.id)return;
    if(manualParts[dup.id]){ if(!manualParts[canon.id])manualParts[canon.id]={part:canon,qty:0}; manualParts[canon.id].qty=(manualParts[canon.id].qty||0)+(manualParts[dup.id].qty||0); delete manualParts[dup.id]; persistCollection(); }
    for(const c of Object.values(PARTS))if(c.parentId===dup.id)c.parentId=canon.id;
    const remap=(slot)=>{ for(const k of ['blade','lock','main','assist','over','ratchet','bit','rib'])if(slot?.[k]===dup.id)slot[k]=canon.id; };
    try{ (deck||[]).forEach(remap); (sessionDraft||[]).forEach(remap); (sessionDecks||[]).forEach(d=>(d.deck||[]).forEach(remap)); }catch{}
    canon.aliases=[...new Set([...(canon.aliases||[]),dup.name,dup.display,...(dup.aliases||[])].filter(x=>x&&x!==canon.name&&x!==canon.display))];
    if(!canon.image&&dup.image)canon.image=dup.image;
    delete PARTS[dup.id];
  }
  /** Só peças-pai (recolors são filhas e ficam fora das listagens). */
  const PARENTS=()=>Object.values(PARTS).filter(p=>!p.parentId);
  function childrenOf(p){ return p?Object.values(PARTS).filter(c=>c.parentId===p.id).sort((x,y)=>(x.colorOrder||0)-(y.colorOrder||0)):[]; }
  /** Pergunta a cor (popup) quando a peça tem recolors. Resolve com a peça escolhida ou null. */
  async function chooseColor(p){
    if(!p||p.parentId)return p;
    const kids=childrenOf(p);
    if(!kids.length||!window.BX?.colorDialog)return p;
    const r=await window.BX.colorDialog({name:p.display,options:kids.map(k=>({id:k.id,img:k.image,label:k.colorLabel||'Cor',qty:inventory[k.id]||0}))});
    if(r===null)return null;
    return r==='__default'?p:(PARTS[r]||p);
  }

  // Basic / UX / Unique blades
  const pRhino = reg(P('blade','RhinoHorn',{display:'Horn Rhino', wiki:'Blade - RhinoHorn', aliases:['Horn Rhino']}));
  const pDranSword = reg(P('blade','DranSword',{display:'Sword Dran', wiki:'Blade - DranSword', aliases:['Sword Dran']}));
  const pWizardArrow = reg(P('blade','WizardArrow',{display:'Arrow Wizard', wiki:'Blade - WizardArrow', aliases:['Arrow Wizard']}));
  const pHellsScythe = reg(P('blade','HellsScythe',{display:'Scythe Incendio', wiki:'Blade - HellsScythe', aliases:['Scythe Incendio']}));
  const pPtera = reg(P('blade','PteraSwing',{display:'Talon Ptera', wiki:'Blade - PteraSwing', aliases:['Talon Ptera']}));
  const pUnicorn = reg(P('blade','UnicornSting',{display:'Sting Unicorn', wiki:'Blade - UnicornSting', aliases:['Sting Unicorn']}));
  const pShark = reg(P('blade','SharkEdge',{display:'Keel Shark', wiki:'Blade - SharkEdge', aliases:['Keel Shark']}));
  const pMeteor = reg(P('blade','MeteorDragoon',{display:'Meteoroid Dragoon', wiki:'Blade - MeteorDragoon', aliases:['Meteoroid Dragoon','Meteor Dragoon']}));
  const pSphinx = reg(P('blade','SphinxCowl',{display:'Cowl Sphinx', wiki:'Blade - SphinxCowl', aliases:['Cowl Sphinx']}));
  const pKnight = reg(P('blade','KnightShield',{display:'Helm Knight', wiki:'Blade - KnightShield', aliases:['Helm Knight']}));
  const pShelter = reg(P('blade','ShelterDrake',{display:'Shelter Drake', wiki:'Blade - ShelterDrake'}));
  const pAether = reg(P('blade','HeavensRing',{display:'Ring Aether', wiki:'Blade - HeavensRing', aliases:['Ring Aether']}));
  const pValor = reg(P('integrated','Valor Bison',{display:'Valor Bison', wiki:'Ratchet-Integrated Blade - Valor Bison'}));
  const pGlory = reg(P('integrated','Glory Valkyrie',{display:'Glory Valkyrie', aliases:['Glory Valkyrie'], wiki:'Ratchet-Integrated Blade - Glory Valkyrie',type:'Attack',stats:{atk:85,def:35,sta:25},behavior:'Ratchet integrada e lâmina com mecanismo de rebote; perfil de ataque explosivo.',source:'Beyblade X current catalog'}));
  const pBullet = reg(P('integrated','Bullet Griffon',{display:'Bullet Griffon', aliases:['Rocket Griffon'], wiki:'Ratchet-Integrated Blade - Bullet Griffon',type:'Balance',stats:{atk:45,def:45,sta:40},behavior:'Ratchet integrada e gimmick de separação; perfil equilibrado com boa defesa e contato secundário.',source:'Beyblade X current catalog'}));
  const pNether = reg(P('integrated','Hells Nether',{display:'Hells Nether', aliases:['Nether Incendio'], wiki:'Ratchet-Integrated Blade - Hells Nether',type:'Balance',stats:{atk:50,def:50,sta:30},behavior:'Ratchet integrada com mudança de altura; alterna entre contatos mais ofensivos e parry/defesa.',source:'Beyblade X current catalog'}));

  // CX components
  const lockDran = reg(P('lock','Dran',{wiki:'Lock Chip - Dran', basicLock:true}));
  const lockPerseus = reg(P('lock','Perseus',{wiki:'Lock Chip - Perseus', basicLock:true}));
  const lockHells = reg(P('lock','Hells',{display:'Incendio / Hells',wiki:'Lock Chip - Hells', basicLock:true}));
  const lockWizard = reg(P('lock','Wizard',{wiki:'Lock Chip - Wizard', basicLock:true}));
  const lockBahamut = reg(P('lock','Bahamut',{wiki:'Lock Chip - Bahamut', basicLock:true}));
  const lockPegasus = reg(P('lock','Pegasus',{wiki:'Lock Chip - Pegasus', basicLock:true}));
  const lockEmperor = reg(P('lock','Emperor',{wiki:'Lock Chip - Emperor', basicLock:false,behavior:'Lock Chip metálico mais pesado; adiciona massa central e estabilidade.',source:'Beyblade X current catalog'}));
  const mainBrave = reg(P('main','Brave',{wiki:'Main Blade - Brave'}));
  const mainDark = reg(P('main','Dark',{wiki:'Main Blade - Dark'}));
  const mainReaper = reg(P('main','Reaper',{wiki:'Main Blade - Reaper'}));
  const mainArc = reg(P('main','Arc',{wiki:'Main Blade - Arc'}));
  const mainBlitz = reg(P('main','Blitz',{wiki:'Metal Blade - Blitz', requiresOver:true}));
  const mainBlast = reg(P('main','Blast',{wiki:'Main Blade - Blast'}));
  const mainMight = reg(P('main','Might',{wiki:'Main Blade - Might',type:'Balance',stats:{atk:25,def:25,sta:25},behavior:'Main Blade de perfil equilibrado.',source:'Beyblade X current catalog'}));
  const assistSlash = reg(P('assist','Slash',{wiki:'Assist Blade - Slash'}));
  const assistBumper = reg(P('assist','Bumper',{wiki:'Assist Blade - Bumper'}));
  const assistTurn = reg(P('assist','Turn',{wiki:'Assist Blade - Turn'}));
  const assistRound = reg(P('assist','Round',{wiki:'Assist Blade - Round'}));
  const assistKnuckle = reg(P('assist','Knuckle',{wiki:'Assist Blade - Knuckle'}));
  const assistAssault = reg(P('assist','Assault',{wiki:'Assist Blade - Assault'}));
  const assistHeavy = reg(P('assist','Heavy',{wiki:'Assist Blade - Heavy',type:'Balance',stats:{atk:17,def:17,sta:11},behavior:'Assist Blade metálica, pesada e baixa; melhora massa e pressão de contato sem elevar demais o conjunto.',source:'Beyblade X current catalog'}));
  const assistWheel = reg(P('assist','Wheel',{wiki:'Assist Blade - Wheel'}));
  const overBreak = reg(P('over','Break',{wiki:'Over Blade - Break'}));
  const overFlow = reg(P('over','Flow',{wiki:'Over Blade - Flow'}));
  const ribTurbo = reg(P('rib','Turbo',{display:'Turbo',wiki:'Ratchet Integrated Bit - Turbo',abbrev:'Tr'}));

  const CURRENT_RATCHETS = ['0-60','0-70','0-80','1-50','1-60','1-70','1-80','2-60','2-70','2-80','3-60','3-70','3-80','3-85','4-50','4-55','4-60','4-70','4-80','5-50','5-60','5-70','5-80','6-60','6-70','6-80','7-55','7-60','7-70','7-80','8-70','8-80','9-60','9-65','9-70','9-80','M-85'];
  CURRENT_RATCHETS.forEach(r => reg(P('ratchet',r,{wiki:`Ratchet - ${r}`,abbrev:r,source:'BeybladeHub / live catalog'})));

  // Snapshot de Bits atuais para funcionamento offline. A sincronização online atualiza/expande este conjunto.
  const CURRENT_BIT_DATA = [
    ['A','Attack',40,10,10,40,'aceleração alta e movimento agressivo'],['B','Stamina',15,25,50,10,'contato esférico e ótima retenção de giro'],
    ['BS','Defense',5,60,30,5,'ponta com amortecimento para absorver impactos'],['C','Attack',40,5,10,45,'movimento circular veloz'],
    ['DB','Stamina',15,20,55,10,'disco e esfera para alta retenção de giro'],['DS','Defense',5,55,40,10,'disco de recuperação ajuda o Bey a voltar à posição'],
    ['D','Defense',10,55,25,10,'contato pontilhado de alto atrito'],['E','Attack',30,15,20,35,'contato elevado com boa sobrevivência inclinada'],
    ['F','Attack',40,15,10,35,'flat clássica, rápida e versátil'],['FB','Stamina',10,25,60,5,'esfera livre para stamina máxima'],
    ['FF','Attack',55,5,5,35,'flat livre que reduz perdas em Xtreme Dash'],['GB','Stamina',10,15,45,30,'ball com engrenagem, mais ativa'],
    ['GF','Attack',50,5,5,40,'flat com engrenagem, muito agressiva'],['GN','Defense',20,40,10,30,'needle com engrenagem, defesa mais ativa'],
    ['GP','Attack',30,25,15,30,'point com engrenagem, ofensiva variável'],['GR','Attack',45,10,10,35,'Rush com engrenagem e alta velocidade'],
    ['GU','Balance',30,20,20,30,'Unite com engrenagem e contra-Xtreme Dashes'],['G','Stamina',20,10,55,15,'POM de baixo atrito e boa postura em baixa rotação'],
    ['H','Defense',30,35,20,15,'base hexagonal estável e defensiva'],['HN','Defense',15,55,20,10,'needle alta e central'],
    ['HT','Balance',30,25,20,25,'taper alta com movimento ofensivo'],['I','Attack',50,15,5,30,'muito agressiva e baixa, com grande gasto de stamina'],
    ['J','Attack',35,10,15,40,'arrancadas bruscas e impactos rápidos'],['K','Balance',35,25,15,25,'mudanças rápidas de direção com boa segurança'],
    ['L','Attack',40,5,15,40,'ataque baixo, rápido e estável'],['LF','Attack',45,5,10,40,'flat baixa que favorece ataques por baixo'],
    ['LO','Stamina',5,25,55,15,'orb baixa para stamina estável'],['LR','Attack',45,5,15,35,'Rush baixa, rápida e ótima para upper attacks'],
    ['M','Attack',50,20,10,10,'contato combinado de alta pressão'],['MN','Defense',8,57,30,5,'needle metálica; banida por padrão na WBO'],
    ['NR','Stamina',5,20,62,5,'eixo muito fino para atrito mínimo'],['N','Defense',10,50,30,10,'needle estável e central'],
    ['O','Stamina',10,30,50,10,'orb de movimento circular e boa stamina'],['P','Balance',25,25,25,25,'point equilibrada, muda bastante com o ângulo'],
    ['Q','Attack',55,15,5,25,'eixo deslocado produz saltos imprevisíveis'],['RA','Attack',60,17,3,20,'borracha de alta aderência, ataque forte e alto consumo'],
    ['R','Attack',40,10,20,30,'Rush eficiente com dashes rápidos'],['S','Defense',10,45,35,10,'spike central e resistente'],
    ['T','Attack',35,20,20,25,'cone inclinado: ataque consistente com boa margem de controle'],['TK','Balance',35,30,20,15,'movimento transicional com tendência balance'],
    ['TP','Balance',35,25,25,15,'mudança de altura e comportamento durante a batalha'],['UF','Attack',55,5,5,35,'flat muito baixa para contato por baixo'],
    ['UN','Defense',10,60,20,10,'needle rebaixada para alta estabilidade'],['U','Balance',25,25,30,20,'padrão de movimento equilibrado'],
    ['V','Attack',45,10,5,40,'movimento rápido e agressivo'],['WB','Stamina',15,30,45,10,'ball com parede para stamina defensiva'],
    ['WW','Defense',5,60,25,10,'wedge com parede para resistir inclinação e KO'],['W','Defense',5,55,30,10,'wedge de baixa mobilidade e boa ancoragem'],
    ['Y','Stamina',8,25,58,8,'stamina baixa para vencer por spin finish'],['Z','Attack',30,20,15,35,'movimento de alta energia e pressão']
  ];
  CURRENT_BIT_DATA.forEach(([abbr,type,atk,def,sta,dash,behavior])=>reg(P('bit',BIT_NAMES[abbr],{wiki:`Bit - ${BIT_NAMES[abbr]}`,abbrev:abbr,banned:abbr==='MN',type,stats:{atk,def,sta,dash},behavior,source:'Byyblade X HQ snapshot'})));
  reg(P('rib','Operate',{wiki:'Ratchet Integrated Bit - Operate',abbrev:'Op',type:'Balance',stats:{atk:20,def:50,sta:50,dash:10},behavior:'Ratchet e Bit integradas; alterna entre modo Attack e Defense antes da batalha.',source:'Beyblade X current catalog'}));

  const ID = {
    r: r => partId('ratchet',r),
    b: a => partId('bit',BIT_NAMES[a] || a)
  };

  const STOCK = [
    { match:['horn rhino 3-80 s'], label:'Horn Rhino 3-80 S', type:'Defense', system:'Basic Line', pieces:[pRhino,ID.r('3-80'),ID.b('S')] },
    { match:['sword dran 3-60 f'], label:'Sword Dran 3-60 F', type:'Attack', system:'Basic Line', pieces:[pDranSword,ID.r('3-60'),ID.b('F')] },
    { match:['arrow wizard 4-80 b'], label:'Arrow Wizard 4-80 B', type:'Stamina', system:'Basic Line', pieces:[pWizardArrow,ID.r('4-80'),ID.b('B')] },
    { match:['scythe incendio 4-60 t'], label:'Scythe Incendio 4-60 T', type:'Balance', system:'Basic Line', pieces:[pHellsScythe,ID.r('4-60'),ID.b('T')] },
    { match:['talon ptera 3-80 b'], label:'Talon Ptera 3-80 B', type:'Stamina', system:'Basic Line', pieces:[pPtera,ID.r('3-80'),ID.b('B')] },
    { match:['sting unicorn 5-60 gp'], label:'Sting Unicorn 5-60 GP', type:'Balance', system:'Basic Line', pieces:[pUnicorn,ID.r('5-60'),ID.b('GP')] },
    { match:['keel shark 3-60 lf'], label:'Keel Shark 3-60 LF', type:'Attack', system:'Basic Line', pieces:[pShark,ID.r('3-60'),ID.b('LF')] },
    { match:['courage dran s 6-60v','courage dran s 6-60 v'], label:'Courage Dran S 6-60V', type:'Attack', system:'Custom Line', pieces:[lockDran,mainBrave,assistSlash,ID.r('6-60'),ID.b('V')] },
    { match:['dark perseus b 6-80w','dark perseus b 6-80 w'], label:'Dark Perseus B 6-80W', type:'Defense', system:'Custom Line', pieces:[lockPerseus,mainDark,assistBumper,ID.r('6-80'),ID.b('W')] },
    { match:['reaper incendio t 4-70 k','reaper incendio t 4-70k'], label:'Reaper Incendio T 4-70K', type:'Balance', system:'Custom Line', pieces:[lockHells,mainReaper,assistTurn,ID.r('4-70'),ID.b('K')] },
    { match:['arc wizard r 4-55 lo','arc wizard r 4-55lo'], label:'Arc Wizard R 4-55LO', type:'Stamina', system:'Custom Line', pieces:[lockWizard,mainArc,assistRound,ID.r('4-55'),ID.b('LO')] },
    { match:['meteoroid dragoon 3-70j','meteoroid dragoon 3-70 j'], label:'Meteoroid Dragoon 3-70J', type:'Attack', system:'Unique Line', pieces:[pMeteor,ID.r('3-70'),ID.b('J')] },
    { match:['cowl sphinx 9-80gn','cowl sphinx 9-80 gn'], label:'Cowl Sphinx 9-80GN', type:'Defense', system:'Basic Line', pieces:[pSphinx,ID.r('9-80'),ID.b('GN')] },
    { match:['helm knight 3-80n','helm knight 3-80 n'], label:'Helm Knight 3-80N', type:'Defense', system:'Basic Line', pieces:[pKnight,ID.r('3-80'),ID.b('N')] },
    { match:['shelter drake 5-70 o','shelter drake 5-70o'], label:'Shelter Drake 5-70O', type:'Stamina', system:'Basic Line', pieces:[pShelter,ID.r('5-70'),ID.b('O')] },
    { match:['valor bison fb'], label:'Valor Bison FB', type:'Stamina', system:'Unique Line', pieces:[pValor,ID.b('FB')] },
    { match:['ring aether 0-80 ds','ring aether 0-80ds'], label:'Ring Aether 0-80DS', type:'Defense', system:'Basic Line', pieces:[pAether,ID.r('0-80'),ID.b('DS')] },
    { match:['blitz bahamut bk 1-50 i','blitz bahamut bk 1-50i'], label:'Blitz Bahamut BK 1-50I', type:'Attack', system:'Custom Line Expand', pieces:[lockBahamut,mainBlitz,overBreak,assistKnuckle,ID.r('1-50'),ID.b('I')] },
    { match:['glory valkyrie lf'], label:'Glory Valkyrie LF', type:'Attack', system:'UX Expand Blade', pieces:[pGlory,ID.b('LF')] },
    { match:['bullet griffon h','rocket griffon h'], label:'Bullet Griffon H', type:'Balance', system:'UX Expand Blade', pieces:[pBullet,ID.b('H')] },
    { match:['hells nether z','nether incendio z'], label:'Hells Nether Z', type:'Balance', system:'UX Expand Blade', pieces:[pNether,ID.b('Z')] },
    { match:['emperor might hop','emperor might h op'], label:'Emperor Might HOp', type:'Balance', system:'Custom Line • Ratchet-Integrated Bit', pieces:[lockEmperor,mainMight,assistHeavy,partId('rib','Operate')] },
    { match:['blast pegasus atr','blast pegasus a tr','pegasus blast atr','pegasus blast a tr'], label:'Blast Pegasus ATr', type:'Attack', system:'Custom Line • Ratchet-Integrated Bit', pieces:[lockPegasus,mainBlast,assistAssault,ribTurbo] }
  ];

  const POPULAR = [
    {player:'Kozmoz', place:'1º', event:'NWBO: March Madness', date:'02 mar 2026', players:56, ranked:true,
      combos:['AeroPegasus 7-60 Level','WizardRod 1-60 Hexa','SharkScale 9-60 Kick'],
      parts:[['AeroPegasus','7-60','Level'],['WizardRod','1-60','Hexa'],['SharkScale','9-60','Kick']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'RisingPhoenix19', place:'2º', event:'NWBO: March Madness', date:'02 mar 2026', players:56, ranked:true,
      combos:['WizardRod 9-60 Ball','SolEclipse Zillion3-60 Accel','WhaleWave 5-60 Kick'],
      parts:[['WizardRod','9-60','Ball'],['SolEclipse','Zillion3-60','Accel'],['WhaleWave','5-60','Kick']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'xavierbeyblades', place:'3º', event:'NWBO: March Madness', date:'02 mar 2026', players:56, ranked:true,
      combos:['SharkScale 3-60 Low Rush','WyvernHover 9-60 Rush','WizardRod 1-60 Hexa'],
      parts:[['SharkScale','3-60','Low Rush'],['WyvernHover','9-60','Rush'],['WizardRod','1-60','Hexa']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'Lunamare', place:'1º', event:'River Valley Showdown 2.2', date:'08 mar 2026', players:25, ranked:true,
      combos:['CobaltDragoon 5-60 Elevate','SharkScale 1-70 Low Rush','WizardRod 1-60 Hexa'],
      parts:[['CobaltDragoon','5-60','Elevate'],['SharkScale','1-70','Low Rush'],['WizardRod','1-60','Hexa']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'Rymac', place:'1º', event:'Aero Clash @ Belcher Park', date:'07 mar 2026', players:31, ranked:false,
      combos:['WizardRod 9-80 Wedge','SharkScale 1-70 Low Rush','KnightMail 1-60 Rush'],
      parts:[['WizardRod','9-80','Wedge'],['SharkScale','1-70','Low Rush'],['KnightMail','1-60','Rush']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'CrisisCrusher07', place:'1º', event:'League of Bladers Aiea', date:'07 mar 2026', players:12, ranked:false,
      combos:['AeroPegasus 1-60 Rush','WizardRod 6-60 Hexa','SharkScale 1-70 Low Rush'],
      parts:[['AeroPegasus','1-60','Rush'],['WizardRod','6-60','Hexa'],['SharkScale','1-70','Low Rush']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'Beebo', place:'1º', event:'MCB Friday Night Ranked #1', date:'06 mar 2026', players:12, ranked:true,
      combos:['SharkScale 9-60 Free Ball','AeroPegasus 1-60 Low Rush','MeteorDragoon 7-70 Level'],
      parts:[['SharkScale','9-60','Free Ball'],['AeroPegasus','1-60','Low Rush'],['MeteorDragoon','7-70','Level']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'SushiGrade', place:'1º', event:'PDX Locals S4E3', date:'08 mar 2026', players:18, ranked:false,
      combos:['DranBuster 4-50 Vortex','SharkScale 5-60 Level','WizardRod 1-60 Free Ball'],
      parts:[['DranBuster','4-50','Vortex'],['SharkScale','5-60','Level'],['WizardRod','1-60','Free Ball']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'SrGio', place:'1º', event:'DFW Weekly Tournament #102', date:'03 mar 2026', players:28, ranked:true,
      combos:['WizardRod 1-60 Free Ball','SharkScale 1-70 Hexa','WyvernHover 9-60 Kick'],
      parts:[['WizardRod','1-60','Free Ball'],['SharkScale','1-70','Hexa'],['WyvernHover','9-60','Kick']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1918974'},
    {player:'Ruffles', place:'1º', event:'MasterBursters × MillionCardShow', date:'31 jan 2026', players:60, ranked:true,
      combos:['SamuraiSaber 9-70 Low Orb','SharkScale 3-60 Low Rush','WyvernHover 9-60 Kick'],
      parts:[['SamuraiSaber','9-70','Low Orb'],['SharkScale','3-60','Low Rush'],['WyvernHover','9-60','Kick']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'},
    {player:'Jely', place:'1º', event:'Nook Arena 19', date:'31 jan 2026', players:10, ranked:true,
      combos:['WizardRod 1-60 Hexa','SilverWolf 9-70 Free Ball','SharkScale 1-70 Low Rush'],
      parts:[['WizardRod','1-60','Hexa'],['SilverWolf','9-70','Free Ball'],['SharkScale','1-70','Low Rush']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'},
    {player:'Darknight1', place:'1º', event:'February Fire-Up', date:'01 fev 2026', players:20, ranked:true,
      combos:['CobaltDragoon 5-60 Elevate','WyvernHover 9-60 Level','HellsChain 1-60 Hexa'],
      parts:[['CobaltDragoon','5-60','Elevate'],['WyvernHover','9-60','Level'],['HellsChain','1-60','Hexa']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'},
    {player:'Bak2Bey', place:'1º', event:'BeyUnderground XXVIII', date:'25 jan 2026', players:30, ranked:false,
      combos:['MeteorDragoon 5-60 Level','AeroPegasus 6-70 Low Rush','SharkScale 7-60 Point'],
      parts:[['MeteorDragoon','5-60','Level'],['AeroPegasus','6-70','Low Rush'],['SharkScale','7-60','Point']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'},
    {player:'Sonic_x_19', place:'2º', event:'BeyUnderground XXVIII', date:'25 jan 2026', players:30, ranked:false,
      combos:['SharkScale 1-60 Kick','PegasusBlast Heavy3-60 Taper','WyvernHover 9-60 Jolt'],
      parts:[['SharkScale','1-60','Kick'],['PegasusBlast','Heavy3-60','Taper'],['WyvernHover','9-60','Jolt']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'},
    {player:'Jujubeans', place:'3º', event:'BeyUnderground XXVIII', date:'25 jan 2026', players:30, ranked:false,
      combos:['SharkScale 9-60 Low Orb','SilverWolf 6-60 Hexa','WizardRod 1-60 Free Ball'],
      parts:[['SharkScale','9-60','Low Orb'],['SilverWolf','6-60','Hexa'],['WizardRod','1-60','Free Ball']],
      source:'https://worldbeyblade.org/Thread-Winning-Combinations-at-WBO-Organized-Events-Beyblade-X-BBX?pid=1914810'}
  ];


  const RECENT_META_SEED = [
    {player:'Pódio BBX DB',place:'1º',event:'NEBO X THIRD SPACE #8',date:'23 ago 2026',players:21,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Wizard Rod 1-60 Hexa','Cobalt Dragoon 5-60 Elevate','Dran Strike 3-60 Rush'],parts:[['Wizard Rod','1-60','Hexa'],['Cobalt Dragoon','5-60','Elevate'],['Dran Strike','3-60','Rush']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'2º',event:'NEBO X THIRD SPACE #8',date:'23 ago 2026',players:21,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Wizard Rod 1-60 Hexa','Wyvern Hover 9-60 Gear Needle','Cobalt Dragoon 5-60 Elevate'],parts:[['Wizard Rod','1-60','Hexa'],['Wyvern Hover','9-60','Gear Needle'],['Cobalt Dragoon','5-60','Elevate']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'1º',event:'MCB BBX S2 RANKED EVENT #3',date:'23 ago 2026',players:33,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Aero Pegasus 1-50 Rush','Wizard Rod 1-60 Narrow','Shark Scale 9-60 Free Ball'],parts:[['Aero Pegasus','1-50','Rush'],['Wizard Rod','1-60','Narrow'],['Shark Scale','9-60','Free Ball']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'1º',event:'From CURSE to Crown',date:'22 ago 2026',players:18,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Wizard Rod 1-60 Free Ball','Wyvern Hover 9-60 Trans Kick','Aero Pegasus 3-70 Kick'],parts:[['Wizard Rod','1-60','Free Ball'],['Wyvern Hover','9-60','Trans Kick'],['Aero Pegasus','3-70','Kick']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'2º',event:'From CURSE to Crown',date:'22 ago 2026',players:18,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Wizard Rod 1-60 Hexa','Shark Scale 1-70 Low Rush','Aero Pegasus 1-50 Rush'],parts:[['Wizard Rod','1-60','Hexa'],['Shark Scale','1-70','Low Rush'],['Aero Pegasus','1-50','Rush']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'3º',event:'From CURSE to Crown',date:'22 ago 2026',players:18,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Dran Buster 1-60 Low Flat','Dran Sword 5-60 Rush','Dran Strike 9-60 Kick'],parts:[['Dran Buster','1-60','Low Flat'],['Dran Sword','5-60','Rush'],['Dran Strike','9-60','Kick']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'1º',event:'Blazin Battles at Barb',date:'22 ago 2026',players:40,ranked:false,sourceType:'podium',sourceName:'BBX DB',combos:['Wizard Rod 1-60 Free Ball','Dran Strike 6-60 Low Rush','Shark Scale 3-60 Rush'],parts:[['Wizard Rod','1-60','Free Ball'],['Dran Strike','6-60','Low Rush'],['Shark Scale','3-60','Rush']],source:'https://bbxdatabase.com/record'},
    {player:'Pódio BBX DB',place:'1º',event:'Vortex Cup #1',date:'23 ago 2026',players:48,ranked:true,sourceType:'podium',sourceName:'BBX DB',combos:['Shark Scale 1-60 Rush','Scorpio Spear 9-60 Free Ball','Wizard Rod 3-60 Ball'],parts:[['Shark Scale','1-60','Rush'],['Scorpio Spear','9-60','Free Ball'],['Wizard Rod','3-60','Ball']],source:'https://bbxdatabase.com/record'}
  ];


  // Resultados de outras cenas competitivas. Os eventos de Infinity Stadium ficam rotulados
  // separadamente para não serem confundidos com o meta do Xtreme Stadium.
  const BEYBASE_META_SEED = [
    {player:'Kei',place:'1º',event:'SpaWorld Cup Dispatch G2 • Xtreme Stadium',date:'07 fev 2026',players:256,ranked:true,sourceType:'podium',sourceName:'BeyBase • G2 Japão',combos:['Shark Scale 3-60 Rush','Emperor Blast Heavy 9-60 Low Rush','Wizard Rod 1-60 Low Orb'],parts:[['Shark Scale','3-60','Rush'],['Emperor Blast Heavy','9-60','Low Rush'],['Wizard Rod','1-60','Low Orb']],source:'https://beybase.com/how-i-became-a-beyblade-x-g2-tournament-champion/'},
    {player:'1º lugar',place:'1º',event:'X-TREME CUP G1 Team Battle Osaka • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Wyvern Hover 1-60 Taper','Aero Pegasus 7-60 Rush','Shark Scale 1-70 Low Rush'],parts:[['Wyvern Hover','1-60','Taper'],['Aero Pegasus','7-60','Rush'],['Shark Scale','1-70','Low Rush']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'},
    {player:'2º lugar',place:'2º',event:'X-TREME CUP G1 Team Battle Osaka • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Emperor Blast Free 9-70 Hexa','Wyvern Hover 9-60 Rush','Shark Scale 1-60 Free Ball'],parts:[['Emperor Blast Free','9-70','Hexa'],['Wyvern Hover','9-60','Rush'],['Shark Scale','1-60','Free Ball']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'},
    {player:'4º lugar',place:'4º',event:'X-TREME CUP G1 Team Battle Osaka • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Wyvern Hover 1-60 Kick','Phoenix Wing 7-60 Low Flat','Shark Scale 9-60 Point'],parts:[['Wyvern Hover','1-60','Kick'],['Phoenix Wing','7-60','Low Flat'],['Shark Scale','9-60','Point']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'},
    {player:'1º lugar',place:'1º',event:'X-TREME CUP G1 Team Battle Nagoya • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Wyvern Hover 9-60 Rush','Phoenix Wing 3-60 Low Flat','Shark Scale 1-60 Low Rush'],parts:[['Wyvern Hover','9-60','Rush'],['Phoenix Wing','3-60','Low Flat'],['Shark Scale','1-60','Low Rush']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'},
    {player:'2º lugar',place:'2º',event:'X-TREME CUP G1 Team Battle Nagoya • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Wyvern Hover 9-60 Free Ball','Valkyrie Blast Heavy 1-70 Low Rush','Shark Scale 1-60 Low Orb'],parts:[['Wyvern Hover','9-60','Free Ball'],['Valkyrie Blast Heavy','1-70','Low Rush'],['Shark Scale','1-60','Low Orb']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'},
    {player:'4º lugar',place:'4º',event:'X-TREME CUP G1 Team Battle Nagoya • Infinity Stadium',date:'nov 2025',players:384,ranked:true,sourceType:'podium',sourceName:'BeyBase • Infinity Japão',combos:['Aero Pegasus 1-70 Low Rush','Wyvern Hover 3-60 Rush','Shark Scale 1-60 Elevate'],parts:[['Aero Pegasus','1-70','Low Rush'],['Wyvern Hover','3-60','Rush'],['Shark Scale','1-60','Elevate']],source:'https://beybase.com/best-beyblade-x-infinity-stadium-combos-players-guide/'}
  ];

  const BBX_WEEKLY = {
    source:'https://www.bbxweekly.com/4weeks',
    week:'2026-W18', start:'2026-04-10', end:'2026-05-07', events:183, parts:5248,
    groups:[
      {key:'blade', title:'Blades / Main / Metal', items:[['Shark Scale',92],['Wizard Rod',90],['Aero Pegasus',65],['Cobalt Dragoon',53],['Meteor Dragoon',52],['Wyvern Hover',50],['Knight Mail',50],['Rage',49],['Blast',47],['Silver Wolf',44],['Phoenix Wing',41],['Blitz',36],['Tyranno Beat',36],['Clock Mirage',34],['Mummy Curse',34],['Scorpio Spear',33],['Golem Rock',31],['Fort',29]]},
      {key:'ratchet', title:'Ratchets', items:[['1-60',100],['9-60',76],['3-60',57],['1-70',56],['1-50',56],['3-70',55],['7-60',50],['7-70',49],['4-50',46],['5-60',44],['6-60',41],['1-80',34],['4-55',34],['9-70',34],['7-55',33],['8-70',32]]},
      {key:'bit', title:'Bits', items:[['Hexa',78],['Low Rush',75],['Rush',67],['Free Ball',58],['Elevate',54],['Level',52],['Kick',51],['Jolt',45],['Ball',43],['Wedge',42],['Low Orb',42],['Point',41],['Unite',40],['Taper',40],['Under Needle',29]]},
      {key:'assist', title:'Assist Blades', items:[['Heavy',48],['Wheel',32]]},
      {key:'over', title:'Over Blades', items:[['Flow',48],['Break',32]]},
      {key:'chip', title:'Tipo de Lock Chip', items:[['Plastic Chip',56],['Metal Chip',46]]}
    ]
  };

  // ---------- Catálogo vivo (v5) ----------
  const REMOTE = {
    parts:'https://byybladebuilder.com/parts',
    hubBlades:'https://beybladehub.app/parts/blades', hubRatchets:'https://beybladehub.app/parts/ratchets', hubBits:'https://beybladehub.app/parts/bits',
    phstudy:'https://beyblade.phstudy.org/', bbxdb:'https://bbxdatabase.com/record', beycrate:'https://beycrate.com/', bbxhub:'https://bbxhub.net/', beybaseG2:'https://beybase.com/how-i-became-a-beyblade-x-g2-tournament-champion/',
    productsTT:'https://beycommunity.com/en/x/products/', productsHasbro:'https://beycommunity.com/en/x/hasbro/'
  };
  const LIVE_CACHE_KEY='bx_live_catalog_v8';
  const ONLINE_STOCK_KEY='bx_online_stock_v8';
  const PRODUCT_CACHE_KEY='bx_product_catalog_v8';
  const META_CACHE_KEY='bx_meta_decks_v6';
  const META_CURSOR_KEY='bx_meta_cursor_v6';
  const BBXHUB_CURSOR_KEY='bx_bbxhub_cursor_v6';
  let catalogSyncing=false;
  let catalogLastSync=0;
  let onlineStockCache=[];
  let hubImageIndex={};
  let productCatalog=[];
  let missingBrandChoice={};

  function stripMd(v){return String(v||'').replace(/<br\s*\/?>/gi,' / ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`#]/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
  function inferType(stats){if(!stats)return'';const a=+stats.atk||0,d=+stats.def||0,st=+stats.sta||0;const top=Math.max(a,d,st);const sorted=[a,d,st].sort((x,y)=>y-x);if(sorted[0]-sorted[1] <= Math.max(3,top*.12))return'Balance';return top===a?'Attack':top===d?'Defense':'Stamina';}
  function parseStats(v){const m=String(v||'').match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);return m?{atk:+m[1],def:+m[2],sta:+m[3]}:null;}
  function saveLiveCatalog(){
    const parts=Object.values(PARTS).filter(p=>p.source||p.stats||p.image).map(p=>({...p}));
    try{localStorage.setItem(LIVE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),parts,hubImageIndex}));}catch{}
  }
  function loadLiveCatalog(){
    const c=loadJSON(LIVE_CACHE_KEY,null); if(!c)return;
    (c.parts||[]).forEach(x=>reg(x)); hubImageIndex=c.hubImageIndex||{}; catalogLastSync=c.savedAt||0;
  }
  async function fetchRemoteText(url){
    // Sites sem CORS vão direto pelo proxy de leitura (evita erro no console e um round-trip perdido)
    const noCors=/beycommunity.com|byybladebuilder.com/.test(url);
    const attempts=noCors?[`https://r.jina.ai/${url}`]:[url,`https://r.jina.ai/${url}`]; let last;
    for(const target of attempts){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try{const r=await fetch(target,{headers:{Accept:'text/plain,text/html,*/*'},signal:controller.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const t=await r.text();if(t.length>80)return t;}catch(e){last=e;}finally{clearTimeout(timer);}
    }
    throw last||new Error('Fonte indisponível');
  }
  function classifyProduct(rec){
    const blob=`${rec.name} ${rec.type} ${rec.series} ${rec.catalogSection||''}`.toLowerCase();
    const collab=/collab|marvel|star wars|transformers|jurassic|nfl|nba|mandalorian|skywalker|vader|spider-man|venom|thanos|iron man|captain america|miles morales|optimus|megatron|bumblebee|shockwave|t\. ?rex|mosasaurus/.test(blob);
    const collector=/x over|anniversary|limited|event|tournament|promotion|promotions|metal(?:lic)? coat|b4|store exclusive|app.*exclusive|限定|reprint|25th|others \(/.test(blob);
    const mainline=/(basic line|unique line|custom line)/.test(blob) && !collab && !collector;
    const isBeyProduct=/starter|booster|deck set|battle set|multipack|anniversary|customize set|entry set/i.test(rec.type||'') || (/\bset\b/i.test(rec.name||'')&&!/bits? set|launcher|grip|case/i.test(rec.name||''));
    return {...rec,collab,collector,mainline,nonMain:!mainline,isBeyProduct};
  }
  function parseBeyCommunityProducts(text,brand){
    const out=[];
    // If the source allows direct CORS and returns HTML, read the tables directly.
    if(/<table[\s>]/i.test(text) && typeof DOMParser!=='undefined'){
      const doc=new DOMParser().parseFromString(text,'text/html');
      doc.querySelectorAll('table').forEach(table=>{
        let section='';for(let n=table.previousElementSibling;n;n=n.previousElementSibling){if(/^H2$/i.test(n.tagName)){section=n.textContent.trim();break;}}
        table.querySelectorAll('tbody tr, tr').forEach(tr=>{
          const cells=[...tr.querySelectorAll('th,td')].map(td=>td.textContent.replace(/\s+/g,' ').trim());
          if(cells.length<4||/^code$/i.test(cells[0]))return;
          const [code,name,type,series]=cells;if(!name||!/(?:BX|UX|CX|BXC|BXG|BXH|G|F)[A-Z0-9-]*/i.test(code||''))return;
          out.push(classifyProduct({brand,code,name,type,series,catalogSection:section,sourceUrl:brand==='Hasbro'?REMOTE.productsHasbro:REMOTE.productsTT}));
        });
      });
      if(out.length)return out;
    }
    // r.jina.ai exposes the same tables as Markdown.
    let section='';
    for(const raw of text.split(/\r?\n/)){
      const heading=raw.trim().match(/^##\s+(.+)/);if(heading){section=stripMd(heading[1]).trim();continue;}
      const plainSection=stripMd(raw).trim();if(/^(Basic Line|Unique Line|Custom Line|X Over Project|Multipack Sets|Others \(Promotions, Tournaments, etc\.\))$/i.test(plainSection)){section=plainSection;continue;}
      const line=plainSection;if(!line.includes('|'))continue;
      const cells=line.replace(/^\|/,'').replace(/\|$/,'').split('|').map(stripMd).map(x=>x.trim()).filter(Boolean);
      if(cells.length<3||/^code$/i.test(cells[0])||/^[-: ]+$/.test(cells[0]))continue;
      const code=cells[0];if(!/(?:BX|UX|CX|BXC|BXG|BXH|G|F)[A-Z0-9-]*/i.test(code||''))continue;
      const typeRe=/^(Starter|Booster|Random Booster|Deck Set|Battle Set|Multipack Sets|Entry Set|Customize Set|Anniversary|Stadium|Launcher|Grip|Accessory|Blade|Bit|Tool)$/i;
      let typeIndex=-1;for(let i=2;i<cells.length;i++){if(typeRe.test(cells[i])){typeIndex=i;break;}}
      if(typeIndex<2)continue;
      const name=cells.slice(1,typeIndex).join(' | '),type=cells[typeIndex],series=cells[typeIndex+1]||section;
      if(!name)continue;
      out.push(classifyProduct({brand,code,name,type,series:series||section,catalogSection:section,sourceUrl:brand==='Hasbro'?REMOTE.productsHasbro:REMOTE.productsTT}));
    }
    return out;
  }
  function saveProductCatalog(){try{localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify({savedAt:Date.now(),items:productCatalog}));}catch{}}
  function loadProductCatalog(){const c=loadJSON(PRODUCT_CACHE_KEY,null);productCatalog=Array.isArray(c?.items)?c.items:[];return c?.savedAt||0;}
  function mergeProductCatalog(items){
    const map=new Map(productCatalog.map(x=>[`${x.brand}|${x.code}|${equivalentKey(x.name)}`,x]));
    for(const item of items){const key=`${item.brand}|${item.code}|${equivalentKey(item.name)}`;map.set(key,{...(map.get(key)||{}),...item});}
    productCatalog=[...map.values()];saveProductCatalog();return productCatalog.length;
  }
  function searchTokens(v){return slug(String(v||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2')).split('-').filter(x=>x.length>1);}
  function fuzzyCatalogMatch(value,q){const vk=equivalentKey(value),qk=equivalentKey(q);if(vk.includes(qk)||qk.includes(vk))return true;const qt=searchTokens(q),vt=searchTokens(value);return qt.length>1&&qt.every(t=>vt.includes(t));}
  function productSearch(q){const k=equivalentKey(q);if(!k)return[];return productCatalog.filter(p=>[p.name,p.code,p.type,p.series,p.brand].some(v=>fuzzyCatalogMatch(v,q))).slice(0,40);}
  function canonicalProductKey(name){
    let raw=String(name||'').replace(/\([^)]*\)/g,'').trim();
    if(/^Random Booster\s+/i.test(raw)&&/\sSelect$/i.test(raw))raw=raw.replace(/^Random Booster\s+/i,'').replace(/\s+Select$/i,'');
    raw=raw.replace(/\s+Deck Set$/i,'').replace(/\s+-\s+Entry Package$/i,'').replace(/\s+(?:Metal(?:lic)? Coat|Special Ver(?:sion)?|Ver(?:sion)?\.?\s*\d*(?:\.\d+)?).*$/i,'').trim();
    let key=equivalentKey(raw);
    const aliases=[];
    PARENTS().filter(p=>['blade','integrated','lock','main'].includes(p.kind)).forEach(p=>{
      const canon=equivalentKey(p.display||p.name);for(const a of [p.name,p.display,...(p.aliases||[])]){const ak=equivalentKey(a);if(ak&&ak.length>=4)aliases.push([ak,canon]);}
    });
    aliases.sort((a,b)=>b[0].length-a[0].length);
    for(const [a,c] of aliases){if(key.includes(a)){key=key.replace(a,c);break;}}
    return key.replace(/(?:green|blue|red|black|white|yellow|orange|purple|gold|silver)version/g,'');
  }
  function productGroupKey(p,selectLeadIds=null){
    const base=canonicalProductKey(p.name)||`${p.brand}:${p.code}`;
    if(p.collector||p.collab)return `${base}|special:${equivalentKey(p.name)}`;
    const lead=productLeadPart(p);
    if(lead && selectLeadIds?.has(lead.id))return `select:${lead.id}`;
    return base;
  }
  function productLeadPart(product){
    const k=equivalentKey(product.name);let best=null,score=0;
    for(const p of PARENTS().filter(x=>['blade','integrated','main'].includes(x.kind))){for(const a of normalizedAliases(p)){if(a.length>=4&&k.includes(a)&&a.length>score){best=p;score=a.length;}}}
    return best;
  }
  function isProductOwned(p){const pk=equivalentKey(p.name);return stockOwned.some(label=>{const ok=equivalentKey(String(label||'').replace(/\([^)]*\)/g,''));return ok===pk||ok.includes(pk)||pk.includes(ok);});}
  function shoppingUrl(store,name,brand){const q=encodeURIComponent(`Beyblade X ${name}`);if(store==='ml')return `https://lista.mercadolivre.com.br/${encodeURIComponent(`beyblade x ${name}`)}`;if(store==='shopee')return `https://shopee.com.br/search?keyword=${q}`;if(store==='amazonjp')return `https://www.amazon.co.jp/s?k=${q}`;return `https://www.amazon.com.br/s?k=${q}`;}
  function productGroups(){
    const groups=new Map(),selectLeadIds=new Set();
    for(const p of productCatalog){if(!p.collector&&!p.collab&&/^Random Booster .* Select$/i.test(p.name)){const lead=productLeadPart(p);if(lead)selectLeadIds.add(lead.id);}}
    for(const p of productCatalog){const k=productGroupKey(p,selectLeadIds);if(!groups.has(k))groups.set(k,{key:k,tt:[],hasbro:[]});groups.get(k)[p.brand==='Hasbro'?'hasbro':'tt'].push(p);}
    return [...groups.values()];
  }
  const CHECK_ORDER=['blade','integrated','lock','over','main','assist','ratchet','bit','rib'];
  function renderMissing(){
    const root=document.getElementById('missingGrid');if(!root)return;
    const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const q=norm(document.getElementById('missingSearchInput')?.value||'');
    const show=document.getElementById('missingShowFilter')?.value||'all';
    const all=PARENTS().filter(p=>CHECK_ORDER.includes(p.kind)&&!p.hidden);
    const ownedTotal=all.filter(p=>(inventory[p.id]||0)>0).length;
    const count=document.getElementById('missingCount');if(count)count.textContent=`${ownedTotal}/${all.length} peças na coleção • faltam ${all.length-ownedTotal}`;
    const st=document.getElementById('missingCatalogStatus');if(st)st.textContent=`${all.length} peças no catálogo`;
    const sections=CHECK_ORDER.map(kind=>{
      const items=all.filter(p=>p.kind===kind).sort((x,y)=>{const ox=(inventory[x.id]||0)>0,oy=(inventory[y.id]||0)>0;if(ox!==oy)return ox?-1:1;return x.display.localeCompare(y.display);});
      if(!items.length)return'';
      const owned=items.filter(p=>(inventory[p.id]||0)>0).length;
      const shown=items.filter(p=>{const has=(inventory[p.id]||0)>0;if(show==='missing'&&has)return false;if(show==='owned'&&!has)return false;if(q&&!norm(`${p.display} ${p.name||''} ${p.abbrev||''} ${(p.aliases||[]).join(' ')}`).includes(q))return false;return true;});
      if(!shown.length)return'';
      const pct=Math.round(owned/items.length*100);
      return `<section class="chk-section"><div class="chk-head"><div><h2>${KIND_LABEL[kind]||kind}</h2><small>${owned} de ${items.length} • ${pct}%</small></div><div class="chk-bar"><i style="width:${pct}%"></i></div></div><div class="chk-grid">${shown.map(p=>{const qty=inventory[p.id]||0,has=qty>0;
        return `<div class="chk-item ${has?'owned':'missing'}" data-id="${escapeAttr(p.id)}" title="${escapeAttr(has?`Você tem ${qty}`:'Clique para marcar como tenho (adiciona à coleção)')}">${partArt(p)}<div class="chk-meta"><strong><a class="plink" href="/peca/${slug(p.display||p.name)}">${escapeHTML(p.display)}</a></strong><small>${p.abbrev?escapeHTML(p.abbrev):''}${has&&qty>1?` ×${qty}`:''}${p.banned?' • banida':''}</small></div><span class="chk-mark">${has?`${BX.ic('check', 14)}`:'+'}</span></div>`;}).join('')}</div></section>`;
    }).join('');
    root.innerHTML=sections||'<div class="empty-state">Nenhuma peça com esses filtros.</div>';
    root.querySelectorAll('.chk-item.missing').forEach(el=>el.addEventListener('click',async e=>{if(e.target.closest('a'))return;const p=PARTS[el.dataset.id];if(!p)return;const c=await chooseColor(p);if(!c)return;changeManualQty(c.id,1);toast(`${c.display}${c.colorLabel?` (${c.colorLabel})`:''} marcada como "tenho".`);}));
    hydrateImages(root);
  }
  function normalizedAliases(part){return [part.name,part.display,part.abbrev,...(part.aliases||[])].filter(Boolean).map(equivalentKey);}
  function parseByyParts(text){
    let section='',pending='',bladeType=''; let added=0;
    for(const raw of text.split(/\r?\n/)){
      const line=raw.trim();
      if(/All Beyblade X Blades/i.test(line)){section='blade';pending='';bladeType='';continue;}
      if(/All Beyblade X Ratchets/i.test(line)){section='ratchet';pending='';bladeType='';continue;}
      if(/All Beyblade X Bits/i.test(line)){section='bit';pending='';bladeType='';continue;}
      if(section==='blade'){
        const tm=stripMd(line).match(/^(Attack|Defense|Stamina|Balance) Type Blades/i);
        if(tm){bladeType=tm[1][0].toUpperCase()+tm[1].slice(1).toLowerCase();pending='';continue;}
      }
      if(!line.includes('|')){if(section==='blade' && line && !/^[-#]/.test(line) && line.length<80)pending=stripMd(line);continue;}
      const cells=line.replace(/^\|/,'').replace(/\|$/,'').split('|').map(stripMd);
      if(cells.some(x=>/ATK\/DEF\/STA|---/.test(x)))continue;
      if(section==='blade' && cells.length>=6){
        let name=cells[0],aliases=[];
        if(/^Hasbro:/i.test(name)){aliases.push(name.replace(/^Hasbro:\s*/i,''));name=pending||aliases[0];}
        else {const hm=name.match(/Hasbro:\s*([^/]+)/i);if(hm)aliases.push(hm[1].trim());name=name.split(/Hasbro:/i)[0].replace(/\s*\/\s*$/,'').trim();}
        const stats=parseStats(cells[2]);if(!name||!stats)continue;
        const notes=cells.slice(6).join(' '),geometry=cells[5]||''; const integrated=/ratchet[- ]integrated|integrated.*ratchet/i.test(notes);
        const part=P(integrated?'integrated':'blade',name,{display:name,aliases,type:bladeType||inferType(stats),stats,weight:cells[3],spin:cells[4],geometry,note:notes,source:REMOTE.parts});reg(part);added++;pending='';
      } else if(section==='ratchet' && cells.length>=6 && /^[0-9M]+-\d{2}$/i.test(cells[0])){
        const stats=parseStats(cells[3]);reg(P('ratchet',cells[0],{display:cells[0],abbrev:cells[0],stats,note:cells.slice(6).join(' '),weight:cells[4],source:REMOTE.parts}));added++;
      } else if(section==='bit' && cells.length>=9){
        const name=cells[0],abbr=cells[1];if(!name||!abbr||!/^[A-Za-z]{1,3}$/.test(abbr))continue;
        const stats=parseStats(cells[4]);if(stats)stats.dash=parseFloat(cells[5])||0;
        const integrated=/Ratchet-Integrated/i.test(cells.slice(8).join(' ')); const kind=integrated?'rib':'bit';
        reg(P(kind,name,{display:name,abbrev:abbr,type:cells[3]||inferType(stats),stats,line:cells[2],weight:cells[7],behavior:cells.slice(9).join(' ')||cells[8],banned:abbr.toUpperCase()==='MN',source:REMOTE.parts}));
        BIT_NAMES[abbr.toUpperCase()]=name;added++;
      }
    }
    return added;
  }
  function extractImages(text){
    const out=[]; let m;
    const md=/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+[^)]*)?\)/g;
    while((m=md.exec(text)))out.push({alt:stripMd(m[1]),url:m[2],pos:m.index});
    const html=/<img[^>]+(?:alt=["']([^"']*)["'][^>]+src=["']([^"']+)["']|src=["']([^"']+)["'][^>]+alt=["']([^"']*)["'])[^>]*>/gi;
    while((m=html.exec(text)))out.push({alt:stripMd(m[1]||m[4]),url:m[2]||m[3],pos:m.index});
    return out;
  }
  const HUB_TYPE = raw => /攻擊/.test(raw)?'Attack':/防守/.test(raw)?'Defense':/持久/.test(raw)?'Stamina':/均衡/.test(raw)?'Balance':'';
  function hubEnglishName(block){
    const lines=block.split(/\r?\n/).map(stripMd).map(x=>x.trim()).filter(Boolean);
    for(const line of lines){
      const m=line.match(/^([A-Za-z][A-Za-z0-9 .&'’\-]{1,48}?)(?=[\u3040-\u30ff])/);
      if(m && !/^(Image|Right|Left|Attack|Defense|Stamina|Balance)$/i.test(m[1].trim())) return m[1].trim();
    }
    return '';
  }
  function hubStats(block){
    const a=block.match(/(?:攻擊|Attack)\s*[:：]?\s*(\d+)/i),d=block.match(/(?:防禦|防御|Defense)\s*[:：]?\s*(\d+)/i),st=block.match(/(?:持久|Stamina)\s*[:：]?\s*(\d+)/i);
    return a&&d&&st?{atk:+a[1],def:+d[1],sta:+st[1]}:null;
  }
  function parseHubBladeCatalog(text){
    const imgs=extractImages(text);let added=0;
    for(let i=0;i<imgs.length;i++){
      const im=imgs[i];if(!/(上蓋|blade|fused|重量)/i.test(im.alt||''))continue;
      const end=imgs[i+1]?.pos||Math.min(text.length,im.pos+1400);const block=text.slice(im.pos,Math.min(end,im.pos+1400));
      const name=hubEnglishName(block);if(!name)continue;
      const integrated=/Fused|Ratchet[- ]Integrated|一體型|一体型/i.test(block);
      const spin=/左旋|Left Spin/i.test(block)?'Left':/右旋|Right Spin/i.test(block)?'Right':'';
      const wm=block.match(/(?:重量|Weight)\s*([0-9.]+)\s*g/i),cm=block.match(/(?:代碼|Code)\s*([A-Z]+-[A-Z0-9-]+)/i);
      const existing=Object.values(PARTS).find(p=>['blade','integrated'].includes(p.kind)&&normalizedAliases(p).includes(equivalentKey(name)));
      if(existing && !existing.stats && !BLADE_PROFILE[existing.id]) existing.type='';
      const kind=integrated?'integrated':(existing?.kind||'blade');
      // BeybladeHub is used here as a deterministic image/name index. We deliberately do not
      // import its nearby type text into Blades because page context can bleed between cards.
      const canonical=existing?.name||name;const p=P(kind,canonical,{display:existing?.display||name,aliases:existing?[name]:[],type:existing?.type||'',stats:existing?.stats||null,spin:spin||existing?.spin||'',weight:wm?`${wm[1]}g`:(existing?.weight||''),remoteCode:cm?.[1]||existing?.remoteCode||'',image:im.url,source:REMOTE.hubBlades});
      const id=reg(p);hubImageIndex[id]=im.url;added++;
    }
    return added;
  }
  function parseHubRatchetCatalog(text){
    const imgs=extractImages(text);let added=0;
    for(let i=0;i<imgs.length;i++){
      const im=imgs[i];if(!/ratchet/i.test(im.alt||''))continue;
      const end=imgs[i+1]?.pos||Math.min(text.length,im.pos+700);const block=text.slice(im.pos,Math.min(end,im.pos+700));const m=block.match(/\b([0-9M]+-\d{2})\b/i);if(!m)continue;
      const code=m[1].toUpperCase();const p=P('ratchet',code,{display:code,abbrev:code,image:im.url,source:REMOTE.hubRatchets});const id=reg(p);hubImageIndex[id]=im.url;added++;
    }
    return added;
  }
  function parseHubBitCatalog(text){
    const imgs=extractImages(text);let added=0;
    for(let i=0;i<imgs.length;i++){
      const im=imgs[i];const am=(im.alt||'').match(/^([A-Za-z]{1,3})\s+bit/i);if(!am)continue;
      const abbr=am[1],end=imgs[i+1]?.pos||Math.min(text.length,im.pos+850);const block=text.slice(im.pos,Math.min(end,im.pos+850));
      const hubName=hubEnglishName(block)||BIT_NAMES[abbr.toUpperCase()]||abbr;const type=HUB_TYPE(block);const integrated=/Fused|Ratchet[- ]Integrated|一體型|一体型/i.test(block);const kind=integrated?'rib':'bit';
      const existing=Object.values(PARTS).find(p=>p.kind===kind&&String(p.abbrev||'').toUpperCase()===abbr.toUpperCase());const canonical=existing?.name||BIT_NAMES[abbr.toUpperCase()]||hubName;
      if(!BIT_NAMES[abbr.toUpperCase()])BIT_NAMES[abbr.toUpperCase()]=canonical;const p=P(kind,canonical,{display:existing?.display||canonical,aliases:hubName!==canonical?[hubName]:[],abbrev:abbr,type:type||existing?.type,image:im.url,banned:abbr.toUpperCase()==='MN',source:REMOTE.hubBits});const id=reg(p);hubImageIndex[id]=im.url;added++;
    }
    return added;
  }

  function mapHubImages(text,kinds){
    const imgs=extractImages(text); if(!imgs.length)return 0; let n=0;
    const candidates=PARENTS().filter(p=>kinds.includes(p.kind)); // recolors mantêm a própria foto
    for(const part of candidates){
      const keys=normalizedAliases(part).filter(x=>x.length>1); if(!keys.length)continue;
      let best=null,bestScore=0;
      for(const im of imgs){const ctx=equivalentKey(text.slice(Math.max(0,im.pos-180),Math.min(text.length,im.pos+650))+' '+im.alt);let score=0;for(const k of keys){if(ctx.includes(k))score=Math.max(score,k.length);}if(score>bestScore){bestScore=score;best=im;}}
      if(best && bestScore>=Math.min(3,keys[0].length)){part.image=best.url;hubImageIndex[part.id]=best.url;n++;}
    }
    return n;
  }
  async function syncLiveCatalog({quiet=false,force=false}={}){
    if(catalogSyncing){while(catalogSyncing)await new Promise(r=>setTimeout(r,80));return;} const age=Date.now()-catalogLastSync;if(!force&&age<24*3600e3){if(!quiet)toast('O catálogo já foi sincronizado nas últimas 24 horas.');return;}
    catalogSyncing=true; updateCatalogStatus('Sincronizando…','live',true);
    try{
      const results=await Promise.allSettled([fetchRemoteText(REMOTE.parts),fetchRemoteText(REMOTE.hubBlades),fetchRemoteText(REMOTE.hubRatchets),fetchRemoteText(REMOTE.hubBits),fetchRemoteText(REMOTE.productsTT),fetchRemoteText(REMOTE.productsHasbro)]);
      let count=0,successful=0;
      if(results[0].status==='fulfilled'){count=parseByyParts(results[0].value);successful++;}
      if(results[1].status==='fulfilled'){parseHubBladeCatalog(results[1].value);mapHubImages(results[1].value,['blade','integrated']);successful++;}
      if(results[2].status==='fulfilled'){parseHubRatchetCatalog(results[2].value);mapHubImages(results[2].value,['ratchet']);successful++;}
      if(results[3].status==='fulfilled'){parseHubBitCatalog(results[3].value);mapHubImages(results[3].value,['bit','rib']);successful++;}
      const products=[];
      if(results[4].status==='fulfilled'){products.push(...parseBeyCommunityProducts(results[4].value,'Takara Tomy'));successful++;}
      if(results[5].status==='fulfilled'){products.push(...parseBeyCommunityProducts(results[5].value,'Hasbro'));successful++;}
      if(products.length)mergeProductCatalog(products);
      if(!successful)throw new Error('Todas as fontes falharam');
      catalogLastSync=Date.now();saveLiveCatalog();updateCatalogStatus(`Online • ${PARENTS().length} peças • ${productCatalog.length} produtos`,'live');renderAll();
      if(!quiet)toast('Catálogo e heurísticas atualizados.');
    }catch(e){updateCatalogStatus('Offline • usando cache','error');renderMissing();if(!quiet)toast('Não consegui atualizar agora; mantive o catálogo em cache.');}
    finally{catalogSyncing=false;}
  }
  function updateCatalogStatus(text,cls='',pulse=false){const el=document.getElementById('catalogStatus');if(!el)return;el.className=`catalog-status ${cls}`;el.innerHTML=`${pulse?'<i class="online-pulse"></i>':''}${escapeHTML(text)}`;}
  function livePartSearch(q){const key=equivalentKey(q);if(!key)return[];return Object.values(PARTS).filter(p=>normalizedAliases(p).some(a=>a.includes(key)||key.includes(a))).sort((a,b)=>(a.kind===b.kind?0:a.kind==='blade'?-1:1)||a.display.localeCompare(b.display)).slice(0,30);}
  function catalogProductTitle(x){return x.title||x.name||'';}
  function renderCatalogMixed(items,links){
    const root=document.getElementById('catalogSearchResults');if(!root)return;
    if(!items.length&&!links.length){root.innerHTML='<div class="catalog-empty">Nenhuma peça ou produto encontrado. Tente o nome TT, Hasbro, código do produto ou uma parte do nome.</div>';return;}
    const partsHtml=items.length?`<div class="catalog-section"><div class="catalog-section-title">Peças</div>${items.map(p=>`<article class="catalog-result">${partArt(p,'mini')}<div><strong>${escapeHTML(p.display)}${p.abbrev?` <span class="muted">${escapeHTML(p.abbrev)}</span>`:''}</strong><small>${escapeHTML(KIND_LABEL[p.kind]||p.kind)}${p.kind!=='ratchet'&&p.type?' • '+escapeHTML(p.type):''}</small><small>${p.stats?`ATK ${p.stats.atk} • DEF ${p.stats.def} • STA ${p.stats.sta}`:'perfil será completado sob demanda'}</small></div><button class="icon-btn result-copy" data-id="${p.id}" title="Adicionar 1 à coleção">＋</button></article>`).join('')}</div>`:'';
    const productHtml=links.length?`<div class="catalog-section"><div class="catalog-section-title">Beys / produtos</div>${links.slice(0,24).map((x,i)=>`<article class="catalog-result product-result"><div class="product-orb">BX</div><div><strong>${escapeHTML(catalogProductTitle(x))}</strong><small>${escapeHTML(x.brand||'Catálogo online')}${x.code?` • ${escapeHTML(x.code)}`:''}</small><small>${escapeHTML(x.type||x.series||'Beyblade / produto')}</small></div><button class="icon-btn product-import" data-i="${i}" title="Adicionar este Bey à lista da coleção">＋</button></article>`).join('')}</div>`:'';
    root.innerHTML=partsHtml+productHtml;
    root.querySelectorAll('.result-copy').forEach(b=>b.addEventListener('click',()=>addCatalogPartToCollection(b.dataset.id)));
    root.querySelectorAll('.product-import').forEach(b=>b.addEventListener('click',async()=>{const x=links[+b.dataset.i],box=document.getElementById('inventoryText'),line=catalogProductTitle(x).trim(),lines=(box.value||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(!lines.some(v=>equivalentKey(v)===equivalentKey(line)))lines.push(line);box.value=lines.join('\n');await smartImportInventory(box.value);}));
    hydrateImages(root);
  }
  function renderCatalogResults(items){renderCatalogMixed(items,[]);}
  function renderCatalogProducts(links){renderCatalogMixed([],links);}
  async function searchCatalog(){
    const q=document.getElementById('catalogSearchInput').value.trim();if(!q){toast('Digite uma peça ou Bey para buscar.');return;}
    const root=document.getElementById('catalogSearchResults');if(root)root.innerHTML='<div class="catalog-empty">Consultando peças e lançamentos online…</div>';
    await syncLiveCatalog({quiet:true,force:false});
    const items=livePartSearch(q);let products=productSearch(q).map(p=>({...p,title:p.name}));
    try{
      const text=await fetchRemoteText(phstudySearchUrl(q));
      const remote=extractProductLinks(text);
      const seen=new Set(products.map(x=>equivalentKey(catalogProductTitle(x))));
      for(const x of remote){const k=equivalentKey(x.title);if(!seen.has(k)){seen.add(k);products.push(x);}}
    }catch{}
    renderCatalogMixed(items,products);
  }
  function addCatalogPartToCollection(id){const p=PARTS[id];if(!p)return;if(!manualParts[id])manualParts[id]={part:p,qty:0};manualParts[id].part=p;manualParts[id].qty++;persistCollection();rebuildInventory();toast(`${p.display} adicionada à coleção.`);}

  function phstudySearchUrl(q){return `${REMOTE.phstudy}?search=${encodeURIComponent(q)}`;}
  function extractProductLinks(text){
    const out=[],seen=new Set();let m;const re=/\[([^\]]+)\]\((https?:\/\/beyblade\.phstudy\.org)?(\/p\/en-US\/[^)\s]+\.html)\)/g;
    while((m=re.exec(text))){const url=(m[2]||'https://beyblade.phstudy.org')+m[3];if(!seen.has(url)){seen.add(url);out.push({title:stripMd(m[1]),url});}}
    return out;
  }
  function cleanRemotePartName(v){return stripMd(v).replace(/^(?:BX|UX|CX|BXC|BXG|BXH|G|F)[A-Z0-9-]*\s*/i,'').replace(/\s+(?:Metal(?:lic)? Coat|Special Ver\.|Ver\.).*$/i,'').trim();}
  function parsePhstudyProduct(text,label=''){
    const pageLower=text.toLowerCase();const entries=[];const re=/(?:^|\n)\s*[-*]\s*(Lock Chip|Main Blade|Assist Blade|Over Blade|Metal Blade|Blade|Ratchet|Bit)\s*([^\n]+)/gi;let m;
    while((m=re.exec(text))){
      const labelKind=m[1].toLowerCase();const body=stripMd(m[2]);const stats={};const am=body.match(/Attack\s*(\d+)/i),dm=body.match(/Defense\s*(\d+)/i),sm=body.match(/Stamina\s*(\d+)/i),dash=body.match(/Dash\s*(\d+)/i);if(am)stats.atk=+am[1];if(dm)stats.def=+dm[1];if(sm)stats.sta=+sm[1];if(dash)stats.dash=+dash[1];
      const typ=(body.match(/Type:\s*(Attack|Defense|Stamina|Balance)/i)||[])[1]||'';
      if(labelKind==='ratchet'){
        const rm=body.match(/\b([0-9M]+-\d{2})\b/i);entries.push({kind:'ratchet',name:rm?rm[1]:'INTEGRATED',integrated:!rm&&(/integrated|一体型/i.test(body+text))});continue;
      }
      if(labelKind==='bit'){
        const keys=[...Object.keys(BIT_NAMES),'OP','TR'].sort((a,b)=>b.length-a.length);const bm=body.match(new RegExp(`\\b(${keys.join('|')})(?=Type|\\b)`,'i'));const ab=(bm?.[1]||'').toUpperCase();const rib=['OP','TR'].includes(ab);const name=rib?(ab==='OP'?'Operate':'Turbo'):(BIT_NAMES[ab]||ab||cleanRemotePartName(body.split(/Type:/i)[0]));entries.push({kind:rib?'rib':'bit',name,abbrev:ab==='TR'?'Tr':ab==='OP'?'Op':ab,type:typ,stats:Object.keys(stats).length?stats:null});continue;
      }
      let kind={'lock chip':'lock','main blade':'main','assist blade':'assist','over blade':'over','metal blade':'main','blade':'blade'}[labelKind];
      let name=cleanRemotePartName(body.split(/Type:/i)[0]);name=name.replace(/^[A-Z]{2,5}[A-Z0-9-]*\s*/,'').trim();
      entries.push({kind,name,type:typ,stats:Object.keys(stats).length?stats:null,requiresOver:labelKind==='metal blade'});
    }
    if(!entries.length)return null;
    const bladeEntry=entries.find(x=>x.kind==='blade');const integRatchet=entries.some(x=>x.kind==='ratchet'&&x.integrated);
    if(bladeEntry&&integRatchet)bladeEntry.kind='integrated';
    const ids=[]; for(const e of entries){if(e.integrated||!e.name||e.name==='INTEGRATED')continue;const part=P(e.kind,e.name,{display:e.name,abbrev:e.abbrev||'',type:e.type||inferType(e.stats),stats:e.stats,requiresOver:e.requiresOver,banned:e.abbrev==='MN',basicLock:e.kind==='lock'&&!/metal/i.test(e.name),source:REMOTE.phstudy});ids.push(reg(part));}
    let mode=ids.some(id=>PARTS[id]?.kind==='rib')?'cxrib':ids.some(id=>PARTS[id]?.kind==='main')?'cx':ids.some(id=>PARTS[id]?.kind==='integrated')?'integrated':'standard';
    const system=mode==='cxrib'?'Custom Line • Ratchet-Integrated Bit':mode==='cx'?'Custom Line':mode==='integrated'?'UX/Unique Expand • Ratchet integrada':'BX/UX/Hasbro';
    saveLiveCatalog();return {match:[normalizeLine(label)],label:label.replace(/\([^)]*\)/g,'').trim(),type:'',system,pieces:ids};
  }
  async function resolveOnlineStockLine(line){
    try{const search=await fetchRemoteText(phstudySearchUrl(line.replace(/\([^)]*\)/g,'')));const links=extractProductLinks(search);if(!links.length)return null;const target=links.find(x=>{const a=equivalentKey(x.title),b=equivalentKey(line);return a.includes(b)||b.includes(a)})||links[0];const detail=await fetchRemoteText(target.url);const rec=parsePhstudyProduct(detail,line);if(rec){onlineStockCache.push(rec);localStorage.setItem(ONLINE_STOCK_KEY,JSON.stringify(onlineStockCache));STOCK.push(rec);}return rec;}catch{return null;}
  }
  async function smartImportInventory(text){
    updateCatalogStatus('Validando lista…','live',true); await syncLiveCatalog({quiet:true,force:false});
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const unresolved=[];
    for(const line of lines){const n=normalizeLine(line);if(STOCK.some(s=>s.match.includes(n)))continue;const guessed=guessStockLine(line,true);const guessParts=guessed?.map(id=>PARTS[id]);const needsRemote=!guessed || guessParts.some(p=>p && ['blade','integrated'].includes(p.kind) && !p.stats && !BLADE_PROFILE[p.id]);if(needsRemote){const found=await resolveOnlineStockLine(line);if(!found&&!guessed)unresolved.push(line);}}
    importInventory(text,true);document.getElementById('importNote').textContent=unresolved.length?`Não consegui decompor automaticamente: ${unresolved.join(' • ')}. Você ainda pode adicionar as peças manualmente ou tentar “Atualizar catálogo”.`:'Todas as linhas foram reconhecidas. Peças online foram cacheadas neste navegador.';updateCatalogStatus(catalogLastSync?'Catálogo online/cache atualizado':'Catálogo local','live');toast(unresolved.length?`Coleção importada; ${unresolved.length} linha(s) precisam de revisão.`:'Coleção importada e validada.');
  }

  let inventoryText = '';
  let inventory = {};
  let inventoryOrigins = {};
  let stockOwned = [];
  let deck = loadJSON('bx_current_deck', emptyDeck());
  // Coleção e decks físicos vivem na CONTA (nuvem). Aqui só o espelho em memória.
  let manualParts = {};
  let sessionDraft = loadJSON('bx_session_draft', emptyDeck());
  let sessionDecks = [];
  let cloudUser = null, cloudReady = false;
  const SID_INDEX = () => { const m = new Map(); for (const p of Object.values(PARTS)) if (p.serverId) m.set(p.serverId, p); return m; };
  /** Itens da coleção no formato do servidor: só peças com id no catálogo do site. */
  function collectionServerItems(){
    const out=[]; for(const [id,rec] of Object.entries(manualParts)){ const p=PARTS[id]; const q=rec.qty||0; if(!p||!p.serverId||q<=0)continue; out.push({partId:p.serverId,qty:q}); }
    return out;
  }
  let persistTimer=null;
  function persistCollection(){
    if(!cloudReady||!cloudUser)return;
    clearTimeout(persistTimer);
    persistTimer=setTimeout(()=>{ window.BXApp?.cloud?.saveCollection?.(collectionServerItems()); },500);
  }
  const slotToServer=(slot)=>Object.fromEntries(Object.entries(slot).map(([k,v])=>[k,k==='mode'?v:(v?(PARTS[v]?.serverId||''):'')]));
  const slotFromServer=(slot,bySid)=>Object.fromEntries(Object.entries(slot).map(([k,v])=>[k,k==='mode'?v:(v?(bySid.get(v)?.id||''):'')]));
  function physicalServerList(){
    return sessionDecks.map((d,i)=>({id:d.id,name:d.name||`Deck físico ${i+1}`,slots:(d.deck||[]).map(slotToServer),beys:(d.deck||[]).map(slot=>slotParts(slot).map(id=>PARTS[id]?.serverId).filter(Boolean)),names:(d.deck||[]).map(slotName)}));
  }
  let physTimer=null;
  function persistPhysical(){
    if(!cloudReady||!cloudUser)return;
    clearTimeout(physTimer);
    physTimer=setTimeout(()=>{ window.BXApp?.cloud?.savePhysical?.(physicalServerList()); },400);
  }
  /**
   * Recebe a coleção/decks físicos da conta (chamado pela camada de comunidade depois do catálogo).
   * Na primeira vez, migra o que ainda existia no navegador (versões antigas) para a conta e apaga o local.
   */
  function setCloud(data){
    cloudUser=data?.user||null;
    const bySid=SID_INDEX();
    manualParts={}; sessionDecks=[];
    if(cloudUser){
      for(const it of data.items||[]){ const p=bySid.get(it.partId); if(!p||!(it.qty>0))continue; manualParts[p.id]={part:p,qty:(manualParts[p.id]?.qty||0)+it.qty}; }
      sessionDecks=(data.physical||[]).map(d=>({id:d.id,name:d.name,deck:(d.slots||[]).map(s=>slotFromServer(s,bySid))})).map(d=>{while(d.deck.length<3)d.deck.push(emptySlot());return d;});
      migrateLegacyLocal(bySid, !(data.items||[]).length, !(data.physical||[]).length);
    }
    cloudReady=true;
    rebuildInventory();
  }
  function migrateLegacyLocal(bySid, wantCollection, wantPhysical){
    let migrated=false;
    try{
      if(wantCollection){
        let manual=loadJSON('bx_manual_parts_v5',{}), text=localStorage.getItem('bx_v5_inventory_text')||'';
        const count=(m,t)=>Object.values(m).reduce((n,r)=>n+Math.max(0,r.qty||0),0)+t.split(/\r?\n/).filter(Boolean).length;
        if(!count(manual,text)){ // sem coleção atual no navegador: tenta o maior backup antigo
          const best=loadJSON('bx_collection_backups_v1',[]).sort((x,y)=>(y.count||0)-(x.count||0))[0];
          if(best){ try{manual=JSON.parse(best.manual||'{}');}catch{} text=best.text||''; }
        }
        for(const [id,rec] of Object.entries(manual)){ if(!(rec?.qty>0))continue; let p=PARTS[id]; if(!p&&rec.part){PARTS[id]=rec.part;p=rec.part;} if(!p)continue; manualParts[id]={part:p,qty:(manualParts[id]?.qty||0)+rec.qty}; migrated=true; }
        for(const id of linesToPieces(text)){ manualParts[id]={part:PARTS[id],qty:(manualParts[id]?.qty||0)+1}; migrated=true; }
      }
      if(wantPhysical){
        const legacy=loadJSON('bx_session_decks',[]);
        if(legacy.length){ sessionDecks=legacy.map(d=>({id:null,name:d.name,deck:(d.deck||[]).map(s=>({...emptySlot(),...s}))})); migrated=true; }
      }
    }catch{}
    for(const k of ['bx_manual_parts_v5','bx_v5_inventory_text','bx_collection_backups_v1','bx_session_decks'])localStorage.removeItem(k);
    if(migrated){ cloudReady=true; persistCollection(); persistPhysical(); toast('Sua coleção antiga (deste navegador) foi salva na sua conta.'); }
  }
  let tournament = loadJSON('bx_tournament', {maxPlayers:8, players:[], rounds:[], thirdPlaceEnabled:false, thirdPlaceMatch:null});
  tournament.thirdPlaceEnabled=!!tournament.thirdPlaceEnabled;
  if(!('thirdPlaceMatch' in tournament)) tournament.thirdPlaceMatch=null;
  let pendingPlayerPhoto = '';
  let slotPickerAction = null;
  let dragSourceSlot = null;
  let metaDecks = loadJSON(META_CACHE_KEY, [...RECENT_META_SEED, ...POPULAR, ...BEYBASE_META_SEED]);
  let metaVisible = Math.min(18, metaDecks.length);
  let metaCursor = loadJSON(META_CURSOR_KEY, 1);
  let bbxhubCursor = loadJSON(BBXHUB_CURSOR_KEY, 0);

  function emptySlot() { return { mode:'standard', blade:'', lock:'', main:'', assist:'', over:'', ratchet:'', bit:'', rib:'' }; }
  function emptyDeck() { return [emptySlot(),emptySlot(),emptySlot()]; }
  function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  const undoStack=[]; let undoSkip=false; let lastSavedDeck=JSON.stringify(deck);
  function saveState() { const s=JSON.stringify(deck); localStorage.setItem('bx_current_deck', s); if(typeof trackUndo==='function')trackUndo(s); }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function deckBeyNames(dk){ return (dk||[]).map(slot=>slotParts(slot).map(id=>PARTS[id]?.display||id)); }
  function saveSession(){
    sessionDecks.forEach(d=>{ d.beys=deckBeyNames(d.deck); d.names=(d.deck||[]).map(slotName); });
    localStorage.setItem('bx_session_draft', JSON.stringify(sessionDraft));
    persistPhysical();
  }
  function saveTournament(){ localStorage.setItem('bx_tournament', JSON.stringify(tournament)); }

  function normalizeLine(line) {
    return line.replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  }

  /** Decompõe linhas "Blade Ratchet Bit" em ids de peça (STOCK conhecido ou parser genérico). Linhas não reconhecidas em `unknown`. */
  function linesToPieces(text, unknown=[]){
    const ids=[];
    String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
      const n=normalizeLine(line);
      const found=STOCK.find(s=>s.match.includes(n));
      if(found){found.pieces.forEach(id=>{if(PARTS[id])ids.push(id);});return;}
      const guessed=guessStockLine(line);
      if(guessed)guessed.forEach(id=>{if(PARTS[id])ids.push(id);}); else unknown.push(line);
    });
    return ids;
  }
  /** Recalcula o inventário a partir do espelho da coleção (recolors somam na peça-pai). */
  function rebuildInventory(){
    const inv={}, origins={};
    Object.entries(manualParts).forEach(([id, rec]) => {
      if(!PARTS[id]&&rec.part){ const stored={...rec.part}; if(['blade','integrated'].includes(stored.kind)&&!stored.stats&&!BLADE_PROFILE[stored.id])stored.type=''; PARTS[id]=stored; }
      if(!PARTS[id])return;
      inv[id]=(inv[id]||0)+(rec.qty||0);
      origins[id]={loose:{label:'Na coleção',kind:'loose',qty:rec.qty||0}};
    });
    for (const [id, q] of Object.entries(inv)) { const pid = PARTS[id]?.parentId; if (pid && q > 0) inv[pid] = (inv[pid] || 0) + q; }
    Object.keys(inv).forEach(id => { if (inv[id] <= 0) delete inv[id]; });
    inventory = inv; inventoryOrigins = origins; stockOwned = [];
    renderAll();
  }
  /** Lista colada: cada linha vira peças adicionadas à coleção (na conta). */
  function importInventory(text, quiet=false) {
    const unknown=[];
    const ids=linesToPieces(text, unknown);
    if(!cloudUser){ toast('Entre na sua conta para salvar a coleção.'); return; }
    for(const id of ids){ if(!manualParts[id])manualParts[id]={part:PARTS[id],qty:0}; manualParts[id].qty+=1; }
    if(ids.length)persistCollection();
    const ta=document.getElementById('inventoryText'); if(ta)ta.value=unknown.join('\n');
    rebuildInventory();
    if (!quiet) toast(ids.length?`${ids.length} peça(s) adicionada(s) à coleção.${unknown.length?` ${unknown.length} linha(s) não reconhecida(s).`:''}`:'Nenhuma linha reconhecida.');
    const note=document.getElementById('importNote'); if(note)note.textContent = unknown.length
      ? `Não consegui decompor automaticamente: ${unknown.join(' • ')}. Corrija o nome ou adicione as peças pela aba Peças.`
      : (ids.length?`${ids.length} peça(s) adicionada(s) à sua coleção.`:'');
  }

  function guessStockLine(line) {
    const raw = line.replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
    const m = raw.match(/^(.*?)\s+([0-9M]+-\d{2})\s*([A-Za-z]{1,3})$/i);
    if (m) {
      const bladeName=m[1].trim(), ratchet=m[2].toUpperCase(), bitAbbr=m[3].toUpperCase();
      let blade=Object.values(PARTS).find(p=>p.kind==='blade'&&normalizedAliases(p).includes(equivalentKey(bladeName)));
      if(!blade){blade=P('blade',bladeName,{display:bladeName,aliases:[bladeName],source:'generic parser'});reg(blade);}
      let rp=findEquivalent('ratchet',ratchet);if(!rp){reg(P('ratchet',ratchet,{display:ratchet,abbrev:ratchet,source:'generic parser'}));rp=PARTS[partId('ratchet',ratchet)];}
      let bp=findEquivalent('bit',bitAbbr)||Object.values(PARTS).find(p=>p.kind==='bit'&&String(p.abbrev).toUpperCase()===bitAbbr);
      if(!bp){const bitName=BIT_NAMES[bitAbbr]||bitAbbr;reg(P('bit',bitName,{display:bitName,abbrev:bitAbbr,banned:bitAbbr==='MN',source:'generic parser'}));bp=PARTS[partId('bit',bitName)];}
      return [blade.id,rp.id,bp.id];
    }
    const i=raw.match(/^(.*?)\s+([A-Za-z]{1,3})$/i);
    if(i){const ab=i[2].toUpperCase();if(['OP','TR'].includes(ab))return null;let bp=Object.values(PARTS).find(p=>p.kind==='bit'&&String(p.abbrev).toUpperCase()===ab);if(bp){const name=i[1].trim();let blade=Object.values(PARTS).find(p=>p.kind==='integrated'&&normalizedAliases(p).includes(equivalentKey(name)));if(!blade){blade=P('integrated',name,{display:name,aliases:[name],source:'generic integrated parser'});reg(blade);}return [blade.id,bp.id];}}
    return null;
  }

  // Deck Builder: por padrão o catálogo inteiro fica disponível; o botão
  // "Só minha coleção" restringe às peças que você possui fisicamente.
  let builderShowAll = localStorage.getItem('bx_builder_show_all') !== '0';

  function currentUsage(exceptSlot=-1) {
    const counts = {};
    deck.forEach((slot,i) => {
      if (i === exceptSlot) return;
      slotParts(slot).forEach(id => counts[id]=(counts[id]||0)+1);
    });
    return counts;
  }

  function slotParts(slot) {
    const ids=[];
    if (slot.mode==='standard') { if(slot.blade) ids.push(slot.blade); if(slot.ratchet) ids.push(slot.ratchet); }
    if (slot.mode==='integrated') { if(slot.blade) ids.push(slot.blade); }
    if (slot.mode==='cx' || slot.mode==='cxrib') {
      ['lock','main','assist','over'].forEach(k=>{ if(slot[k]) ids.push(slot[k]); });
      if(slot.mode==='cx' && slot.ratchet) ids.push(slot.ratchet);
    }
    if(slot.mode==='cxrib') { if(slot.rib) ids.push(slot.rib); }
    else if(slot.bit) ids.push(slot.bit);
    return ids;
  }

  function isComplete(slot) {
    if (slot.mode==='standard') return !!(slot.blade && slot.ratchet && slot.bit);
    if (slot.mode==='integrated') return !!(slot.blade && slot.bit);
    if (slot.mode==='cx') {
      const main = PARTS[slot.main];
      return !!(slot.lock && slot.main && slot.assist && slot.ratchet && slot.bit && (!main?.requiresOver || slot.over));
    }
    if (slot.mode==='cxrib') {
      const main = PARTS[slot.main];
      return !!(slot.lock && slot.main && slot.assist && slot.rib && (!main?.requiresOver || slot.over));
    }
    return false;
  }

  function slotName(slot) {
    if (!isComplete(slot)) return 'Bey incompleto';
    if (slot.mode==='cxrib') {
      const l=PARTS[slot.lock]?.display, m=PARTS[slot.main]?.display, a=PARTS[slot.assist]?.display, o=slot.over?PARTS[slot.over]?.display:'';
      const blade=o?`${l} ${m} ${o}/${a}`:`${l} ${m} ${a}`;
      return `${blade} ${PARTS[slot.rib]?.abbrev||PARTS[slot.rib]?.display||''}`;
    }
    const bit = PARTS[slot.bit];
    const b = bit?.abbrev || bit?.display || '';
    if (slot.mode==='standard') return `${PARTS[slot.blade]?.display} ${PARTS[slot.ratchet]?.display}${b}`;
    if (slot.mode==='integrated') return `${PARTS[slot.blade]?.display} ${b}`;
    const l=PARTS[slot.lock]?.display, m=PARTS[slot.main]?.display, a=PARTS[slot.assist]?.display, o=slot.over?PARTS[slot.over]?.display:'';
    const blade = o ? `${l} ${m} ${o}/${a}` : `${l} ${m} ${a}`;
    return `${blade} ${PARTS[slot.ratchet]?.display}${b}`;
  }

  function validateDeck() {
    const errors=[]; const info=[];
    const counts={};
    deck.forEach((slot,i)=>{
      if (!isComplete(slot)) { info.push(`Bey ${i+1} ainda está incompleto.`); return; }
      slotParts(slot).forEach(id => counts[id]=(counts[id]||0)+1);
      const banned = slotParts(slot).map(id=>PARTS[id]).filter(p=>p?.banned);
      banned.forEach(p=>errors.push(`Bey ${i+1}: ${p.display} está banida no regulamento WBO padrão.`));
    });
    Object.entries(counts).forEach(([id,n])=>{
      const p=PARTS[id]; if(!p)return; // peça ainda não conhecida (ex.: cor vinda do servidor antes do catálogo carregar)
      if (n > (inventory[id]||0)) {
        // No modo catálogo, não ter a peça é só um aviso — não invalida o deck.
        if (builderShowAll) info.push(`${p.display}: você usa ${n}× mas possui ${(inventory[id]||0)}× (modo catálogo).`);
        else errors.push(`Você está usando ${n}× ${p.display}, mas possui ${(inventory[id]||0)}×.`);
      }
      if (n>1 && !p.basicLock) errors.push(`${p.display} se repete no deck. 3-on-3 não permite repetição dessa peça.`);
    });
    const complete = deck.filter(isComplete).length;
    return { errors:[...new Set(errors)], info, complete, legal:complete===3 && errors.length===0 };
  }

  function availableParts(kind, slotIndex) {
    const used = currentUsage(slotIndex);
    return PARENTS()
      .filter(p => p.kind===kind && (builderShowAll || (inventory[p.id]||0)>0))
      .sort((a,b)=>((inventory[b.id]||0)>0)-((inventory[a.id]||0)>0) || a.display.localeCompare(b.display))
      .map(p=>{
        const owned=inventory[p.id]||0;
        const availableQty=owned-(used[p.id]||0);
        const ruleBlocked=(used[p.id]||0)>0 && !p.basicLock;
        return {p, disabled: builderShowAll ? ruleBlocked : (availableQty<=0 || ruleBlocked), qty:owned};
      });
  }

  function selectHTML(kind, value, slotIndex, dataField, placeholder, extra='') {
    const opts=availableParts(kind,slotIndex);
    if(value && PARTS[value] && !opts.some(x=>x.p.id===value)) opts.unshift({p:PARTS[value],disabled:false,qty:inventory[value]||0,missing:!builderShowAll});
    return `<select data-slot="${slotIndex}" data-field="${dataField}" ${extra}><option value="">${placeholder}</option>${opts.map(({p,disabled,qty,missing})=>`<option value="${p.id}" ${p.id===value?'selected':''} ${disabled && p.id!==value?'disabled':''}>${escapeHTML(p.display)}${p.abbrev && p.abbrev!==p.display?' ['+p.abbrev+']':''}${qty>0?` ${BX.ic('check', 14)}×${qty}`:builderShowAll?'':' ×0'}${missing?' — NÃO POSSUI':''}${p.banned?' — BANIDA':''}</option>`).join('')}</select>`;
  }


  function getBitAbbrev(part) {
    if (!part) return '';
    if (part.abbrev) return part.abbrev.toUpperCase();
    const hit=Object.entries(BIT_NAMES).find(([,name])=>slug(name)===slug(part.name) || slug(name)===slug(part.display));
    return hit?.[0] || '';
  }

  function getBitProfile(part) {
    const abbr=getBitAbbrev(part);
    if(part?.stats){
      const s=part.stats, type=part.type||inferType(s), atk=clamp((+s.atk||0)/6), def=clamp((+s.def||0)/6), sta=clamp((+s.sta||0)/6);
      const dash=+s.dash||0, aggr=clamp(atk*.55+dash/8), control=clamp(8.5-aggr*.35+def*.2);
      const traits=[];
      if(dash>=35)traits.push('entra na X-Line com facilidade e produz Xtreme Dashes fortes'); else if(dash<=10)traits.push('tende a ficar mais calma e economizar energia');
      if(sta>=7.5)traits.push('tem ótima retenção de giro'); if(def>=7.5)traits.push('prioriza estabilidade e resistência a impacto');
      if(atk>=8)traits.push('cobra bastante stamina em troca de pressão ofensiva');
      if(['LF','LR','UF'].includes(abbr))traits.push('a altura baixa favorece contatos por baixo e upper attacks');
      if(['FB','FF'].includes(abbr))traits.push('o mecanismo livre reduz perdas por atrito em situações específicas');
      if(['TR','OP'].includes(abbr))traits.push('Ratchet e Bit são uma única peça e o gimmick muda seu comportamento durante a batalha');
      const note=`${part.display} é uma peça ${type.toLowerCase()}${traits.length?': '+traits.join('; '):'. Seu perfil é derivado dos stats atuais do catálogo.'}.`;
      return {type,atk,def,sta,aggr,control,note};
    }
    return BIT_PROFILE[abbr] || {type:part?.type||'Balance',atk:5,def:5,sta:5,aggr:5,control:5,note:'Perfil provisório neutro. Sincronize o catálogo online para buscar stats e comportamento desta peça.'};
  }

  function clamp(v,min=0,max=10){ return Math.max(min,Math.min(max,v)); }

  function ratchetInfo(part) {
    if (!part) return {atk:0,def:0,sta:0,text:'Sem Ratchet selecionada.'};
    const m=part.display.match(/([0-9M]+)-(\d{2})/i); let atk=0,def=0,sta=0; const notes=[];
    if(part.stats){atk+=(part.stats.atk-10)/22;def+=(part.stats.def-10)/22;sta+=(part.stats.sta-10)/22;}
    if(!m)return {atk,def,sta,text:`${part.display}: Ratchet especial; a análise usa seus dados geométricos/estatísticos quando disponíveis.`};
    const protrusions=m[1].toUpperCase(),height=+m[2];
    notes.push(`${(height/10).toFixed(1).replace('.',',')} mm de altura`);
    if(/^\d+$/.test(protrusions))notes.push(`${protrusions} ${protrusions==='1'?'saliência principal':'saliências principais'}`);
    if(height<=55){atk+=.55;def+=.15;sta-=.2;notes.push('muito baixa: favorece contato por baixo e reduz a área exposta');}
    else if(height<=60){atk+=.3;def+=.15;notes.push('baixa e versátil, boa para contatos por baixo');}
    else if(height<=70){atk+=.05;def+=.05;sta+=.1;notes.push('altura intermediária');}
    else {atk-=.15;def-=.1;sta+=.25;notes.push('alta: muda o ângulo de contato e fica mais exposta a golpes por baixo');}
    if(protrusions==='0')notes.push('perímetro mais circular, embora ainda possa haver pontos de exposição');
    if(protrusions==='1')notes.push('a saliência grande pode atuar como contato secundário em algumas montagens');
    return {atk,def,sta,text:`${part.display}: ${notes.join('; ')}.`};
  }

  function bladeProfile(slot) {
    const id=(slot.mode==='cx' || slot.mode==='cxrib') ? slot.main : slot.blade;
    const p0=BLADE_PROFILE[id]; if(p0)return {...p0};
    const part=PARTS[id];
    if(part?.stats){
      const atk=clamp((+part.stats.atk||0)/10),def=clamp((+part.stats.def||0)/10),sta=clamp((+part.stats.sta||0)/10),type=part.type||inferType(part.stats);
      const traits=[];if(atk>=7)traits.push('contatos fortes e alto potencial de KO');if(sta>=6)traits.push('boa distribuição para conservar rotação');if(def>=6)traits.push('perfil capaz de desviar/absorver impactos');if(/left/i.test(part.spin||''))traits.push('giro esquerdo, abrindo matchups de giro oposto');if(part.geometry)traits.push(`geometria catalogada: ${part.geometry}`);
      return {atk,def,sta,role:type.toLowerCase(),trait:traits.join('; ')||`perfil ${type.toLowerCase()} derivado dos stats do catálogo`};
    }
    const t=part?.type||'Balance',base=t==='Attack'?{atk:7,def:3.5,sta:3.5}:t==='Defense'?{atk:3,def:7,sta:4.5}:t==='Stamina'?{atk:2.5,def:4.5,sta:7}:{atk:5,def:5,sta:5};
    return {...base,role:t.toLowerCase(),trait:'perfil estimado pelo tipo; sincronize o catálogo para uma leitura baseada em stats'};
  }
  function componentMod(part){
    if(!part)return null;const fixed=ASSIST_MOD[part.id];if(fixed)return fixed;if(!part.stats)return null;return {atk:clamp((part.stats.atk-15)/25,-.7,1.4),def:clamp((part.stats.def-15)/25,-.7,1.4),sta:clamp((part.stats.sta-15)/25,-.7,1.4),note:`${part.display} aplica modificadores derivados dos seus stats de componente CX.`};
  }

  function analyzeBey(slot) {
    if(!isComplete(slot)) return null;
    const blade=bladeProfile(slot);
    const bitPart=slot.mode==='cxrib' ? PARTS[slot.rib] : PARTS[slot.bit];
    const bit=getBitProfile(bitPart);
    const ratchet=slot.mode==='integrated' ? {atk:0,def:0,sta:0,text:'A Ratchet faz parte da própria Blade integrada.'} : slot.mode==='cxrib' ? {atk:0,def:0,sta:0,text:`${bitPart?.display||'Esta peça'} integra Ratchet e Bit; altura e comportamento são avaliados em conjunto.`} : ratchetInfo(PARTS[slot.ratchet]);
    let atk=blade.atk*.62 + bit.atk*.38 + ratchet.atk;
    let def=blade.def*.62 + bit.def*.38 + ratchet.def;
    let sta=blade.sta*.62 + bit.sta*.38 + ratchet.sta;
    let assistNote='';
    if((slot.mode==='cx' || slot.mode==='cxrib') && slot.assist) {
      const mod=componentMod(PARTS[slot.assist]); if(mod){atk+=mod.atk;def+=mod.def;sta+=mod.sta;assistNote=mod.note;}
    }
    if((slot.mode==='cx' || slot.mode==='cxrib') && slot.over) { atk+=.35; def+=.15; assistNote += `${assistNote?' ':''}A Over Blade acrescenta massa/contato ao conjunto Expand.`; }
    atk=clamp(atk); def=clamp(def); sta=clamp(sta);
    const scores=[['Attack',atk],['Defense',def],['Stamina',sta]].sort((a,b)=>b[1]-a[1]);
    let type=scores[0][0];
    if(scores[0][1]-scores[1][1]<.65 && scores[0][1]<8.2) type='Balance';
    const lowRatchet=slot.ratchet && /-(50|55|60)$/.test(PARTS[slot.ratchet]?.display||'');
    const upper=(blade.trait||'').toLowerCase().includes('upper') || ((blade.atk>=7.5) && lowRatchet);
    const use = type==='Attack'
      ? `${upper?'ataque focado em contatos baixos/upper attacks':'ataque focado em pressão e KOs'}${bit.aggr>=8?', com movimentação bem agressiva':''}`
      : type==='Stamina' ? 'stamina focada em sobreviver e vencer por rotação'
      : type==='Defense' ? 'defesa focada em estabilidade e absorção de impacto'
      : 'balance, tentando combinar pressão ofensiva com segurança';
    const sentence=`${slotName(slot)} é um Bey de ${use}. A Blade tem ${blade.trait}; ${bitPart?.abbrev||bitPart?.display} puxa o conjunto para ${bit.type.toLowerCase()}.`;
    return {type,atk,def,sta,aggr:bit.aggr,control:bit.control,sentence,bitNote:bit.note,ratchetNote:ratchet.text,assistNote,upper};
  }

  function scoreBar(label,value) {
    const pct=Math.round(clamp(value)*10);
    return `<div class="score-row"><span>${label}</span><div><i style="width:${pct}%"></i></div><b>${value.toFixed(1)}</b></div>`;
  }

  function renderBeyAnalysis(slot) {
    const a=analyzeBey(slot);
    if(!a) return `<div class="bey-analysis empty"><span>Analisador</span><p>Complete o Bey para receber uma avaliação de função e sinergia.</p></div>`;
    return `<div class="bey-analysis"><div class="analysis-mini-head"><span>Analisador</span><b>${a.type}</b></div><p>${escapeHTML(a.sentence)}</p><div class="score-list">${scoreBar('ATK',a.atk)}${scoreBar('DEF',a.def)}${scoreBar('STA',a.sta)}</div><details><summary>Por quê?</summary><p><strong>Bit:</strong> ${escapeHTML(a.bitNote)}</p><p><strong>Ratchet:</strong> ${escapeHTML(a.ratchetNote)}</p>${a.assistNote?`<p><strong>CX:</strong> ${escapeHTML(a.assistNote)}</p>`:''}</details></div>`;
  }

  function visualPiece(part,label,classes='') {
    return `<div class="visual-piece ${classes}">${partArt(part,'mini')}<span>${escapeHTML(label)}</span></div>`;
  }

  function renderBeyVisual(slot) {
    const isCX=slot.mode==='cx' || slot.mode==='cxrib';
    const bladePart=isCX ? PARTS[slot.main] : PARTS[slot.blade];
    const items=[];
    if(isCX) {
      items.push(visualPiece(PARTS[slot.lock],'Chip','chip-pos'));
      items.push(visualPiece(PARTS[slot.assist],'Assist','assist-pos'));
      if(PARTS[slot.main]?.requiresOver || slot.over) items.push(visualPiece(PARTS[slot.over],'Over','over-pos'));
    }
    if(slot.mode==='cxrib') items.push(visualPiece(PARTS[slot.rib],'Ratchet + Bit','rib-pos'));
    else {
      if(slot.mode!=='integrated') items.push(visualPiece(PARTS[slot.ratchet],'Ratchet','ratchet-pos'));
      items.push(visualPiece(PARTS[slot.bit],'Bit','bit-pos'));
    }
    return `<div class="bey-visual"><div class="rings"></div><div class="main-piece">${partArt(bladePart,'big')}<span>${isCX?'Main Blade':slot.mode==='integrated'?'Integrated Blade':'Blade'}</span></div>${items.join('')}</div>`;
  }

  function analyzeDeck() {
    const analyses=deck.map(analyzeBey).filter(Boolean);
    if(!analyses.length) return {title:'Comece a montar',tone:'neutral',text:'O analisador compara o papel dos três Beys, identifica excesso de uma função e aponta riscos de estratégia.'};
    const counts={Attack:0,Defense:0,Stamina:0,Balance:0}; analyses.forEach(a=>counts[a.type]++);
    const avg=k=>analyses.reduce((n,a)=>n+a[k],0)/analyses.length;
    const atk=avg('atk'), def=avg('def'), sta=avg('sta'), aggr=avg('aggr');
    let title='Deck equilibrado', tone='good', text='Há uma boa distribuição de funções e caminhos de vitória.';
    if(counts.Attack>=2 || (atk>7 && aggr>7)) { title=counts.Attack===3?'Deck extremamente ofensivo':'Deck muito ofensivo'; tone='warn'; text='Você concentra grande parte do deck em KOs/Xtreme Finishes. Isso aumenta pressão, mas também redundância, gasto de stamina e risco de auto-KO.'; }
    else if(counts.Stamina>=2 || (sta>7 && atk<5)) { title='Deck puxado para stamina'; tone='warn'; text='Você tem boa capacidade de vencer por spin finish, mas pode sofrer contra oponentes que forçam KOs cedo ou quebram sua estabilidade.'; }
    else if(counts.Defense>=2 || (def>7 && atk<5)) { title='Deck puxado para defesa'; tone='warn'; text='O deck é resistente e controlado, porém pode faltar pressão para virar confrontos em que apenas sobreviver não basta.'; }
    else if(analyses.length<3) { title='Análise parcial'; tone='neutral'; text=`Há ${analyses.length}/3 Beys completos. Complete o deck para avaliar cobertura e redundância.`; }
    const special=[];
    if(analyses.length===3 && new Set(analyses.map(a=>a.type)).size===1) special.push(`Os três Beys foram classificados como ${analyses[0].type}: pouca diversidade de plano de jogo.`);
    if(aggr>7.5) special.push('A agressividade média é alta: lançamentos inconsistentes podem transformar força ofensiva em auto-KOs.');
    if(sta<4 && analyses.length===3) special.push('A stamina média é baixa; partidas longas tendem a ser desfavoráveis.');
    if(atk<4.5 && analyses.length===3) special.push('O potencial médio de KO é baixo; o deck depende mais de sobreviver do que de finalizar rápido.');
    return {title,tone,text,atk,def,sta,counts,special};
  }

  function renderDeckAnalysis() {
    const el=document.getElementById('deckAnalysis'); if(!el) return;
    const a=analyzeDeck();
    const complete=deck.filter(isComplete).length;
    el.className=`analysis-card ${a.tone||'neutral'}`;
    el.innerHTML=`<div class="deck-analysis-head"><div><p class="eyebrow">ANALISADOR DO DECK</p><h2>${escapeHTML(a.title)}</h2></div><span>${complete}/3 completos</span></div><p class="deck-analysis-text">${escapeHTML(a.text)}</p>${a.atk!==undefined?`<div class="deck-score-grid">${scoreBar('Ataque',a.atk)}${scoreBar('Defesa',a.def)}${scoreBar('Stamina',a.sta)}</div>`:''}${a.special?.length?`<div class="analysis-warnings">${a.special.map(x=>`<p>• ${escapeHTML(x)}</p>`).join('')}</div>`:''}<small class="heuristic-note">Avaliação heurística: serve como guia de construção; peso, molde, desgaste, estádio e técnica de lançamento podem alterar bastante o resultado real.</small>`;
  }

  function renderBuilder() {
    const grid=document.getElementById('deckGrid');
    grid.innerHTML=deck.map((slot,i)=>renderSlot(slot,i)).join('');
    grid.querySelectorAll('select[data-slot]').forEach(el=>el.addEventListener('change',onSlotChange));
    grid.querySelectorAll('.clear-slot').forEach(el=>el.addEventListener('click',e=>{
      e.preventDefault(); e.stopPropagation();
      const i=Number(e.currentTarget.dataset.slot);
      deck[i]=emptySlot(); saveState(); renderAll(); toast(`Bey ${i+1} limpo.`);
    }));
    grid.querySelectorAll('.move-slot').forEach(el=>el.addEventListener('click',()=>{
      const from=+el.dataset.slot, to=from+(+el.dataset.dir); if(to<0||to>2)return;
      [deck[from],deck[to]]=[deck[to],deck[from]]; saveState(); renderAll(); toast('Ordem dos Beys alterada.');
    }));
    grid.querySelectorAll('.dup-slot').forEach(el=>el.addEventListener('click',()=>duplicateStructure(+el.dataset.slot)));
    // Slots: clique abre o seletor (celular) ou mira o painel lateral (desktop); × remove; segurar abre ações
    grid.querySelectorAll('.slot').forEach(sl=>{
      const bey=+sl.dataset.bey, field=sl.dataset.field, kind=sl.dataset.kind;
      sl.addEventListener('click',e=>{
        if(e.target.closest('.slot-x')){ e.stopPropagation(); const n=PARTS[deck[bey][field]]?.display; clearField(bey,field); toast(`${n} removido do Bey ${bey+1}.`); return; }
        if(sl.dataset.held){delete sl.dataset.held;return;}
        setActiveSlot(bey);
        if(isMobileBuilder()){ openSheet(bey,field,kind); return; }
        // desktop: painel lateral filtrado no tipo, esperando a peça
        if(panelTarget&&panelTarget.bey===bey&&panelTarget.field===field){ openSheet(bey,field,kind); return; } // segundo clique abre o seletor
        panelTarget={bey,field,kind};
        grid.querySelectorAll('.slot.targeted').forEach(x=>x.classList.remove('targeted')); sl.classList.add('targeted');
        renderPicker.setKind(kind);
        const s=document.getElementById('pickerSearch'); if(s){ s.value=''; renderPicker(); s.focus({preventScroll:true}); }
        document.querySelector('.side-panel .picker')?.scrollIntoView({block:'nearest',behavior:'smooth'});
        const hint=document.getElementById('pickerHint'); if(hint)hint.innerHTML=`Escolha um(a) <b>${escapeHTML(SLOT_LABEL[kind])}</b> para o <b>Bey ${bey+1}</b> — ou arraste até o slot. <a href="#" data-cancel-target>cancelar</a>`;
      });
      // segurar (toque) abre ações do slot preenchido
      let t=null;
      sl.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse'||!sl.classList.contains('filled'))return; t=setTimeout(()=>{sl.dataset.held='1';openSlotActions(bey,field,sl);},520); },{passive:true});
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>sl.addEventListener(ev,()=>clearTimeout(t)));
      sl.addEventListener('touchmove',()=>clearTimeout(t),{passive:true});
      sl.addEventListener('contextmenu',e=>{ if(sl.classList.contains('filled')&&!isMobileBuilder()){e.preventDefault();openSlotActions(bey,field,sl);} });
    });
    grid.querySelectorAll('.bey-card').forEach(card=>card.addEventListener('mousedown',e=>{
      if(e.target.closest('button,select,a,.slot'))return;
      setActiveSlot(+card.dataset.deckSlot); syncPager();
    }));
    bindSlotDnD(grid);
    bindPreview(grid,'.slot.filled',el=>PARTS[deck[+el.dataset.bey]?.[el.dataset.field]]);
    hydrateImages(grid);
    setActiveSlot(activeSlot);
    if(isMobileBuilder()){ const card=grid.children[activeSlot]; if(card)grid.scrollLeft=card.offsetLeft-grid.offsetLeft; }
    if(lastPlaced){ const el=grid.querySelector(`.slot[data-bey="${lastPlaced.bey}"][data-field="${lastPlaced.field}"]`); if(el){el.classList.add('pop');setTimeout(()=>el.classList.remove('pop'),700);} lastPlaced=null; }

    const v=validateDeck();
    const legalEl=document.getElementById('deckLegality');
    legalEl.className='legality '+(v.legal?'good':v.errors.length?'bad':'neutral');
    legalEl.innerHTML=v.legal?`${BX.ic('check',13)} Deck legal`:v.errors.length?`${BX.ic('x',13)} Deck ilegal`:`${v.complete}/3 Beys prontos`;
    document.getElementById('validationList').innerHTML=[
      ...v.errors.map(x=>`<div class="validation-item err"><i>×</i><span>${escapeHTML(x)}</span></div>`),
      ...v.info.map(x=>`<div class="validation-item"><i>•</i><span>${escapeHTML(x)}</span></div>`),
      ...(v.legal?[`<div class="validation-item"><i>${BX.ic('check', 14)}</i><span>Três Beys completos e sem repetições proibidas.</span></div>`]:[])
    ].join('') || `<div class="validation-item"><i>${BX.ic('check', 14)}</i><span>Nenhum problema detectado.</span></div>`;
    ['publishDeckBtn','shareDeckBtn'].forEach(id=>document.getElementById(id)?.classList.toggle('glow',v.legal));
    renderDeckBar(v); syncPager(); syncUndoButtons(); renderDraftNotice();
    renderDeckAnalysis();
  }

  function renderStage(slot,i){
    const defs=slotDefs(slot);
    const used=currentUsage(i);
    const html=defs.map(d=>{
      const id=slot[d.field]; const p=id?PARTS[id]:null;
      const probs=[];
      if(p){ if(p.banned)probs.push('banida'); if((used[id]||0)>0&&!p.basicLock)probs.push(`repetida (Bey ${deck.findIndex((s,j)=>j!==i&&slotParts(s).includes(id))+1})`); if(!builderShowAll&&(used[id]||0)+1>(inventory[id]||0))probs.push('sem cópia'); }
      const targeted=panelTarget&&panelTarget.bey===i&&panelTarget.field===d.field;
      return `<div class="slot sl-${d.field} ${p?'filled':'empty'} ${probs.length?'bad':''} ${targeted?'targeted':''}" role="button" tabindex="0" data-bey="${i}" data-field="${d.field}" data-kind="${d.kind}" aria-label="${escapeAttr(d.label)}: ${escapeAttr(p?p.display:'vazio')}" title="${escapeAttr(p?`${p.display} — ${d.label}${probs.length?' · '+probs.join(', '):''}`:`Escolher ${d.label}`)}">
        <span class="slot-ring">${p?partArt(p,'slot'):`<span class="slot-plus">${BX.ic('plus',18)}</span>`}</span>
        <span class="slot-lab">${escapeHTML(d.label)}</span>
        <span class="slot-name">${p?escapeHTML(p.abbrev&&p.kind==='bit'?p.display:p.display):(targeted?'aguardando…':'escolher')}</span>
        ${p?`<button type="button" class="slot-x" tabindex="-1" title="Remover ${escapeAttr(p.display)}" aria-label="Remover">${BX.ic('x',11)}</button>`:''}
        <span class="slot-tip" aria-hidden="true"></span>
      </div>`;
    }).join('');
    return `<div class="stage" data-mode="${slot.mode}" data-over="${defs.some(d=>d.field==='over')?'1':'0'}"><div class="stage-glow"></div>${html}</div>`;
  }

  function renderSlot(slot,i) {
    const invalid = validateSlot(slot,i);
    const isCX=slot.mode==='cx' || slot.mode==='cxrib';
    const tipPart=slot.mode==='cxrib' ? PARTS[slot.rib] : PARTS[slot.bit];
    const bitProfile=tipPart ? getBitProfile(tipPart) : null;
    const filled=slotParts(slot).length, total=slotDefs(slot).filter(d=>d.field!=='over'||PARTS[slot.main]?.requiresOver).length;
    return `<article class="bey-card v2 ${invalid.length?'invalid':''} ${isComplete(slot)&&!invalid.length?'complete':''}" data-deck-slot="${i}">
      <div class="bey-head">
        <div class="slot-number"><b><i>${i+1}</i></b> Bey ${i+1} <small class="bey-progress">${filled}/${total}</small></div>
        <div class="bey-head-actions">
          <button type="button" class="move-slot" data-slot="${i}" data-dir="-1" ${i===0?'disabled':''} title="Mover para a esquerda">${BX.ic('back',13)}</button>
          <button type="button" class="move-slot" data-slot="${i}" data-dir="1" ${i===2?'disabled':''} title="Mover para a direita">${BX.ic('back',13)}</button>
          <button type="button" class="dup-slot" data-slot="${i}" title="Copiar só a estrutura (${escapeAttr(MODE_LABEL[slot.mode]||'')}) para um Bey vazio">${BX.ic('grid',13)}</button>
          <button type="button" class="clear-slot" data-slot="${i}" title="Limpar este Bey">${BX.ic('trash',14)}</button>
        </div>
      </div>
      <div class="bey-structure"><label>Estrutura</label><select data-slot="${i}" data-field="mode" aria-label="Estrutura do Bey ${i+1}">
        ${Object.entries(MODE_LABEL).map(([k,l])=>`<option value="${k}" ${slot.mode===k?'selected':''}>${l}</option>`).join('')}
      </select>${isCX&&PARTS[slot.main]?.requiresOver?'<span class="bey-badge">Expand</span>':''}</div>
      ${renderStage(slot,i)}
      <div class="bey-summary"><strong>${escapeHTML(slotName(slot))}</strong><small>${isComplete(slot)?(invalid.length?`${BX.ic('warn', 14)} ${escapeHTML(invalid[0])}`:`${BX.ic('check', 14)} Montagem válida`):`Toque num slot para escolher a peça (${filled}/${total})`}</small></div>
      ${bitProfile?`<div class="bit-inline-note"><b>${escapeHTML(tipPart?.abbrev||tipPart?.display)}</b><span>${escapeHTML(bitProfile.note)}</span></div>`:''}
      ${renderBeyAnalysis(slot)}
    </article>`;
  }

  function validateSlot(slot,i) {
    const errs=[];
    if (!isComplete(slot)) return errs;
    const parts=slotParts(slot);
    if (parts.some(id=>PARTS[id]?.banned)) errs.push('contém peça banida');
    const used=currentUsage(i);
    parts.forEach(id=>{ const p=PARTS[id]; if(!p)return; if((used[id]||0)>0 && !p.basicLock) errs.push(`${p.display} já está em outro Bey`); if((used[id]||0)+1>(inventory[id]||0)) errs.push(`sem cópia física de ${p.display}`); });
    return [...new Set(errs)];
  }

  function onSlotChange(e) {
    const i=+e.target.dataset.slot, field=e.target.dataset.field, value=e.target.value;
    if (field==='mode') {
      deck[i]=emptySlot(); deck[i].mode=value;
    } else {
      deck[i][field]=value;
      if (field==='main' && !PARTS[value]?.requiresOver) deck[i].over='';
    }
    saveState(); renderAll();
  }

  /** Itens da coleção: cada cor é um item separado; unidades sem cor da peça-pai são outro item. */
  function collectionItems(){
    const items=[];
    for(const p of PARENTS()){
      const kids=childrenOf(p);
      const kidsQty=kids.reduce((n,k)=>n+(inventory[k.id]||0),0);
      const generic=(inventory[p.id]||0)-kidsQty;
      if(generic>0)items.push({part:p,qty:generic,hasColors:kids.length>0});
      for(const k of kids){const q=inventory[k.id]||0;if(q>0)items.push({part:k,qty:q,hasColors:true});}
    }
    return items;
  }
  function progressBar(owned,total,cls=''){
    const pct=total?Math.round(owned/total*100):0;
    return `<div class="cprog ${cls}"><div class="cprog-bar"><i style="width:${pct}%"></i></div><small><b>${owned}</b>/${total} • ${pct}%</small></div>`;
  }
  function renderCollection() {
    if(cloudReady&&!cloudUser){
      document.getElementById('collectionCount').innerHTML='<strong>—</strong><small>entre para ver sua coleção</small>';
      document.getElementById('collectionPieces').innerHTML='<div class="empty-state collection-empty"><p>Sua coleção fica na sua conta.</p><a class="btn primary" href="/entrar?next=%2F%23collection" style="text-decoration:none">Entrar para gerenciar</a><small>Coleção, cores e decks físicos são salvos na nuvem e aparecem no seu perfil automaticamente.</small></div>';
      return;
    }
    if(!cloudReady){ document.getElementById('collectionPieces').innerHTML='<div class="empty-state">Carregando sua coleção…</div>'; return; }
    const items=collectionItems();
    const total=items.reduce((a,i)=>a+i.qty,0);
    const order=['blade','integrated','lock','over','main','assist','ratchet','bit','rib'];
    const catalog=PARENTS().filter(p=>order.includes(p.kind)&&!p.hidden);
    const ownedSet=new Set(items.map(i=>i.part.parentId||i.part.id));
    const ownedDistinct=catalog.filter(p=>ownedSet.has(p.id)).length;
    document.getElementById('collectionCount').innerHTML=`<strong>${ownedDistinct}</strong><small>de ${catalog.length} peças do catálogo • ${total} unidade(s)</small>`;
    const root=document.getElementById('collectionPieces');
    const kindStats=order.map(kind=>{const all=catalog.filter(p=>p.kind===kind);return {kind,total:all.length,owned:all.filter(p=>ownedSet.has(p.id)).length};}).filter(k=>k.total);
    const overall=`<section class="panel-card col-overview"><div class="col-overview-head"><div><p class="eyebrow">PROGRESSO DA COLEÇÃO</p><h2>Beyblade X completo: ${catalog.length?Math.round(ownedDistinct/catalog.length*100):0}%</h2></div><small>${ownedDistinct} de ${catalog.length} peças diferentes • ${total} unidade(s) no total</small></div>${progressBar(ownedDistinct,catalog.length,'big')}<div class="col-kind-bars">${kindStats.map(k=>`<a class="col-kind-bar" href="#col-${k.kind}" title="${KIND_LABEL[k.kind]}"><span>${KIND_LABEL[k.kind]}</span>${progressBar(k.owned,k.total)}</a>`).join('')}</div></section>`;
    const sections=order.map(kind=>{
      const list=items.filter(i=>i.part.kind===kind).sort((a,b)=>a.part.display.localeCompare(b.part.display)||(a.part.parentId?1:0)-(b.part.parentId?1:0)||(a.part.colorOrder||0)-(b.part.colorOrder||0));
      const st=kindStats.find(k=>k.kind===kind); if(!st)return'';
      if(!list.length)return `<section id="col-${kind}" class="col-kind empty"><div class="part-group-title"><h2>${KIND_LABEL[kind]}</h2>${progressBar(st.owned,st.total)}</div><div class="col-kind-empty">Nenhuma ${KIND_LABEL[kind].toLowerCase()} na coleção ainda.</div></section>`;
      return `<section id="col-${kind}" class="col-kind"><div class="part-group-title"><h2>${KIND_LABEL[kind]}</h2>${progressBar(st.owned,st.total)}</div><div class="parts-grid">${list.map(itemCard).join('')}</div></section>`;
    }).join('');
    root.innerHTML=items.length?overall+sections:'<div class="empty-state collection-empty"><p>Sua coleção começa vazia.</p><button class="btn primary" id="addBeysEmptyBtn">＋ Adicionar Beys</button><small>Escolha peças no catálogo, busque o produto que você comprou ou cole uma lista.</small></div>';
    root.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>editItem(btn.dataset.edit)));
    root.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const p=PARTS[btn.dataset.remove]; const qty=Math.max(0,+btn.dataset.qty||0); if(!p)return;
      const color=p.parentId&&p.colorLabel?` · ${p.colorLabel}`:'';
      const ok=await (window.BX?.confirmDialog?window.BX.confirmDialog({title:'Remover da coleção?',text:`${p.display}${color} — ${qty} unidade${qty===1?'':'s'} sai${qty===1?'':'rão'} da sua coleção.`,okLabel:'Remover',danger:true,rememberKey:'bx_skip_remove_confirm'}):Promise.resolve(confirm(`Remover ${p.display} da coleção?`)));
      if(!ok)return;
      adjustMany([[p.id,-qty]]); toast(`${p.display} removida da coleção.`);
    }));
    const bk=document.getElementById('colBackups');
    if(bk){const list=collectionBackups();bk.innerHTML=list.length?list.map((b,i)=>`<button class="backup-row" data-restore="${i}" title="Restaurar este backup"><span>${new Date(b.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span><small>${b.count} item(ns) • ${escapeHTML(b.reason||'')}</small><b>${BX.ic('refresh', 14)}</b></button>`).join(''):'<small class="muted">Nenhum backup ainda — eles são criados automaticamente quando a coleção muda.</small>';
      bk.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Restaurar este backup? A coleção atual será guardada como backup antes.'))restoreCollectionBackup(+b.dataset.restore);}));}
    document.getElementById('addBeysEmptyBtn')?.addEventListener('click',()=>document.getElementById('addBeysBtn')?.click());
    hydrateImages(root);
  }
  /** Ajusta várias quantidades manuais de uma vez (um único re-render). */
  function adjustMany(changes){
    for(const [id,delta] of changes){
      if(!delta)continue;
      if(!manualParts[id])manualParts[id]={part:PARTS[id],qty:0};
      manualParts[id].qty=(manualParts[id].qty||0)+delta;
      if(manualParts[id].qty===0)delete manualParts[id];
    }
    persistCollection();
    rebuildInventory();
  }
  /** Popup de edição do item (cor + quantidade + remover). */
  async function editItem(id){
    const p=PARTS[id]; if(!p||!window.BX?.itemDialog)return;
    const parent=p.parentId?PARTS[p.parentId]:p; if(!parent)return;
    const kids=childrenOf(parent);
    const kidsQty=kids.reduce((n,k)=>n+(inventory[k.id]||0),0);
    const curQty=p.parentId?(inventory[p.id]||0):Math.max(0,(inventory[p.id]||0)-kidsQty);
    const r=await window.BX.itemDialog({
      name:parent.display, currentId:p.parentId?p.id:parent.id, qty:curQty, defaultId:parent.id,
      options:kids.map(k=>({id:k.id,img:k.image,label:k.colorLabel||'Cor',qty:k.id!==p.id?(inventory[k.id]||0):0})),
      allowDefault:kids.length>0,
    });
    if(!r)return;
    if(r.remove){adjustMany([[p.id,-curQty]]);toast(`${parent.display} removida da coleção.`);return;}
    const target=PARTS[r.id]||parent;
    if(target.id===p.id)adjustMany([[p.id,r.qty-curQty]]);
    else adjustMany([[p.id,-curQty],[target.id,r.qty]]);
    toast(`${parent.display}${target.colorLabel?` (${target.colorLabel})`:''} ×${r.qty} salvo.`);
  }

  function partHeuristic(p){
    if(!p)return null;
    if(['bit','rib'].includes(p.kind)){const x=getBitProfile(p);return{type:x.type,note:x.note};}
    if(p.kind==='ratchet'){const x=ratchetInfo(p);return{type:'',note:x.text};}
    if(['blade','integrated'].includes(p.kind)){
      const prof=BLADE_PROFILE[p.id];
      const type=p.type||inferType(p.stats)||(prof?(prof.atk>prof.def&&prof.atk>prof.sta?'Attack':prof.def>prof.atk&&prof.def>prof.sta?'Defense':prof.sta>prof.atk&&prof.sta>prof.def?'Stamina':'Balance'):'');
      return type?{type,note:''}:null;
    }
    if(['main','assist','over'].includes(p.kind)){
      const type=p.type||inferType(p.stats);if(!type&&!p.behavior&&!p.note)return null;
      return{type,note:p.behavior||p.note||''};
    }
    if(p.kind==='lock')return{type:'CX',note:p.basicLock?'Lock Chip básico CX; define identidade/encaixe e pode ter a exceção de repetição prevista no formato WBO usado pelo site.':'Lock Chip especial; consulte as regras do evento para repetição.'};
    return null;
  }
  function itemCard(item){
    const p=item.part; const h=partHeuristic(p);const cls=h?.type==='Attack'?'attack':h?.type==='Stamina'?'stamina':h?.type==='Defense'?'defense':'balance';
    const colorChip=p.parentId?`<span class="color-chip">${escapeHTML(p.colorLabel||'Cor')}</span>`:(item.hasColors?'<span class="color-chip none">sem cor definida</span>':'');
    return `<article class="part-card item ${p.banned?'banned':''}" title="${escapeAttr(partTooltip(p))}">
      <button class="item-remove" data-remove="${escapeAttr(p.id)}" data-qty="${item.qty}" title="Remover da coleção" aria-label="Remover ${escapeAttr(p.display)} da coleção">×</button>
      <div class="item-photo">${partArt(p)}<button class="item-edit" data-edit="${escapeAttr(p.id)}" title="Editar cor e quantidade" aria-label="Editar">${window.BX?.icon?window.BX.icon('edit',13):`${BX.ic('edit', 14)}`}</button></div>
      <div class="part-meta"><small>${KIND_LABEL[p.kind] || p.kind}</small><strong><a class="plink" href="/peca/${slug(p.display||p.name)}" title="Ver página da peça">${escapeHTML(p.display)}</a>${p.abbrev?` <span style="color:#707887">${escapeHTML(p.abbrev)}</span>`:''}</strong>
        <div class="item-tags">${colorChip}${p.banned?'<span class="badge banned">Banida</span>':''}${h?.type?`<span class="badge ${cls}">${escapeHTML(h.type)}</span>`:''}</div>
      </div>
      <span class="item-qty" title="Quantidade">×${item.qty}</span>
    </article>`;
  }
  function partCard(p){ return itemCard({part:p,qty:inventory[p.id]||0,hasColors:childrenOf(p).length>0}); }

  function changeManualQty(id,delta) {
    if (!manualParts[id]) manualParts[id]={part:PARTS[id],qty:0};
    manualParts[id].qty=(manualParts[id].qty||0)+delta;
    if(manualParts[id].qty===0) delete manualParts[id];
    persistCollection();
    rebuildInventory();
  }


  function openSlotPicker(title, subtitle, action) {
    slotPickerAction=action;
    const modal=document.getElementById('slotPickerModal');
    document.getElementById('slotPickerTitle').textContent=title;
    document.getElementById('slotPickerSubtitle').textContent=subtitle||'';
    document.getElementById('slotPickerChoices').innerHTML=deck.map((slot,i)=>`<button class="slot-choice" data-slot="${i}"><b>Slot ${i+1}</b><span>${escapeHTML(slotName(slot))}</span></button>`).join('');
    document.getElementById('slotPickerChoices').querySelectorAll('.slot-choice').forEach(btn=>btn.addEventListener('click',()=>{
      const fn=slotPickerAction; closeSlotPicker(); if(fn) fn(+btn.dataset.slot);
    }));
    modal.hidden=false;
  }
  function closeSlotPicker(){ const modal=document.getElementById('slotPickerModal'); if(modal)modal.hidden=true; slotPickerAction=null; }
  function goBuilder(){ location.hash='builder'; }
  function copyBeyToBuilder(sourceSlot, label='Bey') {
    if(!sourceSlot)return;
    openSlotPicker(`Copiar ${label}`, 'Escolha qual slot do deck em andamento será substituído.', target=>{
      deck[target]=clone(sourceSlot); saveState(); renderAll(); goBuilder(); toast(`${label} copiado para o slot ${target+1}.`);
    });
  }

  const CX_WEEKLY_MAIN = new Set(['blast','blitz','rage','fort','arc','dark','reaper','brave','eclipse']);
  function weeklyPartKind(groupKey,name) {
    if(groupKey==='blade') {
      const found=Object.values(PARTS).find(p=>['blade','main'].includes(p.kind) && [p.name,p.display,...(p.aliases||[])].some(x=>equivalentKey(x)===equivalentKey(name)));
      if(found)return found.kind;
      return CX_WEEKLY_MAIN.has(slug(name))?'main':'blade';
    }
    return ({ratchet:'ratchet',bit:'bit',assist:'assist',over:'over'}[groupKey]||'');
  }
  function applyPopularPartToSlot(kind,name,target) {
    if(!kind){toast('Este ranking representa uma categoria, não uma peça copiável.');return;}
    const id=ensureReferencePart(kind,name); const old=clone(deck[target]); let s=clone(old);
    if(kind==='blade') {
      const keepRatchet=old.ratchet||'', keepBit=old.bit||''; s=emptySlot(); s.mode='standard'; s.blade=id; s.ratchet=keepRatchet; s.bit=keepBit;
    } else if(kind==='integrated') {
      const keepBit=old.bit||''; s=emptySlot(); s.mode='integrated'; s.blade=id; s.bit=keepBit;
    } else if(['lock','main','assist','over'].includes(kind)) {
      if(!['cx','cxrib'].includes(s.mode)) { const keepR=old.ratchet||'', keepB=old.bit||''; s=emptySlot(); s.mode='cx'; s.ratchet=keepR; s.bit=keepB; }
      s[kind]=id; if(kind==='main' && !PARTS[id]?.requiresOver)s.over='';
    } else if(kind==='ratchet') {
      if(s.mode==='cxrib'){s.mode='cx';s.rib='';s.bit='';}
      if(s.mode==='integrated'){const keepBit=s.bit;s=emptySlot();s.mode='standard';s.bit=keepBit;}
      s.ratchet=id;
    } else if(kind==='bit') {
      if(s.mode==='cxrib'){s.mode='cx';s.rib='';}
      s.bit=id;
    } else if(kind==='rib') {
      if(!['cx','cxrib'].includes(s.mode)){s=emptySlot();}
      s.mode='cxrib';s.rib=id;s.ratchet='';s.bit='';
    }
    deck[target]=s; saveState(); renderAll(); goBuilder();
    const owned=(inventory[id]||0)>0; toast(`${name} copiada para o slot ${target+1}${owned?'.':' como referência (você não possui essa peça).'}`);
  }
  function copyWeeklyPart(groupKey,name) {
    const kind=weeklyPartKind(groupKey,name);
    if(!kind){toast('Esse item é um tipo de Lock Chip, não uma peça específica.');return;}
    openSlotPicker(`Usar ${name}`, `A peça será aplicada ao slot escolhido (${KIND_LABEL[kind]||kind}).`, target=>applyPopularPartToSlot(kind,name,target));
  }

  function equivalentKey(x) { return slug(x).replace(/-/g,''); }
  function hasEquivalent(name) {
    const n=equivalentKey(name);
    return Object.values(PARTS).some(p => (inventory[p.id]||0)>0 && [p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>equivalentKey(x)===n));
  }
  function findEquivalent(kind,name) {
    const n=equivalentKey(name);
    return Object.values(PARTS).find(p=>p.kind===kind && [p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>equivalentKey(x)===n));
  }
  function ensureReferencePart(kind,name) {
    let p=findEquivalent(kind,name); if(p) return p.id;
    let actual=name, abbrev='';
    if(kind==='bit') {const upper=String(name).toUpperCase();const byName=Object.entries(BIT_NAMES).find(([k,v])=>k===upper||slug(v)===slug(name));if(byName){abbrev=byName[0];actual=byName[1];}}
    p=P(kind,actual,{display:actual,abbrev,wiki:wikiTitle(kind,actual),basicLock:kind==='lock',source:'meta reference'}); reg(p); return p.id;
  }
  function comboPartsFromText(combo){
    const raw=String(combo||'').trim();const m=raw.match(/^(.*?)\s+([0-9M]+-\d{2})\s+(.+)$/i);if(m)return[m[1].trim(),m[2],m[3].trim()];
    const bits=Object.values(PARTS).filter(p=>p.kind==='bit').sort((a,b)=>Math.max(b.display.length,b.abbrev.length)-Math.max(a.display.length,a.abbrev.length));
    for(const bit of bits){for(const name of [bit.display,bit.abbrev].filter(Boolean)){const re=new RegExp(`\\s+${name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}$`,'i');if(re.test(raw))return[raw.replace(re,'').trim(),bit.display];}}
    return[];
  }
  function popularOwned(d){return (d.parts||d.combos.map(comboPartsFromText)).reduce((n,parts)=>n+(parts||[]).filter(hasEquivalent).length,0);}
  function comboOwnedText(parts){parts=parts||[];const n=parts.filter(hasEquivalent).length,total=parts.length||3;return n===total&&total?`${BX.ic('check', 14)} Você possui todas as peças-base`:n?`${n}/${total} peças-base na coleção`:'Nenhuma peça-base equivalente';}
  function popularSlot(parts,combo='') {
    parts=(parts&&parts.length)?parts:comboPartsFromText(combo);if(!parts.length)return emptySlot();
    if(parts.length===2){const s=emptySlot();s.mode='integrated';s.blade=ensureReferencePart('integrated',parts[0]);s.bit=ensureReferencePart('bit',parts[1]);return s;}
    const [bladeName,middle,bitName]=parts;
    const cxKey=slug(bladeName).replace(/-/g,'');
    const cxFullMap={
      emperorblastheavy:['Emperor','Blast','Heavy'],emperorblastfree:['Emperor','Blast','Free'],
      valkyrieblastheavy:['Valkyrie','Blast','Heavy'],pegasusblastheavy:['Pegasus','Blast','Heavy'],
      pegasusblastassault:['Pegasus','Blast','Assault']
    };
    const fullCx=cxFullMap[cxKey];
    if(fullCx&&String(middle||'').match(/^[0-9M]+-\d{2}$/i)){const s=emptySlot();s.mode='cx';s.lock=ensureReferencePart('lock',fullCx[0]);s.main=ensureReferencePart('main',fullCx[1]);s.assist=ensureReferencePart('assist',fullCx[2]);s.ratchet=ensureReferencePart('ratchet',middle);s.bit=ensureReferencePart('bit',bitName);return s;}
    const cxMap={pegasusblast:['Pegasus','Blast'],soleclipse:['Sol','Eclipse']};const cx=cxMap[cxKey];const mid=String(middle||'').match(/^([A-Za-z ]+?)([0-9M]+-\d{2})$/);
    if(cx&&mid){const s=emptySlot();s.mode='cx';s.lock=ensureReferencePart('lock',cx[0]);s.main=ensureReferencePart('main',cx[1]);s.assist=ensureReferencePart('assist',mid[1].trim());s.ratchet=ensureReferencePart('ratchet',mid[2]);s.bit=ensureReferencePart('bit',bitName);return s;}
    const knownIntegrated=Object.values(PARTS).find(p=>p.kind==='integrated'&&normalizedAliases(p).includes(equivalentKey(bladeName)));
    if(knownIntegrated&&!middle.match(/^[0-9M]+-\d{2}$/i)){const s=emptySlot();s.mode='integrated';s.blade=knownIntegrated.id;s.bit=ensureReferencePart('bit',bitName||middle);return s;}
    const s=emptySlot();s.mode='standard';s.blade=ensureReferencePart('blade',bladeName);s.ratchet=ensureReferencePart('ratchet',middle);s.bit=ensureReferencePart('bit',bitName);return s;
  }
  function copyPopularDeck(i){const d=metaDecks[i];if(!d)return;deck=d.combos.map((c,j)=>popularSlot(d.parts?.[j],c));while(deck.length<3)deck.push(emptySlot());deck=deck.slice(0,3);document.getElementById('deckName').value=`${d.player||d.sourceName||'Meta'} — ${d.event}`;localStorage.setItem('bx_deck_name',document.getElementById('deckName').value);saveState();renderAll();goBuilder();const missing=validateDeck().errors.filter(x=>/possui|cópia física|usando/.test(x)).length;toast(missing?'Deck copiado como referência. Peças que faltam estão marcadas.':'Deck meta copiado para o montador.');}

  const KR_META={
    '위저드 로드':'Wizard Rod','코발트 드래군':'Cobalt Dragoon','드랜 스트라이크':'Dran Strike','와이번 호버':'Wyvern Hover','글로리 발키리':'Glory Valkyrie','에어로 페가시우스':'Aero Pegasus','샤크 스케일':'Shark Scale','실버 울프':'Silver Wolf','메테오 드래군':'Meteor Dragoon','블릿 그리폰':'Bullet Griffon','드랜 버스터':'Dran Buster','드랜 소드':'Dran Sword','스콜피온 스피어':'Scorpio Spear','피닉스 소어':'Phoenix Wing','머미 커스':'Mummy Curse','엠퍼러':'Emperor Might','델타':'Delta','블라스트':'Blast','골렘 락':'Golem Rock','나이트 메일':'Knight Mail'
  };
  function metaBitName(token){const p=Object.values(PARTS).find(x=>['bit','rib'].includes(x.kind)&&String(x.abbrev).toUpperCase()===String(token).toUpperCase());return p?.display||token;}
  function parseBBXDB(text,page=1){
    const t=text.replace(/!\[([^\]]+)\]\([^)]*\)/g,'\n$1\n').replace(/\r/g,'');const out=[];const ev=/(RANKED|UNRANKED)\s+(\d{4}\.\d{2}\.\d{2})\s+(\d+)명 참가[\s\S]*?###\s*([^\n]+)([\s\S]*?)(?=(?:RANKED|UNRANKED)\s+\d{4}\.\d{2}\.\d{2}|$)/g;let em;
    while((em=ev.exec(t))){const ranked=em[1]==='RANKED',date=em[2],players=+em[3],event=stripMd(em[4]),body=em[5];const rr=/(?:^|\n)\s*([123])\s+(?:1위|2위|3위)\s+입상 덱([\s\S]*?)(?=(?:\n\s*[123]\s+(?:1위|2위|3위)\s+입상 덱)|$)/g;let rm;
      while((rm=rr.exec(body))){let lines=rm[2].split(/\n/).map(stripMd).filter(Boolean).filter(x=>!/^Image:/i.test(x));const ded=[];for(const x of lines)if(ded.at(-1)!==x)ded.push(x);lines=ded;const combos=[],parts=[];
        for(let i=0;i<lines.length&&combos.length<3;i++){const blade=KR_META[lines[i]];if(!blade)continue;const a=lines[i+1],b=lines[i+2],c=lines[i+3];if(/^[0-9M]+-\d{2}$/i.test(a)&&b){combos.push(`${blade} ${a} ${metaBitName(b)}`);parts.push([blade,a,metaBitName(b)]);i+=2;}else if(a&&Object.values(PARTS).some(p=>['bit','rib'].includes(p.kind)&&String(p.abbrev).toUpperCase()===a.toUpperCase())){combos.push(`${blade} ${metaBitName(a)}`);parts.push([blade,metaBitName(a)]);i+=1;}else if(a&&/^[A-Za-z]{1,3}$/.test(a)&&/^[0-9M]+-\d{2}$/i.test(b)&&c){combos.push(`${blade} ${a} ${b} ${metaBitName(c)}`);parts.push([]);i+=3;}}
        if(combos.length===3)out.push({player:'Pódio BBX DB',place:`${rm[1]}º`,event,date:date.replace(/\./g,'-'),players,ranked,sourceType:'podium',sourceName:`BBX DB p.${page}`,combos,parts,source:'https://bbxdatabase.com/record'});
      }
    }return out;
  }
  function parseBeycrateArchetypes(text){
    const t=text.replace(/!\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\r/g,'');const rows=[];const re=/\n([A-Z][A-Za-z0-9' -]{2,45})\s+In\s+([\d.]+)% of podium decks([\s\S]*?)(?=\n[A-Z][A-Za-z0-9' -]{2,45}\s+In\s+[\d.]+% of podium decks|$)/g;let m;
    while((m=re.exec(t))){const blade=m[1].trim(),seg=m[3],builds=[];const br=/\d+\.\s+((?:[0-9M]+-\d{2}\s+)?[A-Za-z][A-Za-z ]*?)\s+\d+(?:\.\d+)?%/g;let bm;while((bm=br.exec(seg))&&builds.length<5)builds.push(bm[1].trim());if(builds.length)rows.push({blade,share:+m[2],builds});}
    const out=[];for(let start=0;start+2<Math.min(rows.length,12);start+=3){const trio=rows.slice(start,start+3),used=new Set(),combos=[],parts=[];for(const r of trio){let chosen=null;for(const b of r.builds){const mm=b.match(/^([0-9M]+-\d{2})\s+(.+)$/i);const pp=mm?[r.blade,mm[1],mm[2]]:[r.blade,b];const keys=pp.slice(1).map(equivalentKey);if(keys.every(k=>!used.has(k))){chosen=pp;keys.forEach(k=>used.add(k));break;}}if(chosen){parts.push(chosen);combos.push(chosen.join(' '));}}if(combos.length===3)out.push({player:'Arquétipo Beycrate',place:'AGG',event:'Meta agregado • 4 semanas',date:'online',players:0,ranked:true,sourceType:'aggregate',sourceName:'Beycrate',combos,parts,source:'https://beycrate.com/'});}return out;
  }

  function escapeRegex(v){return String(v||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function bbxHubSlug(name){return slug(String(name||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2'));}
  function bbxHubTopBlades(text){
    const sec=(String(text||'').split(/##\s*Blade/i)[1]||'').split(/##\s*Ratchet/i)[0]||'';
    const out=[];
    for(const raw of sec.split(/\r?\n/)){
      const line=stripMd(raw);
      const m=line.match(/^(?:\d+\.\s*)?\d+\s+([A-Za-z][A-Za-z0-9'’ -]{2,42}?)\s+\d+(?:\b|[▲▼–-])/);
      if(m){const name=m[1].trim();if(!out.some(x=>equivalentKey(x)===equivalentKey(name)))out.push(name);}
    }
    return out.length?out.slice(0,14):['SharkScale','WizardRod','AeroPegasus','CobaltDragoon','SilverWolf','PhoenixWing','DranStrike','WyvernHover','MeteorDragoon','GolemRock'];
  }
  function parseBBXHubGuide(text,blade){
    const section=(String(text||'').split(/##\s*Best[^\n]*combos/i)[1]||'').split(/Build a deck|##\s*More/i)[0]||'';
    const builds=[];
    for(const raw of section.split(/\r?\n/)){
      const line=stripMd(raw).replace(/\s+/g,' ').trim();
      if(!line||!/[0-9M]+-\d{2}/i.test(line))continue;
      const rm=line.match(/([0-9M]+-\d{2})\s*([A-Za-z][A-Za-z ]{0,25}?)(?=\s+(?:\d+×|\d+(?:\.\d+)?%|\||Uses\b|Share\b)|$)/i);
      if(!rm)continue;
      const ratchet=rm[1].toUpperCase(),bit=rm[2].trim().replace(/\s+/g,' ');
      if(!bit||/^(Uses|Share)$/i.test(bit))continue;
      if(!builds.some(b=>equivalentKey(b[0]+' '+b[1])===equivalentKey(ratchet+' '+bit)))builds.push([ratchet,bit]);
      if(builds.length>=8)break;
    }
    return {blade,builds};
  }
  function buildBBXHubArchetypes(guides){
    const valid=guides.filter(g=>g&&g.builds?.length),out=[];
    for(let a=0;a<valid.length;a++)for(let b=a+1;b<valid.length;b++)for(let c=b+1;c<valid.length;c++){
      const trio=[valid[a],valid[b],valid[c]],used=new Set(),combos=[],parts=[];
      for(const g of trio){
        let chosen=null;
        for(const build of g.builds){const keys=build.map(equivalentKey);if(keys.every(k=>!used.has(k))){chosen=build;keys.forEach(k=>used.add(k));break;}}
        if(!chosen)break;
        const prettyBlade=g.blade.replace(/([a-z0-9])([A-Z])/g,'$1 $2');
        combos.push(`${prettyBlade} ${chosen[0]} ${chosen[1]}`);parts.push([prettyBlade,chosen[0],chosen[1]]);
      }
      if(combos.length===3)out.push({player:'Arquétipo BBXHub',place:'AGG',event:'Meta agregado • resultados globais',date:'online',players:0,ranked:true,sourceType:'aggregate',sourceName:'BBXHub • WBO + Blader League Germany',combos,parts,source:'https://bbxhub.net/'});
      if(out.length>=10)return out;
    }
    return out;
  }
  async function fetchBBXHubArchetypes(){
    const root=await fetchRemoteText(REMOTE.bbxhub),top=bbxHubTopBlades(root);
    if(!top.length)return[];
    const count=Math.min(6,top.length),names=[];
    for(let i=0;i<count;i++)names.push(top[(bbxhubCursor+i)%top.length]);
    bbxhubCursor=(bbxhubCursor+3)%top.length;localStorage.setItem(BBXHUB_CURSOR_KEY,JSON.stringify(bbxhubCursor));
    const pages=await Promise.allSettled(names.map(n=>fetchRemoteText(`${REMOTE.bbxhub}meta/${bbxHubSlug(n)}`)));
    const guides=[];pages.forEach((r,i)=>{if(r.status==='fulfilled')guides.push(parseBBXHubGuide(r.value,names[i]));});
    return buildBBXHubArchetypes(guides);
  }
  function parseBeyBaseG2(text){
    const wanted=['Shark Scale 3-60 Rush','Emperor Blast Heavy 9-60 Low Rush','Wizard Rod 1-60 Low Orb'];
    if(!wanted.every(x=>equivalentKey(text).includes(equivalentKey(x))))return[];
    return [{player:'Kei',place:'1º',event:'SpaWorld Cup Dispatch G2 • Xtreme Stadium',date:'07 fev 2026',players:256,ranked:true,sourceType:'podium',sourceName:'BeyBase • G2 Japão',combos:wanted,parts:wanted.map(comboPartsFromText),source:REMOTE.beybaseG2}];
  }

  function metaSignature(d){return d.combos.map(equivalentKey).sort().join('|')+'|'+equivalentKey(d.event||'');}
  function appendMetaDecks(items){const seen=new Set(metaDecks.map(metaSignature));let n=0;for(const d of items){const sig=metaSignature(d);if(!seen.has(sig)){seen.add(sig);metaDecks.push(d);n++;}}localStorage.setItem(META_CACHE_KEY,JSON.stringify(metaDecks));return n;}
  async function loadMoreMetaDecks(){
    const btn=document.getElementById('loadMoreMetaBtn'),status=document.getElementById('metaFetchStatus');
    if(btn)btn.disabled=true;
    if(status)status.textContent='Buscando BBX DB + Beycrate + BBXHub + BeyBase…';
    let added=0,worked=0;
    try{
      const jobs=await Promise.allSettled([
        fetchRemoteText(`${REMOTE.bbxdb}?page=${metaCursor}`),
        fetchRemoteText(REMOTE.beycrate),
        fetchBBXHubArchetypes(),
        fetchRemoteText(REMOTE.beybaseG2)
      ]);
      if(jobs[0].status==='fulfilled'){
        const parsed=parseBBXDB(jobs[0].value,metaCursor);added+=appendMetaDecks(parsed);worked++;
        metaCursor++;localStorage.setItem(META_CURSOR_KEY,JSON.stringify(metaCursor));
      }
      if(jobs[1].status==='fulfilled'){added+=appendMetaDecks(parseBeycrateArchetypes(jobs[1].value));worked++;}
      if(jobs[2].status==='fulfilled'){added+=appendMetaDecks(jobs[2].value||[]);worked++;}
      if(jobs[3].status==='fulfilled'){added+=appendMetaDecks(parseBeyBaseG2(jobs[3].value));worked++;}
      metaVisible=Math.min(metaDecks.length,metaVisible+Math.max(15,added));renderPopular();
      if(status)status.textContent=added?`${added} novos cards • ${metaDecks.length} no cache local`:`Sem cards inéditos nesta rodada • ${worked}/4 fontes responderam`;
      toast(added?`${added} novos decks/arquétipos adicionados.`:'As fontes responderam, mas os resultados desta rodada já estavam no cache. Clique de novo para avançar páginas/combinações.');
    }catch{
      if(status)status.textContent='Falha de rede • mantendo cache';toast('Não consegui buscar mais decks agora.');
    }finally{if(btn)btn.disabled=false;}
  }

  function renderPopular() {
    const root=document.getElementById('popularGrid');if(!root)return;const shown=metaDecks.slice(0,metaVisible);const count=document.getElementById('metaDeckCount');if(count)count.textContent=`${shown.length} de ${metaDecks.length} cards carregados`;
    root.innerHTML=shown.map((d,idx)=>{const effectiveParts=(d.parts||d.combos.map(comboPartsFromText));const own=popularOwned(d),total=Math.max(1,effectiveParts.reduce((n,p)=>n+(p?.length||3),0)),pct=Math.round(own/total*100),badge=d.sourceType==='aggregate'?'Agregado':'Pódio';const info=[d.date,d.players?`${d.players} jogadores`:'',d.ranked===false?'Unranked':d.ranked?'Ranked':''].filter(Boolean).join(' • ');
      return `<article class="meta-deck"><div class="meta-head"><div><h2>${escapeHTML(d.player||d.sourceName||'Meta')}</h2><p>${escapeHTML(d.event)}${info?` • ${escapeHTML(info)}`:''}</p><span class="meta-source-badge ${d.sourceType==='aggregate'?'aggregate':'podium'}">${badge} • ${escapeHTML(d.sourceName||'WBO')}</span></div><div class="place">${escapeHTML(d.place||'META')}</div></div><div class="meta-combos">${d.combos.map((c,i)=>`<div class="meta-combo"><div class="combo-num">${i+1}</div>${window.BX?.beyMini&&window.BX.partTag?._idx?window.BX.beyMini(effectiveParts[i]||comboPartsFromText(c),{u:38}):''}<div class="combo-text"><strong>${window.BX?.partTag?._idx?window.BX.comboTags(c,{size:18}):escapeHTML(c)}</strong><small>${comboOwnedText(effectiveParts[i])}</small></div><button class="mini-copy copy-meta-bey" data-i="${idx}" data-bey="${i}" title="Copiar apenas este Bey">Copiar Bey</button></div>`).join('')}</div><div class="meta-foot"><div class="owned-meter"><small>${own}/${total} peças-base equivalentes na sua coleção</small><div><i style="width:${pct}%"></i></div></div><div class="meta-actions"><button class="btn ghost copy-meta" data-i="${idx}">Copiar deck inteiro</button><a class="meta-link" href="${d.source}" target="_blank" rel="noopener">Fonte ${BX.ic('external', 14)}</a></div></div></article>`;}).join('');
    root.querySelectorAll('.copy-meta').forEach(b=>b.addEventListener('click',()=>copyPopularDeck(+b.dataset.i)));root.querySelectorAll('.copy-meta-bey').forEach(b=>b.addEventListener('click',()=>{const d=metaDecks[+b.dataset.i],parts=d.parts?.[+b.dataset.bey]||comboPartsFromText(d.combos[+b.dataset.bey]);copyBeyToBuilder(popularSlot(parts,d.combos[+b.dataset.bey]),d.combos[+b.dataset.bey]);}));
  }

  function renderWeekly() {
    const summary=document.getElementById('weeklySummary'); const root=document.getElementById('weeklyGrid'); if(!root)return;
    summary.innerHTML=`<div><b>${BBX_WEEKLY.events}</b><span>eventos WBO</span></div><div><b>${BBX_WEEKLY.parts.toLocaleString('pt-BR')}</b><span>peças analisadas</span></div><div><b>${BBX_WEEKLY.week}</b><span>janela do snapshot</span></div>`;
    root.innerHTML=BBX_WEEKLY.groups.map(g=>`<section class="weekly-card"><div class="weekly-head"><h2>${escapeHTML(g.title)}</h2><small>índice BBX Weekly</small></div><div class="rank-list">${g.items.map(([name,val],i)=>{const own=hasEquivalent(name);const copyable=!!weeklyPartKind(g.key,name);return `<div class="rank-row big ${own?'owned':''}"><b>#${i+1}</b><span>${window.BX?.partTag?._idx?window.BX.partTag(name,{size:44}):escapeHTML(name)}${own?' <em>na sua coleção</em>':''}</span><div><i style="width:${Math.min(100,val)}%"></i></div><strong>${val}</strong>${copyable?`<button class="rank-copy" data-group="${g.key}" data-name="${escapeAttr(name)}" title="Usar esta peça no deck">＋</button>`:''}</div>`}).join('')}</div></section>`).join('');
    root.querySelectorAll('.rank-copy').forEach(b=>b.addEventListener('click',()=>copyWeeklyPart(b.dataset.group,b.dataset.name)));
  }

  function availableOwned(kind,usage) {
    return PARENTS().filter(p=>p.kind===kind && (inventory[p.id]||0)>(usage[p.id]||0) && !p.banned && (p.basicLock || !(usage[p.id]>0)));
  }
  function pick(arr){ return arr.length?arr[Math.floor(Math.random()*arr.length)]:null; }
  function usePart(p,usage){ if(!p)return false; usage[p.id]=(usage[p.id]||0)+1; return p.id; }
  function buildRandomSlot(usage) {
    const modes=[];
    if(availableOwned('blade',usage).length && availableOwned('ratchet',usage).length && availableOwned('bit',usage).length) modes.push('standard');
    if(availableOwned('integrated',usage).length && availableOwned('bit',usage).length) modes.push('integrated');
    if(availableOwned('lock',usage).length && availableOwned('main',usage).length && availableOwned('assist',usage).length && availableOwned('ratchet',usage).length && availableOwned('bit',usage).length) modes.push('cx');
    if(availableOwned('lock',usage).length && availableOwned('main',usage).length && availableOwned('assist',usage).length && availableOwned('rib',usage).length) modes.push('cxrib');
    if(!modes.length)return null;
    const mode=pick(modes); const s=emptySlot(); s.mode=mode;
    if(mode==='standard'){s.blade=usePart(pick(availableOwned('blade',usage)),usage);s.ratchet=usePart(pick(availableOwned('ratchet',usage)),usage);s.bit=usePart(pick(availableOwned('bit',usage)),usage);}
    if(mode==='integrated'){s.blade=usePart(pick(availableOwned('integrated',usage)),usage);s.bit=usePart(pick(availableOwned('bit',usage)),usage);}
    if(mode==='cx' || mode==='cxrib'){
      s.lock=usePart(pick(availableOwned('lock',usage)),usage); s.main=usePart(pick(availableOwned('main',usage)),usage); s.assist=usePart(pick(availableOwned('assist',usage)),usage);
      if(PARTS[s.main]?.requiresOver){const ov=pick(availableOwned('over',usage)); if(!ov)return null; s.over=usePart(ov,usage);}
      if(mode==='cx'){s.ratchet=usePart(pick(availableOwned('ratchet',usage)),usage);s.bit=usePart(pick(availableOwned('bit',usage)),usage);} else s.rib=usePart(pick(availableOwned('rib',usage)),usage);
    }
    return isComplete(s)?s:null;
  }
  function buildRandomDeckCandidate(){
    for(let outer=0;outer<40;outer++){
      const usage={}; const out=[]; let ok=true;
      for(let i=0;i<3;i++){const s=buildRandomSlot(usage);if(!s){ok=false;break;}out.push(s);} if(ok)return out;
    } return null;
  }
  function candidateScore(cand){
    const old=deck; deck=cand; const aa=cand.map(analyzeBey); const da=analyzeDeck(); deck=old;
    if(aa.some(x=>!x))return -999;
    const types=new Set(aa.map(x=>x.type)).size; const avg=k=>aa.reduce((n,a)=>n+a[k],0)/3;
    const atk=avg('atk'),def=avg('def'),sta=avg('sta'),aggr=avg('aggr');
    let score=(atk+def+sta)*2 + types*8;
    const counts={};aa.forEach(a=>counts[a.type]=(counts[a.type]||0)+1); if(Math.max(...Object.values(counts))===3)score-=24; else if(Math.max(...Object.values(counts))===2)score-=7;
    if(sta<4)score-=14;if(atk<4.2)score-=10;if(aggr>8)score-=7;if(def<3.7)score-=5; score-=(da.special?.length||0)*4;
    return score;
  }
  function generateRandomDeck(viable=false) {
    if(!viable){const c=buildRandomDeckCandidate();if(!c){toast('Não há peças suficientes para gerar 3 Beys legais.');return;}deck=c;}
    else {
      const candidates=[]; for(let i=0;i<500;i++){const c=buildRandomDeckCandidate();if(c)candidates.push([candidateScore(c),c]);}
      if(!candidates.length){toast('Não há peças suficientes para gerar um deck viável.');return;}
      candidates.sort((a,b)=>b[0]-a[0]); const pool=candidates.slice(0,Math.min(12,candidates.length)); deck=pick(pool)[1];
    }
    document.getElementById('deckName').value=viable?'Aleatório viável':'Deck aleatório'; localStorage.setItem('bx_deck_name',document.getElementById('deckName').value);
    saveState(); renderAll(); toast(viable?'Gerei um deck legal buscando diversidade e cobertura pelas heurísticas.':'Gerei um deck 3-on-3 legal com sua coleção.');
  }

  async function addManualPart() {
    const kind=document.getElementById('manualKind').value;
    const name=document.getElementById('manualName').value.trim();
    const qty=Math.max(1,parseInt(document.getElementById('manualQty').value,10)||1);
    if(!name){toast('Digite o nome da peça.');return;}
    const findExact=()=>{
      const key=equivalentKey(name);
      return Object.values(PARTS).find(p=>p.kind===kind && normalizedAliases(p).some(a=>a===key));
    };
    let part=findExact();
    if(!part){
      updateCatalogStatus('Consultando catálogo online…','live',true);
      await syncLiveCatalog({quiet:true,force:true});
      part=findExact();
    }
    if(!part){
      // A peça pode ter acabado de sair e ainda não ter entrado no índice de stats/imagens.
      // Nesse caso, consulta os produtos da PHStudy e registra as peças encontradas na página.
      try{
        const search=await fetchRemoteText(phstudySearchUrl(name)),links=extractProductLinks(search);
        for(const link of links.slice(0,5)){try{const detail=await fetchRemoteText(link.url);parsePhstudyProduct(detail,link.title);}catch{}}
        part=findExact()||Object.values(PARTS).find(p=>p.kind===kind&&normalizedAliases(p).some(a=>a.includes(equivalentKey(name))||equivalentKey(name).includes(a)));
      }catch{}
    }
    if(!part){
      const elsewhere=Object.values(PARTS).find(p=>normalizedAliases(p).some(a=>a===equivalentKey(name)));
      if(elsewhere)toast(`${name} existe no catálogo como ${KIND_LABEL[elsewhere.kind]||elsewhere.kind}.`);
      else toast('Essa peça não foi encontrada no catálogo online. Use “Buscar peças e lançamentos” para conferir o nome.');
      return;
    }
    if(!manualParts[part.id]) manualParts[part.id]={part,qty:0};
    manualParts[part.id].part=part;manualParts[part.id].qty+=qty;
    persistCollection();
    document.getElementById('manualName').value=''; rebuildInventory(); toast(`${part.display} adicionada à parte (${qty}×).`);
  }

  function partOriginText(id){
    const recs=Object.values(inventoryOrigins[id]||{}).filter(x=>x.qty!==0);
    if(!recs.length)return '';
    return recs.map(x=>x.kind==='loose'?(x.label==='Adicionada à parte'?`Adicionada à parte${x.qty>1?` ×${x.qty}`:''}`:`${x.label} ${x.qty>0?'+':''}${x.qty}`):`${x.label}${x.qty>1?` ×${x.qty}`:''}`).join('\n');
  }
  function partTooltip(p){const origin=partOriginText(p?.id);return `${p?.display||''}${origin?`\n\nOrigem na sua coleção:\n${origin}`:''}`;}
  function partArt(p,size='') {
    if(!p) return `<div class="part-art ${size}"><span class="fallback">X</span></div>`;
    const key=encodeURIComponent(p.wiki||p.display);
    return `<div class="part-art ${size} loading" data-part="${escapeAttr(p.id)}" data-wiki="${escapeAttr(p.wiki||'')}" data-key="${key}" title="${escapeAttr(partTooltip(p))}"><span class="fallback">${escapeHTML(shortLabel(p))}</span></div>`;
  }
  function shortLabel(p){ return p.abbrev || p.display.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase(); }

  const imgQueue=[]; let imgActive=0;
  const imgObserver=('IntersectionObserver' in window)?new IntersectionObserver((entries)=>{
    for(const en of entries){ if(!en.isIntersecting)continue; imgObserver.unobserve(en.target); if(!en.target.dataset.loaded){en.target.dataset.loaded='1';enqueueImage(en.target);} }
  },{rootMargin:'300px 0px'}):null;
  function hydrateImages(root=document) {
    root.querySelectorAll('.part-art[data-wiki]:not([data-loaded]):not([data-observed])').forEach(el=>{
      if(imgObserver){el.dataset.observed='1';imgObserver.observe(el);}
      else {el.dataset.loaded='1';enqueueImage(el);}
    });
  }
  function enqueueImage(el){imgQueue.push(el);runImageQueue();}
  function runImageQueue(){while(imgActive<6&&imgQueue.length){const el=imgQueue.shift();imgActive++;resolveImage(el.dataset.part||el.dataset.wiki).then(url=>{if(url&&el.isConnected){const img=new Image();img.alt='';img.onload=()=>{if(!el.isConnected)return;el.innerHTML='';el.appendChild(img);el.classList.remove('loading');};img.onerror=()=>el.classList.remove('loading');img.src=url;}else el.classList.remove('loading');}).finally(()=>{imgActive--;runImageQueue();});}}

  async function resolveImage(key) {
    const p=PARTS[key]||null;
    if(p?.image) return p.image;
    const title=p?.wiki||key;
    if(!title)return '';

    // Volta ao comportamento visual da v4: Fandom por título de peça e, se necessário,
    // busca pelo mesmo título. Não usamos as miniaturas importadas do catálogo vivo aqui,
    // pois elas eram a principal fonte das inconsistências da v5.
    const cache=loadJSON('bx_img_cache',{});
    const ck=p?.id||title;
    const forceExact=p?.id==='blade:pteraswing'; // evita reaproveitar eventual cache ruim de Talon Ptera.
    if(typeof cache[ck]==='string'&&cache[ck].startsWith('miss:')){ if(Date.now()-(+cache[ck].slice(5)||0)<7*864e5)return ''; }
    else if(cache[ck] && !forceExact)return cache[ck];
    try {
      let url=`https://beyblade.fandom.com/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=512&titles=${encodeURIComponent(title)}`;
      let data=await fetch(url).then(r=>r.json());
      let page=Object.values(data.query?.pages||{})[0];
      let image=page?.thumbnail?.source||'';
      if(!image){
        url=`https://beyblade.fandom.com/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=512`;
        data=await fetch(url).then(r=>r.json());
        page=Object.values(data.query?.pages||{})[0];
        image=page?.thumbnail?.source||'';
      }
      cache[ck]=image||('miss:'+Date.now());localStorage.setItem('bx_img_cache',JSON.stringify(cache));
      return image;
    } catch { return ''; }
  }

  // ---------- Sessão de decks físicos ----------
  function reservedUsage() {
    const out={}; sessionDecks.forEach(d=>d.deck.forEach(slot=>slotParts(slot).forEach(id=>out[id]=(out[id]||0)+1))); return out;
  }
  function sessionDraftUsage(exceptSlot=-1) {
    const out={}; sessionDraft.forEach((slot,i)=>{if(i===exceptSlot)return;slotParts(slot).forEach(id=>out[id]=(out[id]||0)+1);}); return out;
  }
  function sessionAvailableParts(kind,slotIndex) {
    const reserved=reservedUsage(), other=sessionDraftUsage(slotIndex);
    return PARENTS().filter(p=>p.kind===kind && (inventory[p.id]||0)>0).sort((a,b)=>a.display.localeCompare(b.display)).map(p=>{
      const left=(inventory[p.id]||0)-(reserved[p.id]||0)-(other[p.id]||0);
      const repeated=(other[p.id]||0)>0 && !p.basicLock;
      return {p,qty:inventory[p.id]||0,left,disabled:left<=0||repeated};
    });
  }
  function sessionSelectHTML(kind,value,slotIndex,field,placeholder) {
    const opts=sessionAvailableParts(kind,slotIndex);
    if(value && PARTS[value] && !opts.some(x=>x.p.id===value))opts.unshift({p:PARTS[value],qty:inventory[value]||0,left:0,disabled:false,missing:true});
    return `<select data-session-slot="${slotIndex}" data-field="${field}"><option value="">${placeholder}</option>${opts.map(({p,left,disabled,missing})=>`<option value="${p.id}" ${p.id===value?'selected':''} ${disabled&&p.id!==value?'disabled':''}>${escapeHTML(p.display)}${p.abbrev&&p.abbrev!==p.display?' ['+p.abbrev+']':''} • ${Math.max(0,left)} livre(s)${missing?' — INDISPONÍVEL':''}${p.banned?' — BANIDA':''}</option>`).join('')}</select>`;
  }
  function validateSessionDraft() {
    const errors=[], warnings=[]; const reserved=reservedUsage(); const own={};
    sessionDraft.forEach((slot,i)=>{
      if(!isComplete(slot))return;
      slotParts(slot).forEach(id=>own[id]=(own[id]||0)+1);
      slotParts(slot).filter(id=>PARTS[id]?.banned).forEach(id=>warnings.push(`Bey ${i+1}: ${PARTS[id].display} é banida no regulamento WBO padrão, mas a sessão casual permite reservar a peça.`));
    });
    Object.entries(own).forEach(([id,n])=>{
      const p=PARTS[id]; if(!p)return; const total=(reserved[id]||0)+n, have=inventory[id]||0;
      if(total>have)errors.push(`${p.display}: seriam necessárias ${total} cópias físicas, mas você possui ${have}.`);
      if(n>1 && !p.basicLock)errors.push(`${p.display} se repete dentro deste deck 3-on-3.`);
    });
    const complete=sessionDraft.filter(isComplete).length;
    return {complete,errors:[...new Set(errors)],warnings:[...new Set(warnings)],legal:complete===3&&errors.length===0};
  }
  let sessionActiveSlot=0;
  function setSessionActiveSlot(i){
    sessionActiveSlot=Math.max(0,Math.min(2,i));
    document.querySelectorAll('#sessionDraftGrid .session-bey-card').forEach(c=>c.classList.toggle('active-slot',+c.dataset.sessionCard===sessionActiveSlot));
    const label=document.getElementById('sessActiveSlotLabel'); if(label)label.textContent=sessionActiveSlot+1;
    renderSessPicker();
  }
  /** Quantas cópias da peça (somando recolors) ainda estão livres para o slot ativo da sessão. */
  function sessionLeft(p,slotIndex=sessionActiveSlot){
    const reserved=reservedUsage(), other=sessionDraftUsage(slotIndex);
    const ids=[p.id,...childrenOf(p).map(k=>k.id)];
    const used=ids.reduce((n,id)=>n+(reserved[id]||0)+(other[id]||0),0);
    const repeated=ids.some(id=>(other[id]||0)>0)&&!p.basicLock;
    return {left:(inventory[p.id]||0)-used,repeated};
  }
  /** Na sessão física a cor tem que ser uma que você TEM (e que ainda esteja livre). */
  async function chooseOwnedColor(p){
    const kids=childrenOf(p).filter(k=>(inventory[k.id]||0)>0); if(!kids.length)return p;
    const reserved=reservedUsage(), other=sessionDraftUsage(sessionActiveSlot);
    const freeOf=(id)=>(inventory[id]||0)-(reserved[id]||0)-(other[id]||0);
    const kidsQty=childrenOf(p).reduce((n,k)=>n+(inventory[k.id]||0),0);
    const genericFree=(inventory[p.id]||0)-kidsQty-(reserved[p.id]||0)-(other[p.id]||0);
    const options=kids.filter(k=>freeOf(k.id)>0).map(k=>({id:k.id,img:k.image,label:k.colorLabel||'Cor',qty:freeOf(k.id)}));
    if(!options.length&&genericFree<=0)return null;
    if(options.length===1&&genericFree<=0)return PARTS[options[0].id];
    if(!options.length)return p;
    const r=await window.BX.colorDialog({name:p.display,options,allowDefault:genericFree>0,defaultLabel:`Sem cor definida (${genericFree} livre${genericFree>1?'s':''})`,hint:'Qual das suas cores vai neste Bey?'});
    if(r===null)return null; return r==='__default'?p:(PARTS[r]||p);
  }
  function renderSessionSlot(slot,i) {
    const isCX=['cx','cxrib'].includes(slot.mode), main=PARTS[slot.main], overNeeded=isCX&&main?.requiresOver;
    return `<article class="session-bey-card ${i===sessionActiveSlot?'active-slot':''}" data-session-card="${i}">
      <div class="bey-head"><div class="slot-number"><b><i>${i+1}</i></b> Bey ${i+1}</div><button class="session-clear-slot" data-slot="${i}" title="Limpar">×</button></div>
      ${renderBeyVisual(slot)}
      <div class="bey-form compact-form">
        <div class="field"><label>Estrutura</label><select data-session-slot="${i}" data-field="mode"><option value="standard" ${slot.mode==='standard'?'selected':''}>Blade + Ratchet + Bit</option><option value="cx" ${slot.mode==='cx'?'selected':''}>CX Custom Line</option><option value="cxrib" ${slot.mode==='cxrib'?'selected':''}>CX + Ratchet-Integrated Bit</option><option value="integrated" ${slot.mode==='integrated'?'selected':''}>Ratchet-integrated Blade</option></select></div>
        ${slot.mode==='standard'?`<div class="field"><label>Blade</label>${sessionSelectHTML('blade',slot.blade,i,'blade','Escolha')}</div><div class="field"><label>Ratchet</label>${sessionSelectHTML('ratchet',slot.ratchet,i,'ratchet','Escolha')}</div>`:''}
        ${slot.mode==='integrated'?`<div class="field"><label>Integrated Blade</label>${sessionSelectHTML('integrated',slot.blade,i,'blade','Escolha')}</div>`:''}
        ${isCX?`<div class="cx-box"><div class="field"><label>Lock Chip</label>${sessionSelectHTML('lock',slot.lock,i,'lock','Escolha')}</div><div class="field"><label>Main / Metal</label>${sessionSelectHTML('main',slot.main,i,'main','Escolha')}</div>${overNeeded?`<div class="field"><label>Over Blade</label>${sessionSelectHTML('over',slot.over,i,'over','Escolha')}</div>`:''}<div class="field"><label>Assist Blade</label>${sessionSelectHTML('assist',slot.assist,i,'assist','Escolha')}</div></div>${slot.mode==='cx'?`<div class="field"><label>Ratchet</label>${sessionSelectHTML('ratchet',slot.ratchet,i,'ratchet','Escolha')}</div>`:`<div class="field"><label>Integrated Bit</label>${sessionSelectHTML('rib',slot.rib,i,'rib','Escolha')}</div>`}`:''}
        ${slot.mode!=='cxrib'?`<div class="field"><label>Bit</label>${sessionSelectHTML('bit',slot.bit,i,'bit','Escolha')}</div>`:''}
      </div><div class="bey-summary"><strong>${escapeHTML(slotName(slot))}</strong><small>${isComplete(slot)?'Pronto para reservar':'Incompleto'}</small></div>
    </article>`;
  }
  function onSessionSlotChange(e){
    const i=+e.target.dataset.sessionSlot, field=e.target.dataset.field, value=e.target.value;
    if(field==='mode'){sessionDraft[i]=emptySlot();sessionDraft[i].mode=value;} else {sessionDraft[i][field]=value;if(field==='main'&&!PARTS[value]?.requiresOver)sessionDraft[i].over='';}
    saveSession();renderSession();
  }
  function renderSession(){
    const root=document.getElementById('sessionDraftGrid'); if(!root)return;
    const v=validateSessionDraft(), reserved=reservedUsage();
    const reservedCount=Object.values(reserved).reduce((a,b)=>a+b,0), total=Object.values(inventory).reduce((a,b)=>a+b,0);
    document.getElementById('sessionSummary').innerHTML=`<div><b>${sessionDecks.length}</b><span>decks montados</span></div><div><b>${reservedCount}</b><span>peças reservadas</span></div><div><b>${Math.max(0,total-reservedCount)}</b><span>peças físicas livres</span></div>`;
    const leg=document.getElementById('sessionLegality');leg.className='legality '+(v.legal?'good':v.errors.length?'bad':'neutral');leg.innerHTML=v.legal?(v.warnings.length?`${BX.ic('check', 14)} Pode reservar • regra casual`:`${BX.ic('check', 14)} Pode reservar`):v.errors.length?`${BX.ic('x', 14)} Conflito de estoque`:`${v.complete}/3 Beys prontos`;
    root.innerHTML=sessionDraft.map(renderSessionSlot).join('');
    root.querySelectorAll('select[data-session-slot]').forEach(x=>x.addEventListener('change',onSessionSlotChange));
    root.querySelectorAll('.session-clear-slot').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();sessionDraft[+b.dataset.slot]=emptySlot();saveSession();renderSession();}));hydrateImages(root);
    root.querySelectorAll('.session-bey-card').forEach(c=>c.addEventListener('click',e=>{if(e.target.closest('select,button,a'))return;setSessionActiveSlot(+c.dataset.sessionCard);}));
    renderSessPicker();
    const decksRoot=document.getElementById('sessionDecks');
    sessionDecks.forEach(d=>{ if(!d.beys){ d.beys=deckBeyNames(d.deck); d.names=(d.deck||[]).map(slotName); } });
    decksRoot.innerHTML=sessionDecks.length?sessionDecks.map((d,i)=>`<article class="physical-deck"><div class="physical-deck-head"><div><small>DECK ${i+1}</small><h3>${escapeHTML(d.name||`Deck físico ${i+1}`)}</h3></div><button class="icon-btn release-session-deck" data-i="${i}" title="Desmontar / liberar peças">×</button></div>${window.BX?.deckPreview&&window.BX.partTag?._idx?`<div class="physical-preview">${window.BX.deckPreview(deckBeyNames(d.deck),{u:44})}</div>`:''}${d.deck.map((slot,j)=>`<div class="physical-bey"><b>${j+1}</b><span>${escapeHTML(slotName(slot))}</span></div>`).join('')}<small>${d.deck.flatMap(slotParts).length} componentes reservados</small></article>`).join(''):'<div class="empty-state">Nenhum deck físico reservado ainda.</div>';
    decksRoot.querySelectorAll('.release-session-deck').forEach(b=>b.addEventListener('click',()=>{sessionDecks.splice(+b.dataset.i,1);saveSession();renderSession();toast('Peças liberadas para a sessão.');}));
  }
  function lockSessionDeck(){
    const v=validateSessionDraft();if(!v.legal){toast(v.errors[0]||'Complete os três Beys antes de reservar.');return;}
    const name=document.getElementById('sessionDeckName').value.trim()||`Deck físico ${sessionDecks.length+1}`;
    sessionDecks.push({id:Date.now(),name,deck:clone(sessionDraft)});sessionDraft=emptyDeck();document.getElementById('sessionDeckName').value='';saveSession();renderSession();toast('Deck reservado. Essas peças não serão oferecidas nos próximos.');
  }

  // ---------- Organizador de torneio ----------
  function playerById(id){return tournament.players.find(p=>p.id===id)||null;}
  function playerAvatar(p,cls=''){return p?.photo?`<img class="player-avatar ${cls}" src="${p.photo}" alt="">`:`<div class="player-avatar placeholder ${cls}">${escapeHTML((p?.name||'?').slice(0,1).toUpperCase())}</div>`;}
  function nextPow2(n){let p=1;while(p<n)p*=2;return p;}
  function shuffled(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function clearDownstream(roundIndex,matchIndex,oldWinner){
    if(!oldWinner||roundIndex>=tournament.rounds.length-1)return;
    const nr=roundIndex+1, nm=Math.floor(matchIndex/2), key=matchIndex%2===0?'p1':'p2', target=tournament.rounds[nr][nm];
    if(target?.[key]===oldWinner){const targetOld=target.winner;target[key]=null;target.s1='';target.s2='';target.winner=null;target.confirmed=false;target.bye=false;clearDownstream(nr,nm,targetOld);}
  }
  function advanceWinner(roundIndex,matchIndex,winner){
    if(roundIndex>=tournament.rounds.length-1)return;
    const nr=roundIndex+1,nm=Math.floor(matchIndex/2),key=matchIndex%2===0?'p1':'p2',target=tournament.rounds[nr][nm];
    if(target[key]!==winner){const old=target.winner;if(old)clearDownstream(nr,nm,old);target[key]=winner;target.s1='';target.s2='';target.winner=null;target.confirmed=false;target.bye=false;}
  }
  function generateBracket(){
    const players=tournament.players;if(players.length<2){toast('Inscreva pelo menos 2 jogadores.');return;}
    const size=nextPow2(players.length), byeCount=size-players.length, ids=shuffled(players.map(p=>p.id));
    const pairs=[];for(let i=0;i<byeCount;i++)pairs.push([ids.shift(),null]);while(ids.length)pairs.push([ids.shift(),ids.shift()||null]);
    const first=shuffled(pairs).map(([p1,p2])=>({p1,p2,s1:'',s2:'',winner:null,confirmed:false,bye:false}));
    const rounds=[first];let matches=first.length/2;while(matches>=1){rounds.push(Array.from({length:matches},()=>({p1:null,p2:null,s1:'',s2:'',winner:null,confirmed:false,bye:false})));matches/=2;}
    tournament.rounds=rounds;
    tournament.thirdPlaceMatch=null;
    first.forEach((m,i)=>{if(m.p1&&!m.p2){m.winner=m.p1;m.confirmed=true;m.bye=true;advanceWinner(0,i,m.p1);}else if(!m.p1&&m.p2){m.winner=m.p2;m.confirmed=true;m.bye=true;advanceWinner(0,i,m.p2);}});
    saveTournament();renderTournament();toast('Chave sorteada. BYEs foram avançados automaticamente.');
  }
  function syncThirdPlaceMatch(){
    if(!tournament.thirdPlaceEnabled||tournament.rounds.length<2){tournament.thirdPlaceMatch=null;return;}
    const semi=tournament.rounds[tournament.rounds.length-2];
    if(!semi||semi.length!==2){tournament.thirdPlaceMatch=null;return;}
    const losers=semi.map(m=>m.confirmed&&m.p1&&m.p2?(m.winner===m.p1?m.p2:m.p1):null);
    if(!losers[0]||!losers[1]){tournament.thirdPlaceMatch=null;return;}
    const old=tournament.thirdPlaceMatch;
    if(old&&old.p1===losers[0]&&old.p2===losers[1])return;
    tournament.thirdPlaceMatch={p1:losers[0],p2:losers[1],s1:'',s2:'',winner:null,confirmed:false,bye:false};
  }
  function confirmTournamentMatch(r,m){
    const match=tournament.rounds[r]?.[m];if(!match||!match.p1||!match.p2){toast('Este confronto ainda não tem dois jogadores.');return;}
    const s1=Number(match.s1),s2=Number(match.s2);if(!Number.isFinite(s1)||!Number.isFinite(s2)||s1<0||s2<0){toast('Digite placares válidos.');return;}if(s1===s2){toast('O confronto precisa ter um vencedor.');return;}
    const old=match.winner,winner=s1>s2?match.p1:match.p2;if(old&&old!==winner)clearDownstream(r,m,old);match.winner=winner;match.confirmed=true;match.bye=false;advanceWinner(r,m,winner);syncThirdPlaceMatch();saveTournament();renderTournament();toast(`${playerById(winner)?.name||'Vencedor'} avançou.`);
  }
  function confirmThirdPlaceMatch(){
    const match=tournament.thirdPlaceMatch;if(!match||!match.p1||!match.p2){toast('A disputa de 3º lugar ainda não está definida.');return;}
    const s1=Number(match.s1),s2=Number(match.s2);if(!Number.isFinite(s1)||!Number.isFinite(s2)||s1<0||s2<0){toast('Digite placares válidos.');return;}if(s1===s2){toast('O confronto precisa ter um vencedor.');return;}
    match.winner=s1>s2?match.p1:match.p2;match.confirmed=true;saveTournament();renderTournament();toast(`${playerById(match.winner)?.name||'Terceiro lugar'} ficou em 3º.`);
  }
  function standings(){
    const stats={};tournament.players.forEach(p=>stats[p.id]={p,j:0,w:0,l:0,pf:0,pa:0});
    const scored=[...tournament.rounds.flat(),...(tournament.thirdPlaceMatch?[tournament.thirdPlaceMatch]:[])];
    scored.forEach(m=>{if(!m.confirmed||m.bye||!m.p1||!m.p2)return;const a=stats[m.p1],b=stats[m.p2];if(!a||!b)return;const s1=Number(m.s1)||0,s2=Number(m.s2)||0;a.j++;b.j++;a.pf+=s1;a.pa+=s2;b.pf+=s2;b.pa+=s1;if(m.winner===m.p1){a.w++;b.l++;}else{b.w++;a.l++;}});
    return Object.values(stats).sort((a,b)=>b.w-a.w||(b.pf-b.pa)-(a.pf-a.pa)||b.pf-a.pf||a.p.name.localeCompare(b.p.name));
  }
  function roundTitle(i,total){if(i===total-1)return'Final';if(i===total-2)return'Semifinal';if(i===total-3)return'Quartas';return`Rodada ${i+1}`;}
  // Status de uma partida da chave: bye / finalizada / em jogo (placar sendo digitado) / pendente / aguardando
  function matchStatus(match,p1,p2){
    if(match.bye)return ['bye','BYE'];
    if(match.confirmed)return ['done','Finalizada'];
    if(!p1||!p2)return ['pending','Aguardando'];
    const typed=v=>v!==''&&v!=null;
    if(typed(match.s1)||typed(match.s2))return ['live','Em jogo'];
    return ['ready','Pendente'];
  }
  function competitorHtml(p,side,match,inputCls,dataAttrs){
    const hasWinner=match.winner!=null&&match.winner!=='';
    const pid=match[side==='s1'?'p1':'p2'];
    const isW=hasWinner&&match.winner===pid;
    const isL=hasWinner&&match.confirmed&&!isW&&!!p;
    const name=escapeHTML(p?.name||'Aguardando…');
    return `<div class="competitor ${isW?'winner':''} ${isL?'loser':''}">${playerAvatar(p,'tiny')}<span title="${name}">${name}</span><input class="${inputCls}" ${dataAttrs} data-side="${side}" type="number" inputmode="numeric" min="0" aria-label="Pontos de ${name}" value="${escapeAttr(match[side])}" ${!match.p1||!match.p2?'disabled':''}></div>`;
  }
  function renderBracketMatch(match,r,m){
    const p1=playerById(match.p1),p2=playerById(match.p2),waiting=!p1||!p2;
    const [st,label]=matchStatus(match,p1,p2);
    const head=`<header class="bm-head"><small>Jogo ${m+1}</small><span class="m-status ${st}">${label}</span></header>`;
    if(match.bye){const w=playerById(match.winner);const wn=escapeHTML(w?.name||'—');return `<article class="bracket-match bye">${head}<div class="competitor winner">${playerAvatar(w,'tiny')}<span title="${wn}">${wn}</span><b class="rep">avança</b></div></article>`;}
    const attrs=`data-r="${r}" data-m="${m}"`;
    return `<article class="bracket-match ${match.confirmed?'decided':''} ${st}">${head}${competitorHtml(p1,'s1',match,'match-score',attrs)}${competitorHtml(p2,'s2',match,'match-score',attrs)}<button class="match-confirm" data-r="${r}" data-m="${m}" ${waiting?'disabled':''}>${match.confirmed?'Atualizar resultado':'Confirmar resultado'}</button></article>`;
  }
  function renderThirdPlaceMatch(match){
    if(!match)return '<div class="empty-state bracket-empty">A disputa será definida quando as duas semifinais terminarem.</div>';
    const p1=playerById(match.p1),p2=playerById(match.p2);
    const [st,label]=matchStatus(match,p1,p2);
    return `<article class="bracket-match third-place ${match.confirmed?'decided':''} ${st}"><header class="bm-head"><small>3º lugar</small><span class="m-status ${st}">${label}</span></header>${competitorHtml(p1,'s1',match,'third-score','')}${competitorHtml(p2,'s2',match,'third-score','')}<button class="match-confirm" id="confirmThirdPlaceBtn">${match.confirmed?'Atualizar resultado':'Confirmar resultado'}</button></article>`;
  }

  // ---------- Bracket: modo chave/lista, zoom controlado (botões, Ctrl+roda, pinça) e indicador de rodadas ----------
  let bracketZoom=Math.min(1.6,Math.max(0.5,+localStorage.getItem('bx_bracket_zoom')||1));
  let bracketMode=localStorage.getItem('bx_bracket_mode')||(matchMedia('(max-width:700px)').matches?'list':'tree');
  let bracketNatural=null; // tamanho natural da chave (sem transform), medido 1x por render
  const bracketEls=()=>({vp:document.getElementById('bracketViewport'),zoom:document.getElementById('bracketZoom'),br:document.getElementById('bracket'),rounds:document.getElementById('bracketRounds'),out:document.getElementById('bracketZoomOut')});
  function applyBracketLayout(){
    const {vp,zoom,br,rounds,out}=bracketEls(); if(!vp||!br||!zoom)return;
    const list=bracketMode==='list';
    vp.classList.toggle('list',list);
    const modeBtn=document.getElementById('bracketModeBtn'); if(modeBtn)modeBtn.textContent=list?'Ver como chave':'Ver como lista';
    const zoomCtl=document.getElementById('bracketZoomCtl'); if(zoomCtl)zoomCtl.hidden=list;
    vp.classList.remove('zoomed'); br.style.transform=''; zoom.style.width=''; zoom.style.height='';
    if(!list&&tournament.rounds.length&&Math.abs(bracketZoom-1)>0.01){
      vp.classList.add('zoomed'); // .bracket vira absolute + width:max-content
      if(!bracketNatural)bracketNatural={W:br.scrollWidth,H:br.scrollHeight};
      br.style.transform=`scale(${bracketZoom})`;
      zoom.style.width=`${Math.ceil(bracketNatural.W*bracketZoom)}px`; zoom.style.height=`${Math.ceil(bracketNatural.H*bracketZoom)}px`;
    }
    if(out)out.value=`${Math.round(bracketZoom*100)}%`;
    if(rounds){
      const secs=[...br.querySelectorAll('.bracket-round')];
      rounds.innerHTML=secs.map((s,i)=>`<button type="button" data-round="${i}" class="${i===0?'active':''}">${escapeHTML(s.querySelector('h3')?.textContent||`Rodada ${i+1}`)}</button>`).join('');
      rounds.hidden=secs.length<2;
      rounds.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
        const sec=secs[+b.dataset.round]; if(!sec)return;
        if(bracketMode==='list')window.scrollTo({top:sec.getBoundingClientRect().top+window.scrollY-130,behavior:'smooth'});
        else vp.scrollTo({left:sec.offsetLeft*bracketZoom-14,behavior:'smooth'});
      }));
      updateBracketRoundIndicator();
    }
  }
  function updateBracketRoundIndicator(){
    const {vp,br,rounds}=bracketEls(); if(!vp||!br||!rounds||rounds.hidden)return;
    const secs=[...br.querySelectorAll('.bracket-round')]; if(!secs.length)return;
    let idx=0;
    if(bracketMode==='list'){secs.forEach((s,i)=>{if(s.getBoundingClientRect().top<=150)idx=i;});}
    else{const x=vp.scrollLeft+vp.clientWidth*0.35;secs.forEach((s,i)=>{if(s.offsetLeft*bracketZoom<=x)idx=i;});}
    rounds.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===idx));
  }
  function setBracketZoom(z,{persist=true}={}){
    bracketZoom=Math.min(1.6,Math.max(0.5,Math.round(z*100)/100));
    if(persist)localStorage.setItem('bx_bracket_zoom',String(bracketZoom));
    applyBracketLayout();
  }
  (function initBracketTools(){
    const {vp}=bracketEls(); if(!vp)return;
    document.getElementById('bracketModeBtn')?.addEventListener('click',()=>{bracketMode=bracketMode==='list'?'tree':'list';localStorage.setItem('bx_bracket_mode',bracketMode);applyBracketLayout();});
    document.getElementById('bracketZoomIn')?.addEventListener('click',()=>setBracketZoom(bracketZoom+0.1));
    document.getElementById('bracketZoomOutBtn')?.addEventListener('click',()=>setBracketZoom(bracketZoom-0.1));
    document.getElementById('bracketZoomReset')?.addEventListener('click',()=>setBracketZoom(1));
    let raf=0; const tick=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(updateBracketRoundIndicator);};
    vp.addEventListener('scroll',tick,{passive:true});
    window.addEventListener('scroll',()=>{if(bracketMode==='list'&&document.getElementById('view-tournament')?.classList.contains('active'))tick();},{passive:true});
    // Ctrl+roda do mouse = zoom só do bracket
    vp.addEventListener('wheel',e=>{if(!e.ctrlKey||bracketMode==='list')return;e.preventDefault();setBracketZoom(bracketZoom+(e.deltaY<0?0.1:-0.1));},{passive:false});
    // Pinça com dois dedos dentro do bracket (a página em si não dá zoom)
    let pinch=null; const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    vp.addEventListener('touchstart',e=>{if(e.touches.length===2&&bracketMode!=='list'){e.preventDefault();pinch={d:dist(e.touches),z:bracketZoom};}},{passive:false});
    vp.addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){e.preventDefault();setBracketZoom(pinch.z*dist(e.touches)/pinch.d,{persist:false});}},{passive:false});
    vp.addEventListener('touchend',()=>{if(pinch){pinch=null;setBracketZoom(bracketZoom);}});
    let rz=0; window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{bracketNatural=null;if(document.getElementById('view-tournament')?.classList.contains('active'))applyBracketLayout();},150);});
  })();
  function renderTournament(){
    const maxInput=document.getElementById('tournamentMaxPlayers');if(!maxInput)return;maxInput.value=tournament.maxPlayers||8;
    const thirdToggle=document.getElementById('tournamentThirdPlace');if(thirdToggle)thirdToggle.checked=!!tournament.thirdPlaceEnabled;
    document.getElementById('registrationCount').textContent=`${tournament.players.length}/${tournament.maxPlayers||8}`;
    const list=document.getElementById('playerList');list.innerHTML=tournament.players.length?tournament.players.map((p,i)=>`<article class="player-card">${playerAvatar(p)}<div><small>#${i+1}</small><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.deck||'Deck não informado').replace(/\n/g,'<br>')}</p></div><button class="icon-btn remove-player" data-id="${p.id}" title="Remover">×</button></article>`).join(''):'<div class="empty-state">Nenhum jogador inscrito.</div>';
    list.querySelectorAll('.remove-player').forEach(b=>b.addEventListener('click',()=>{tournament.players=tournament.players.filter(p=>p.id!==b.dataset.id);tournament.rounds=[];tournament.thirdPlaceMatch=null;saveTournament();renderTournament();toast('Jogador removido; a chave foi limpa.');}));
    const rows=standings();document.getElementById('standingsBody').innerHTML=rows.length?rows.map((x,i)=>`<tr><td>${i+1}</td><td><span class="standing-player">${playerAvatar(x.p,'tiny')}${escapeHTML(x.p.name)}</span></td><td>${x.j}</td><td>${x.w}</td><td>${x.l}</td><td>${x.pf}</td><td>${x.pa}</td><td>${x.pf-x.pa>0?'+':''}${x.pf-x.pa}</td></tr>`).join(''):'<tr><td colspan="8">Sem resultados ainda.</td></tr>';
    const bracket=document.getElementById('bracket');
    const mainBracket=tournament.rounds.length?tournament.rounds.map((round,r)=>{
      const isFinal=r===tournament.rounds.length-1;
      const thirdNested=isFinal&&tournament.thirdPlaceEnabled?`<div class="third-place-nested"><div class="third-place-nested-title"><span>${BX.ic('medal', 14)}</span><b>Disputa de 3º lugar</b></div>${renderThirdPlaceMatch(tournament.thirdPlaceMatch)}</div>`:'';
      return `<section class="bracket-round ${isFinal?'final-round':''}"><h3>${roundTitle(r,tournament.rounds.length)}</h3><div class="round-matches">${round.map((m,i)=>renderBracketMatch(m,r,i)).join('')}${thirdNested}</div></section>`;
    }).join(''):'<div class="empty-state bracket-empty">Inscreva jogadores e clique em “Gerar / sortear chave”.</div>';
    bracket.innerHTML=mainBracket; bracketNatural=null; applyBracketLayout();
    bracket.querySelectorAll('.match-score').forEach(inp=>inp.addEventListener('input',()=>{const m=tournament.rounds[+inp.dataset.r][+inp.dataset.m];m[inp.dataset.side]=inp.value;saveTournament();}));
    bracket.querySelectorAll('.match-confirm[data-r]').forEach(b=>b.addEventListener('click',()=>confirmTournamentMatch(+b.dataset.r,+b.dataset.m)));
    bracket.querySelectorAll('.third-score').forEach(inp=>inp.addEventListener('input',()=>{if(tournament.thirdPlaceMatch){tournament.thirdPlaceMatch[inp.dataset.side]=inp.value;saveTournament();}}));
    document.getElementById('confirmThirdPlaceBtn')?.addEventListener('click',confirmThirdPlaceMatch);
    const final=tournament.rounds.at(-1)?.[0],champ=final?.confirmed?playerById(final.winner):null;document.getElementById('tournamentChampion').innerHTML=champ?`${BX.ic('trophy', 14)} ${escapeHTML(champ.name)}`:'';
    const third=tournament.thirdPlaceMatch?.confirmed?playerById(tournament.thirdPlaceMatch.winner):null;const thirdChip=document.getElementById('tournamentThirdPlaceResult');if(thirdChip)thirdChip.innerHTML=third?`${BX.ic('medal', 14)} ${escapeHTML(third.name)}`:'';
  }
  function addTournamentPlayer(){
    const name=document.getElementById('playerNameInput').value.trim(),deckText=document.getElementById('playerDeckInput').value.trim();if(!name){toast('Digite o nome do jogador.');return;}if(tournament.players.length>=(tournament.maxPlayers||8)){toast('O limite configurado de jogadores foi atingido.');return;}
    tournament.players.push({id:`p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,photo:pendingPlayerPhoto,deck:deckText});tournament.rounds=[];tournament.thirdPlaceMatch=null;pendingPlayerPhoto='';document.getElementById('playerNameInput').value='';document.getElementById('playerDeckInput').value='';document.getElementById('playerPhotoInput').value='';document.getElementById('playerPhotoPreview').innerHTML='<span>+</span>';saveTournament();renderTournament();toast(`${name} inscrito.`);
  }
  function handlePlayerPhoto(file){
    if(!file)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas'),size=160;c.width=size;c.height=size;const ctx=c.getContext('2d'),scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);pendingPlayerPhoto=c.toDataURL('image/jpeg',.82);document.getElementById('playerPhotoPreview').innerHTML=`<img src="${pendingPlayerPhoto}" alt="Prévia">`;};img.src=reader.result;};reader.readAsDataURL(file);
  }

  function renderHeader() {
    const el=document.getElementById('headerStatus'); if(!el)return;
    const v=validateDeck();
    const distinct=Object.keys(inventory).filter(id=>PARTS[id]&&!PARTS[id].parentId).length;
    el.innerHTML=`<span><strong>${distinct}</strong> peças • <strong>${v.complete}/3</strong> no deck</span>`;
  }

  // =====================================================================================
  // Builder UI v2 — camada de interação. As regras (validateDeck/validateSlot/availableParts/
  // buildSlotWith/applyPartToSlot/saveState) continuam as mesmas; aqui só muda como o usuário
  // escolhe e encaixa peças: slots visuais, paginação no celular, bottom sheet filtrado,
  // arrastar e soltar no desktop, desfazer, favoritas/recentes, prévia e atalhos.
  // =====================================================================================
  const SLOT_LABEL={blade:'Blade',integrated:'Integrated Blade',lock:'Lock Chip',main:'Main Blade',assist:'Assist Blade',over:'Over Blade',ratchet:'Ratchet',bit:'Bit',rib:'Ratchet + Bit'};
  const MODE_LABEL={standard:'Blade + Ratchet + Bit',cx:'CX Custom Line',cxrib:'CX + Ratchet-Integrated Bit',integrated:'Ratchet-integrated Blade'};
  const isMobileBuilder=()=>window.matchMedia('(max-width: 820px)').matches;

  /** Slots que a estrutura atual do Bey pede (mesma regra de isComplete/slotParts). */
  function slotDefs(slot){
    const isCX=slot.mode==='cx'||slot.mode==='cxrib';
    const d=[];
    if(slot.mode==='standard')d.push({field:'blade',kind:'blade'});
    if(slot.mode==='integrated')d.push({field:'blade',kind:'integrated'});
    if(isCX){
      d.push({field:'lock',kind:'lock'},{field:'main',kind:'main'});
      if(PARTS[slot.main]?.requiresOver||slot.over)d.push({field:'over',kind:'over'});
      d.push({field:'assist',kind:'assist'});
    }
    if(slot.mode==='cxrib')d.push({field:'rib',kind:'rib'});
    else{ if(slot.mode!=='integrated')d.push({field:'ratchet',kind:'ratchet'}); d.push({field:'bit',kind:'bit'}); }
    return d.map(x=>({...x,label:SLOT_LABEL[x.kind]}));
  }
  /** Em qual outro Bey a peça já está (regra de não repetição). -1 se livre. */
  function usedInOtherBey(partId,beyIdx,ignoreBey=-1){
    const p=PARTS[partId]; if(!p||p.basicLock)return -1;
    return deck.findIndex((s,j)=>j!==beyIdx&&j!==ignoreBey&&slotParts(s).includes(partId));
  }
  function blockReason(p,beyIdx,ignoreBey=-1){
    const j=usedInOtherBey(p.id,beyIdx,ignoreBey);
    if(j>=0)return `${p.display} já está no Bey ${j+1}`;
    if(!builderShowAll){
      const used=currentUsage(beyIdx); const left=(inventory[p.id]||0)-(used[p.id]||0);
      if(left<=0)return `Sem cópia livre de ${p.display} na sua coleção`;
    }
    return '';
  }
  function fieldForKind(slot,kind){ return slotDefs(buildSlotWith(slot,{id:'__probe',kind})).find(d=>d.kind===kind)?.field||null; }

  // ---- Desfazer (últimos 10 passos) ----
  function trackUndo(serialized){
    if(undoSkip||serialized===lastSavedDeck){lastSavedDeck=serialized;return;}
    undoStack.push(lastSavedDeck); if(undoStack.length>10)undoStack.shift();
    lastSavedDeck=serialized; syncUndoButtons();
  }
  function undoDeck(){
    if(!undoStack.length){toast('Nada para desfazer.');return;}
    deck=JSON.parse(undoStack.pop()); undoSkip=true; saveState(); undoSkip=false;
    syncUndoButtons(); renderAll(); toast('Desfeito.');
  }
  function syncUndoButtons(){ document.querySelectorAll('[data-undo]').forEach(b=>{b.disabled=!undoStack.length;}); }

  // ---- Favoritas e recentes ----
  const favParts=new Set(loadJSON('bx_fav_parts',[]));
  let recentParts=loadJSON('bx_recent_parts',[]);
  function toggleFav(id){ if(favParts.has(id))favParts.delete(id); else favParts.add(id); localStorage.setItem('bx_fav_parts',JSON.stringify([...favParts])); }
  function pushRecent(id){ recentParts=[id,...recentParts.filter(x=>x!==id)].slice(0,14); localStorage.setItem('bx_recent_parts',JSON.stringify(recentParts)); }
  const parentOf=(id)=>{const p=PARTS[id];return p?(p.parentId?PARTS[p.parentId]||p:p):null;};

  // ---- Som leve ao encaixar ----
  let sfxOn=localStorage.getItem('bx_sfx')!=='0'; let sfxCtx=null;
  function sfx(kind='place'){
    if(!sfxOn)return;
    try{
      sfxCtx=sfxCtx||new (window.AudioContext||window.webkitAudioContext)();
      const t=sfxCtx.currentTime,o=sfxCtx.createOscillator(),g=sfxCtx.createGain();
      o.type='sine';
      if(kind==='remove'){o.frequency.setValueAtTime(520,t);o.frequency.exponentialRampToValueAtTime(300,t+.09);}
      else{o.frequency.setValueAtTime(760,t);o.frequency.exponentialRampToValueAtTime(1180,t+.07);}
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.14);
      o.connect(g).connect(sfxCtx.destination);o.start(t);o.stop(t+.15);
    }catch{}
  }
  function syncSfxBtn(){ const b=document.getElementById('sfxBtn'); if(b){b.innerHTML=BX.ic(sfxOn?'megaphone':'ban',13); b.title=sfxOn?'Som ao encaixar peça: ligado':'Som ao encaixar peça: desligado'; b.classList.toggle('off',!sfxOn);} }

  // ---- Colocar / remover peças (sempre via buildSlotWith / applyPartToSlot) ----
  let lastPlaced=null; // {bey, field} para a micro-animação
  let panelTarget=null; // slot esperando peça do painel lateral (desktop)
  function placePart(p,bey){
    const reason=blockReason(p,bey); if(reason){toast(reason);return false;}
    const field=fieldForKind(deck[bey],p.kind);
    lastPlaced={bey,field}; panelTarget=null;
    applyPartToSlot(p,bey); pushRecent(p.parentId||p.id); sfx('place');
    return true;
  }
  function clearField(bey,field){
    if(!deck[bey][field])return;
    deck[bey][field]=''; if(field==='main')deck[bey].over='';
    saveState(); sfx('remove'); renderAll();
  }
  /** Primeiro slot compatível vazio no deck (clique no painel sem alvo). */
  function firstEmptyFor(kind){
    for(let i=0;i<deck.length;i++){ const d=slotDefs(deck[i]).find(x=>x.kind===kind); if(d&&!deck[i][d.field])return i; }
    return -1;
  }
  /** Clique numa peça do painel lateral: alvo marcado > primeiro slot compatível vazio > Bey ativo. */
  async function placeFromPanel(p){
    const c=await chooseColor(p); if(!c)return;
    let bey;
    if(panelTarget&&panelTarget.kind===c.kind)bey=panelTarget.bey;
    else { const e=firstEmptyFor(c.kind); bey=e>=0?e:activeSlot; }
    if(placePart(c,bey))toast(`${c.display}${c.colorLabel?` (${c.colorLabel})`:''} → Bey ${bey+1}${(inventory[c.id]||0)?'':' (fora da sua coleção)'}`);
  }
  /** Troca/move entre slots compatíveis de Beys diferentes. */
  function swapSlots(from,to){
    if(from.bey===to.bey&&from.field===to.field)return;
    const pa=PARTS[deck[from.bey][from.field]]; if(!pa)return;
    const pbId=deck[to.bey][to.field]; const pb=pbId?PARTS[pbId]:null;
    const r1=usedInOtherBey(pa.id,to.bey,from.bey); if(r1>=0){toast(`${pa.display} já está no Bey ${r1+1}.`);return;}
    if(pb){const r2=usedInOtherBey(pb.id,from.bey,to.bey); if(r2>=0){toast(`${pb.display} já está no Bey ${r2+1}.`);return;}}
    const oldFrom=clone(deck[from.bey]);
    deck[to.bey]=buildSlotWith(deck[to.bey],pa);
    if(pb)deck[from.bey]=buildSlotWith(oldFrom,pb); else { deck[from.bey][from.field]=''; if(from.field==='main')deck[from.bey].over=''; }
    lastPlaced={bey:to.bey,field:to.field};
    saveState(); sfx('place'); renderAll();
    toast(pb?`${pa.display} ↔ ${pb.display} trocados.`:`${pa.display} movido para o Bey ${to.bey+1}.`);
  }
  function duplicateStructure(i){
    const j=deck.findIndex((s,k)=>k!==i&&!slotParts(s).length);
    if(j<0){toast('Não há Bey vazio para receber a estrutura.');return;}
    deck[j]=emptySlot(); deck[j].mode=deck[i].mode; saveState(); renderAll();
    toast(`Estrutura "${MODE_LABEL[deck[i].mode]}" copiada para o Bey ${j+1}.`);
  }

  // ---- Prévia da peça (hover no desktop, segurar no celular) ----
  let previewTimer=null;
  function partPreviewHtml(p){
    const s=p.stats||{}; const has=s.atk!=null||s.def!=null||s.sta!=null;
    const owned=inventory[p.id]||0;
    const type=p.type||(has?inferType(s):'');
    return `<div class="pp-top">${partArt(p,'pp')}<div><b>${escapeHTML(p.display)}</b><small>${escapeHTML(KIND_LABEL[p.kind]||p.kind)}${type?` · ${escapeHTML(type)}`:''}</small>${p.abbrev&&p.abbrev!==p.display?`<small>abrev. ${escapeHTML(p.abbrev)}</small>`:''}</div></div>
      ${has?`<div class="pp-stats">${[['ATK',s.atk],['DEF',s.def],['STA',s.sta],['DASH',s.dash],['BRST',s.burst]].filter(([,v])=>v!=null&&v!=='').map(([l,v])=>`<span><i>${l}</i><b>${escapeHTML(String(v))}</b></span>`).join('')}</div>`:''}
      <div class="pp-foot">${owned?`${BX.ic('check',12)} você tem ×${owned}`:`${BX.ic('backpack',12)} fora da sua coleção`}${p.banned?` · <em>banida (WBO)</em>`:''}${favParts.has(p.parentId||p.id)?` · ${BX.ic('star',12)} favorita`:''}</div>`;
  }
  function showPreview(p,anchor){
    const el=document.getElementById('partPreview'); if(!el||!p)return;
    el.innerHTML=partPreviewHtml(p); el.hidden=false; hydrateImages(el);
    const r=anchor.getBoundingClientRect(); const w=el.offsetWidth||260,h=el.offsetHeight||140;
    let x=r.right+10,y=r.top;
    if(x+w>window.innerWidth-8)x=r.left-w-10; if(x<8)x=Math.max(8,Math.min(r.left,window.innerWidth-w-8));
    if(y+h>window.innerHeight-8)y=window.innerHeight-h-8; if(y<8)y=8;
    el.style.left=`${x}px`; el.style.top=`${y}px`;
  }
  function hidePreview(){ clearTimeout(previewTimer); const el=document.getElementById('partPreview'); if(el)el.hidden=true; }
  function bindPreview(root,selector,getPart){
    root.querySelectorAll(selector).forEach(el=>{
      if(el.dataset.pv)return; el.dataset.pv='1';
      el.addEventListener('mouseenter',()=>{ if(isMobileBuilder())return; clearTimeout(previewTimer); previewTimer=setTimeout(()=>{const p=getPart(el); if(p)showPreview(p,el);},380); });
      el.addEventListener('mouseleave',hidePreview);
      // segurar no celular
      let t=null;
      el.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse')return; t=setTimeout(()=>{const p=getPart(el); if(p){showPreview(p,el); el.dataset.held='1';}},450); },{passive:true});
      const end=()=>{clearTimeout(t); if(el.dataset.held){delete el.dataset.held; setTimeout(hidePreview,900);}};
      el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end); el.addEventListener('pointerleave',end);
      el.addEventListener('touchmove',()=>clearTimeout(t),{passive:true});
    });
  }

  // ---- Bottom sheet: seletor filtrado por tipo (celular; Enter no desktop também abre) ----
  let sheetTarget=null; // {bey, field, kind}
  function sheetItems(kind,bey){
    const used=currentUsage(bey);
    let items=PARENTS().filter(p=>p.kind===kind&&(builderShowAll||(inventory[p.id]||0)>0));
    const q=equivalentKey(document.getElementById('sheetSearch')?.value||'');
    if(q)items=items.filter(p=>[p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>x&&equivalentKey(x).includes(q)));
    items.sort((a,b)=>(favParts.has(b.id)-favParts.has(a.id))||(((inventory[b.id]||0)>0)-((inventory[a.id]||0)>0))||a.display.localeCompare(b.display));
    return items.map(p=>{
      const owned=inventory[p.id]||0;
      const other=usedInOtherBey(p.id,bey);
      const left=owned-(used[p.id]||0);
      const disabled=other>=0||(!builderShowAll&&left<=0);
      const why=other>=0?`em Bey ${other+1}`:(!builderShowAll&&left<=0?'sem cópia livre':'');
      return {p,owned,disabled,why,current:deck[bey][sheetTarget?.field||'']===p.id};
    });
  }
  function sheetItemHtml({p,owned,disabled,why,current}){
    return `<button type="button" class="sh-item ${disabled?'disabled':''} ${current?'current':''}" data-part="${escapeAttr(p.id)}" ${disabled?'data-disabled="1"':''} title="${escapeAttr(p.display)}">
      ${partArt(p,'sh')}
      <span class="sh-txt"><b>${escapeHTML(p.display)}</b><small>${p.abbrev&&p.abbrev!==p.display?escapeHTML(p.abbrev)+' · ':''}${builderShowAll?(owned?`${BX.ic('check',11)} na coleção${owned>1?` ×${owned}`:''}`:`${BX.ic('backpack',11)} não tenho`):`×${owned} na coleção`}${p.banned?' · <em>banida</em>':''}</small></span>
      ${why?`<span class="sh-why">${escapeHTML(why)}</span>`:current?`<span class="sh-why cur">${BX.ic('check',12)} atual</span>`:''}
      <i class="sh-fav ${favParts.has(p.id)?'on':''}" data-fav="${escapeAttr(p.id)}" title="Favoritar">${BX.ic('star',14)}</i>
    </button>`;
  }
  function renderSheet(){
    if(!sheetTarget)return;
    const {bey,kind}=sheetTarget;
    const list=document.getElementById('sheetList'), quick=document.getElementById('sheetQuick');
    const items=sheetItems(kind,bey);
    const byId=new Map(items.map(x=>[x.p.id,x]));
    const favs=[...favParts].map(id=>byId.get(id)).filter(Boolean);
    const rec=recentParts.map(id=>byId.get(id)).filter(x=>x&&!favParts.has(x.p.id)).slice(0,8);
    const chip=(x,cls='')=>`<button type="button" class="sh-chip ${cls} ${x.disabled?'disabled':''}" data-part="${escapeAttr(x.p.id)}" ${x.disabled?'data-disabled="1"':''} title="${escapeAttr(x.p.display)}${x.why?' — '+escapeAttr(x.why):''}">${partArt(x.p,'chip')}<span>${escapeHTML(x.p.abbrev||x.p.display)}</span></button>`;
    quick.innerHTML=(favs.length?`<div class="sh-row"><small>${BX.ic('star',11)} Favoritas</small><div>${favs.map(x=>chip(x,'fav')).join('')}</div></div>`:'')
      +(rec.length?`<div class="sh-row"><small>${BX.ic('clock',11)} Recentes</small><div>${rec.map(x=>chip(x)).join('')}</div></div>`:'');
    list.innerHTML=items.slice(0,220).map(sheetItemHtml).join('')||`<div class="empty-state">Nenhuma peça desse tipo${builderShowAll?'':' na sua coleção'}.</div>`;
    document.getElementById('sheetCount').textContent=`${items.length} peça(s)`;
    hydrateImages(quick); hydrateImages(list);
    bindPreview(list,'.sh-item',el=>PARTS[el.dataset.part]);
  }
  function openSheet(bey,field,kind){
    sheetTarget={bey,field,kind};
    const sh=document.getElementById('slotSheet'); if(!sh)return;
    document.getElementById('sheetEyebrow').textContent=`BEY ${bey+1} · ${(MODE_LABEL[deck[bey].mode]||'').toUpperCase()}`;
    document.getElementById('sheetTitle').textContent=`Escolher ${SLOT_LABEL[kind]||kind}`;
    const s=document.getElementById('sheetSearch'); s.value=''; s.placeholder=`Buscar ${KIND_LABEL[kind]?.toLowerCase()||'peça'}…`;
    sh.hidden=false; document.body.classList.add('sheet-open');
    renderSheet();
    if(!isMobileBuilder())setTimeout(()=>s.focus(),50);
  }
  function closeSheet(){ const sh=document.getElementById('slotSheet'); if(sh&&!sh.hidden){sh.hidden=true;} document.body.classList.remove('sheet-open'); sheetTarget=null; hidePreview(); }
  async function pickFromSheet(id){
    const p=PARTS[id]; if(!p||!sheetTarget)return;
    const {bey}=sheetTarget;
    const c=await chooseColor(p); if(!c)return;
    if(placePart(c,bey)){ closeSheet(); toast(`${c.display}${c.colorLabel?` (${c.colorLabel})`:''} → Bey ${bey+1}`); }
  }
  (function bindSheet(){
    const sh=document.getElementById('slotSheet'); if(!sh)return;
    sh.addEventListener('click',e=>{
      if(e.target===sh){closeSheet();return;}
      const fav=e.target.closest('[data-fav]'); if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);renderSheet();renderPicker();return;}
      const it=e.target.closest('[data-part]'); if(!it)return;
      if(it.dataset.disabled){toast(it.querySelector('.sh-why')?.textContent||it.title||'Peça indisponível para este Bey.');return;}
      pickFromSheet(it.dataset.part);
    });
    document.getElementById('sheetClose')?.addEventListener('click',closeSheet);
    document.getElementById('sheetSearch')?.addEventListener('input',renderSheet);
    // arrastar o "grip" para baixo fecha
    let y0=null; const grip=sh.querySelector('.sheet-head');
    grip?.addEventListener('touchstart',e=>{y0=e.touches[0].clientY;},{passive:true});
    grip?.addEventListener('touchmove',e=>{ if(y0!=null&&e.touches[0].clientY-y0>70){y0=null;closeSheet();} },{passive:true});
  })();

  // ---- Menu de ações do slot (segurar no celular): mover para outro Bey / remover ----
  function openSlotActions(bey,field,anchor){
    const id=deck[bey][field]; const p=PARTS[id]; if(!p)return;
    const menu=document.getElementById('slotActions'); if(!menu)return;
    const kind=slotDefs(deck[bey]).find(d=>d.field===field)?.kind;
    const moves=deck.map((s,j)=>{ if(j===bey)return ''; const f=slotDefs(s).find(d=>d.kind===kind)?.field||null; const occ=f&&s[f]?PARTS[s[f]]:null; const blocked=!f||usedInOtherBey(id,j,bey)>=0; if(!f)return `<button type="button" disabled title="A estrutura do Bey ${j+1} não tem slot de ${escapeAttr(SLOT_LABEL[kind]||kind)}">${BX.ic('share',14)}Bey ${j+1}: estrutura sem ${escapeHTML(SLOT_LABEL[kind]||kind)}</button>`; return `<button type="button" data-move="${j}" ${blocked?'disabled':''}>${BX.ic('share',14)}${occ?`Trocar com ${escapeHTML(occ.display)} (Bey ${j+1})`:`Mover para o Bey ${j+1}`}</button>`; }).join('');
    menu.innerHTML=`<div class="sa-head">${partArt(p,'chip')}<div><b>${escapeHTML(p.display)}</b><small>Bey ${bey+1} · ${escapeHTML(SLOT_LABEL[kind]||field)}</small></div></div>${moves}<button type="button" data-preview>${BX.ic('eye',14)}Ver detalhes</button><button type="button" data-remove class="danger">${BX.ic('trash',14)}Remover do Bey</button>`;
    menu.hidden=false; hydrateImages(menu);
    const r=anchor.getBoundingClientRect(); const w=menu.offsetWidth||240,h=menu.offsetHeight||160;
    let x=r.left+r.width/2-w/2,y=r.bottom+8; x=Math.max(8,Math.min(x,window.innerWidth-w-8)); if(y+h>window.innerHeight-8)y=Math.max(8,r.top-h-8);
    menu.style.left=`${x}px`; menu.style.top=`${y}px`;
    const close=()=>{menu.hidden=true;document.removeEventListener('pointerdown',off,true);};
    const off=(e)=>{ if(!menu.contains(e.target))close(); };
    setTimeout(()=>document.addEventListener('pointerdown',off,true),0);
    menu.onclick=(e)=>{
      const mv=e.target.closest('[data-move]'); if(mv){close(); const j=+mv.dataset.move; const f=slotDefs(deck[j]).find(d=>d.kind===kind)?.field; if(f)swapSlots({bey,field},{bey:j,field:f}); return;}
      if(e.target.closest('[data-remove]')){close(); clearField(bey,field); toast(`${p.display} removido do Bey ${bey+1}.`); return;}
      if(e.target.closest('[data-preview]')){close(); showPreview(p,anchor); setTimeout(hidePreview,2500); }
    };
  }

  // ---- Arrastar e soltar (desktop) ----
  let dragPart=null, dragFrom=null;
  function dragStartPart(p,from=null){
    dragPart=p; dragFrom=from;
    document.body.classList.add('bx-dragging');
    document.querySelectorAll('#deckGrid .slot').forEach(s=>{ s.classList.toggle('compat',s.dataset.kind===p.kind&&!(from&&+s.dataset.bey===from.bey&&s.dataset.field===from.field)); });
  }
  function dragEndPart(){
    dragPart=null; dragFrom=null; document.body.classList.remove('bx-dragging');
    document.querySelectorAll('#deckGrid .slot').forEach(s=>{s.classList.remove('compat','over','deny'); const t=s.querySelector('.slot-tip'); if(t)t.textContent='';});
  }
  function bindSlotDnD(grid){
    grid.querySelectorAll('.slot').forEach(sl=>{
      const bey=+sl.dataset.bey, field=sl.dataset.field, kind=sl.dataset.kind;
      if(sl.classList.contains('filled')){
        sl.setAttribute('draggable','true');
        sl.addEventListener('dragstart',e=>{ const p=PARTS[deck[bey][field]]; if(!p){e.preventDefault();return;} e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',p.id); dragStartPart(p,{bey,field}); sl.classList.add('dragging'); });
        sl.addEventListener('dragend',()=>{sl.classList.remove('dragging');dragEndPart();});
      }
      sl.addEventListener('dragover',e=>{
        if(!dragPart||dragPart.kind!==kind)return;
        if(dragFrom&&dragFrom.bey===bey&&dragFrom.field===field)return;
        e.preventDefault();
        let reason='';
        if(dragFrom){ const r=usedInOtherBey(dragPart.id,bey,dragFrom.bey); if(r>=0)reason=`${dragPart.display} já está no Bey ${r+1}`; const pbId=deck[bey][field]; if(!reason&&pbId){const r2=usedInOtherBey(pbId,dragFrom.bey,bey); if(r2>=0)reason=`${PARTS[pbId]?.display} já está no Bey ${r2+1}`;} }
        else reason=blockReason(dragPart,bey);
        sl.classList.toggle('deny',!!reason); sl.classList.toggle('over',!reason);
        e.dataTransfer.dropEffect=reason?'none':(dragFrom?'move':'copy');
        const tip=sl.querySelector('.slot-tip'); if(tip)tip.textContent=reason||(deck[bey][field]?(dragFrom?'Soltar para trocar':'Soltar para substituir'):'Soltar aqui');
      });
      sl.addEventListener('dragleave',()=>{sl.classList.remove('over','deny'); const t=sl.querySelector('.slot-tip'); if(t)t.textContent='';});
      sl.addEventListener('drop',e=>{
        if(!dragPart||dragPart.kind!==kind)return; e.preventDefault();
        const denied=sl.classList.contains('deny'); const tip=sl.querySelector('.slot-tip')?.textContent;
        const p=dragPart, from=dragFrom; dragEndPart();
        if(denied){toast(tip||'Não dá para soltar aqui.');return;}
        if(from){swapSlots(from,{bey,field});return;}
        chooseColor(p).then(c=>{ if(!c)return; if(placePart(c,bey))toast(`${c.display} → Bey ${bey+1}`); });
      });
    });
  }

  // ---- Paginação (celular) e barra de resumo ----
  function goToBey(i,smooth=true){
    i=Math.max(0,Math.min(2,i)); setActiveSlot(i);
    const grid=document.getElementById('deckGrid'); if(!grid)return;
    if(isMobileBuilder()){ const card=grid.children[i]; if(card){ const left=card.offsetLeft-grid.offsetLeft; grid.scrollTo({left,behavior:smooth?'smooth':'auto'}); if(smooth)setTimeout(()=>{ if(Math.abs(grid.scrollLeft-left)>8)grid.scrollTo({left,behavior:'auto'}); },420); } }
    else grid.querySelector(`.bey-card[data-deck-slot="${i}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
    syncPager();
  }
  function syncPager(){
    const t=document.getElementById('pagerTitle'); if(t)t.textContent=`Bey ${activeSlot+1}`;
    document.querySelectorAll('#pagerDots i').forEach((d,k)=>d.classList.toggle('on',k===activeSlot));
    document.querySelectorAll('#deckBar .db-bey').forEach((b,k)=>b.classList.toggle('active',k===activeSlot));
    const prev=document.querySelector('#beyPager [data-pg="-1"]'),next=document.querySelector('#beyPager [data-pg="1"]');
    if(prev)prev.disabled=activeSlot===0; if(next)next.disabled=activeSlot===2;
  }
  function renderDeckBar(v){
    const bar=document.getElementById('deckBar'); if(!bar)return;
    const beys=deck.map((slot,i)=>{
      const parts=slotParts(slot).map(id=>PARTS[id]).filter(Boolean);
      const inv=validateSlot(slot,i);
      const st=isComplete(slot)?(inv.length?'bad':'ok'):(parts.length?'part':'empty');
      const dots=parts.slice(0,4).map(p=>partArt(p,'dot')).join('')||`<span class="db-empty">${BX.ic('plus',12)}</span>`;
      return `<button type="button" class="db-bey ${st} ${i===activeSlot?'active':''}" data-bey="${i}" title="Ir para o Bey ${i+1}"><span class="db-parts">${dots}</span><small>Bey ${i+1}</small></button>`;
    }).join('');
    const cls=v.legal?'good':v.errors.length?'bad':'neutral';
    const txt=v.legal?`${BX.ic('check',13)} Deck legal`:v.errors.length?`${BX.ic('x',13)} ${v.errors[0]}`:`${v.complete}/3 Beys prontos${v.info.length?` · ${v.info.find(x=>/incompleto/.test(x))||''}`:''}`;
    bar.innerHTML=`<div class="db-beys">${beys}</div><div class="db-status ${cls}">${txt}</div><button type="button" class="db-undo" data-undo title="Desfazer (últimos 10 passos)" ${undoStack.length?'':'disabled'}>${BX.ic('rotate',15)}</button>`;
    hydrateImages(bar);
    document.getElementById('pagerDots').innerHTML=[0,1,2].map(k=>`<i class="${k===activeSlot?'on':''}"></i>`).join('');
  }
  (function bindPager(){
    const grid=document.getElementById('deckGrid'); if(!grid)return;
    let st=null;
    const syncFromScroll=()=>{ if(!isMobileBuilder())return; const gl=grid.getBoundingClientRect().left; let best=0,bd=1e9; [...grid.children].forEach((c,k)=>{const d=Math.abs(c.getBoundingClientRect().left-gl); if(d<bd){bd=d;best=k;}}); if(best!==activeSlot){setActiveSlot(best);syncPager();} };
    grid.addEventListener('scroll',()=>{ clearTimeout(st); st=setTimeout(syncFromScroll,80); },{passive:true});
    grid.addEventListener('scrollend',syncFromScroll);
    grid.addEventListener('touchend',()=>setTimeout(syncFromScroll,380),{passive:true});
    document.getElementById('beyPager')?.addEventListener('click',e=>{ const b=e.target.closest('[data-pg]'); if(b)goToBey(activeSlot+(+b.dataset.pg)); });
    document.getElementById('pagerDots')?.addEventListener('click',e=>{ const dots=[...e.currentTarget.querySelectorAll('i')]; const k=dots.indexOf(e.target); if(k>=0)goToBey(k); });
    document.getElementById('deckBar')?.addEventListener('click',e=>{ const b=e.target.closest('.db-bey'); if(b){goToBey(+b.dataset.bey);return;} if(e.target.closest('[data-undo]'))undoDeck(); });
    document.getElementById('sfxBtn')?.addEventListener('click',()=>{sfxOn=!sfxOn;localStorage.setItem('bx_sfx',sfxOn?'1':'0');syncSfxBtn();if(sfxOn)sfx('place');toast(sfxOn?'Som ao encaixar: ligado.':'Som ao encaixar: desligado.');});
    syncSfxBtn();
    document.getElementById('undoDeckBtn')?.addEventListener('click',undoDeck);
    window.addEventListener('resize',()=>{ if(isMobileBuilder())goToBey(activeSlot,false); });
  })();

  // ---- Rascunho recuperado (o deck já persiste em localStorage; aqui só avisamos e damos a opção de descartar) ----
  function renderDraftNotice(){
    const el=document.getElementById('draftNotice'); if(!el)return;
    const has=deck.some(s=>slotParts(s).length);
    const seen=sessionStorage.getItem('bx_builder_seen');
    if(!seen&&has){
      el.hidden=false;
      el.innerHTML=`<span>${BX.ic('save',14)} <b>Rascunho recuperado.</b> Continuamos de onde você parou.</span><span class="dn-actions"><button type="button" class="btn ghost" data-dn="keep">Continuar</button><button type="button" class="btn ghost danger" data-dn="discard">${BX.ic('trash',13)} Descartar</button></span>`;
      el.onclick=(e)=>{ const b=e.target.closest('[data-dn]'); if(!b)return; el.hidden=true; if(b.dataset.dn==='discard'){deck=emptyDeck();saveState();renderAll();toast('Rascunho descartado.');} };
    } else el.hidden=true;
    sessionStorage.setItem('bx_builder_seen','1');
  }

  // ---- Atalhos de teclado (desktop) ----
  document.addEventListener('keydown',e=>{
    if(currentView!=='builder')return;
    const tag=(e.target.tagName||'').toLowerCase(); const typing=['input','textarea','select'].includes(tag)||e.target.isContentEditable;
    const sheetOpen=!document.getElementById('slotSheet')?.hidden;
    if(e.key==='Escape'){ if(sheetOpen){closeSheet();e.preventDefault();return;} if(panelTarget){panelTarget=null;renderBuilder();return;} hidePreview(); return; }
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){ if(typing)return; e.preventDefault(); undoDeck(); return; }
    if(typing||sheetOpen)return;
    if(document.querySelector('.modal-backdrop:not([hidden]), .slot-picker-backdrop:not([hidden]), .bx-dialog-backdrop:not([hidden])'))return;
    const focusSlot=e.target.closest?.('.slot');
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){ if(focusSlot&&e.shiftKey)return; e.preventDefault(); goToBey(activeSlot+(e.key==='ArrowRight'?1:-1)); return; }
    if(focusSlot&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); const bey=+focusSlot.dataset.bey,field=focusSlot.dataset.field,kind=focusSlot.dataset.kind; setActiveSlot(bey); openSheet(bey,field,kind); return; }
    if(focusSlot&&(e.key==='Delete'||e.key==='Backspace')){ e.preventDefault(); const bey=+focusSlot.dataset.bey,field=focusSlot.dataset.field; if(deck[bey][field]){const n=PARTS[deck[bey][field]]?.display;clearField(bey,field);toast(`${n} removido.`);} return; }
  });

  // Fecha a prévia ao rolar ou tocar fora
  document.addEventListener('scroll',hidePreview,{passive:true,capture:true});

  // ---------- Picker de peças (quadradinhos com foto) — builder e coleção ----------
  const PICKER_KINDS=[['','Tudo'],['blade','Blades'],['integrated','Integradas'],['lock','Lock Chips'],['over','Over'],['main','Main'],['assist','Assist'],['ratchet','Ratchets'],['bit','Bits'],['rib','RIB']];
  let activeSlot=0;

  function setActiveSlot(i){
    activeSlot=Math.max(0,Math.min(2,i));
    document.querySelectorAll('#deckGrid .bey-card').forEach(c=>c.classList.toggle('active-slot',+c.dataset.deckSlot===activeSlot));
    const label=document.getElementById('activeSlotLabel'); if(label)label.textContent=activeSlot+1;
  }

  /** Aplica uma peça (objeto do catálogo local) no slot, ajustando a estrutura. */
  /** Encaixa a peça num slot (cópia), ajustando a estrutura standard/CX/integrada. */
  function buildSlotWith(old,p){
    let s=clone(old);
    const kind=p.kind;
    if(kind==='blade'){const keepR=old.ratchet||'',keepB=old.bit||'';s=emptySlot();s.mode='standard';s.blade=p.id;s.ratchet=keepR;s.bit=keepB;}
    else if(kind==='integrated'){const keepB=old.bit||'';s=emptySlot();s.mode='integrated';s.blade=p.id;s.bit=keepB;}
    else if(['lock','main','assist','over'].includes(kind)){
      if(!['cx','cxrib'].includes(s.mode)){const keepR=old.ratchet||'',keepB=old.bit||'';s=emptySlot();s.mode='cx';s.ratchet=keepR;s.bit=keepB;}
      s[kind]=p.id; if(kind==='main'&&!p.requiresOver)s.over='';
    }
    else if(kind==='ratchet'){
      if(s.mode==='cxrib'){s.mode='cx';s.rib='';s.bit='';}
      if(s.mode==='integrated'){const keepB=s.bit;s=emptySlot();s.mode='standard';s.bit=keepB;}
      s.ratchet=p.id;
    }
    else if(kind==='bit'){ if(s.mode==='cxrib'){s.mode='cx';s.rib='';} s.bit=p.id; }
    else if(kind==='rib'){ if(!['cx','cxrib'].includes(s.mode))s=emptySlot(); s.mode='cxrib';s.rib=p.id;s.ratchet='';s.bit=''; }
    return s;
  }
  function applyPartToSlot(p,target){ deck[target]=buildSlotWith(deck[target],p); saveState(); renderAll(); }

  /**
   * Fábrica de picker: mesma caixa de quadradinhos (busca + filtro por tipo +
   * "tenho") em qualquer lugar. cfg = {search, filters, grid, hint, onPick, hintText}.
   */
  function makePicker(cfg){
    const st={kind:'',ownedOnly:false};
    function render(){
      const grid=document.getElementById(cfg.grid); if(!grid)return;
      const filters=document.getElementById(cfg.filters);
      if(filters&&!filters.dataset.ready){
        filters.innerHTML=PICKER_KINDS.map(([k,label])=>`<button class="picker-chip ${k===st.kind?'active':''}" data-kind="${k}">${label}</button>`).join('')
          +(cfg.onlyOwned?'':`<button class="picker-chip owned-toggle" data-owned="1" title="Mostrar só peças que eu tenho">${BX.ic('check', 14)} Tenho</button>`);
        filters.dataset.ready='1';
        filters.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{
          st.kind=b.dataset.kind;
          filters.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));
          render();
        }));
        filters.querySelector('[data-owned]')?.addEventListener('click',e=>{
          st.ownedOnly=!st.ownedOnly; e.currentTarget.classList.toggle('active',st.ownedOnly); render();
        });
      }
      const q=equivalentKey(document.getElementById(cfg.search)?.value||'');
      let items=PARENTS().filter(p=>!st.kind||p.kind===st.kind);
      if(q)items=items.filter(p=>[p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>x&&equivalentKey(x).includes(q)));
      if(st.ownedOnly||cfg.onlyOwned)items=items.filter(p=>(inventory[p.id]||0)>0);
      items.sort((a,b)=>(cfg.favorites?(favParts.has(b.id)-favParts.has(a.id)):0)||((inventory[b.id]||0)>0)-((inventory[a.id]||0)>0)||a.display.localeCompare(b.display));
      const shown=items.slice(0,160);
      grid.innerHTML=shown.map(p=>{
        const owned=inventory[p.id]||0;
        const stt=cfg.tileState?cfg.tileState(p):null;
        return `<button class="picker-tile ${owned?'owned':''} ${stt?.disabled?'disabled':''} ${cfg.favorites&&favParts.has(p.id)?'fav':''}" data-part="${escapeAttr(p.id)}" ${cfg.draggable&&!stt?.disabled?'draggable="true"':''} ${stt?.disabled?'data-disabled="1"':''} title="${escapeAttr(p.display)} — ${KIND_LABEL[p.kind]||p.kind}${owned?` (você tem ×${owned})`:''}${stt?.title?` — ${escapeAttr(stt.title)}`:''}">
          ${stt?.badge?`<i class="picker-left ${stt.disabled?'out':''}">${escapeHTML(stt.badge)}</i>`:''}
          ${partArt(p,'tile')}
          <span class="picker-tile-name">${escapeHTML(p.display)}</span>
          ${owned?`<i class="picker-owned">${BX.ic('check', 14)}${owned>1?` ×${owned}`:''}</i><em class="picker-have">na coleção</em>`:(cfg.ownership?`<i class="picker-noown" title="Não está na sua coleção">${BX.ic('backpack', 11)}</i>`:'')}
          ${p.banned?'<i class="picker-banned">!</i>':''}
          ${cfg.favorites?`<i class="tile-fav ${favParts.has(p.id)?'on':''}" data-fav="${escapeAttr(p.id)}" title="${favParts.has(p.id)?'Tirar das favoritas':'Favoritar'}">${BX.ic('star', 12)}</i>`:''}
        </button>`;
      }).join('')||'<div class="empty-state">Nenhuma peça com esses filtros.</div>';
      const hint=document.getElementById(cfg.hint);
      if(hint)hint.innerHTML=`${items.length} peça(s)${items.length>shown.length?` • mostrando ${shown.length}`:''} — ${cfg.hintText()}`;
      grid.querySelectorAll('.picker-tile').forEach(b=>b.addEventListener('click',(e)=>{
        const fav=e.target.closest('[data-fav]'); if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);render();return;}
        const p=PARTS[b.dataset.part];if(!p)return;if(b.dataset.disabled){toast(cfg.disabledText?cfg.disabledText(p):`${p.display} já está reservada em outro deck.`);return;}cfg.onPick(p);
      }));
      if(cfg.draggable)grid.querySelectorAll('.picker-tile[draggable]').forEach(b=>{
        b.addEventListener('dragstart',e=>{const p=PARTS[b.dataset.part];if(!p){e.preventDefault();return;}e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',p.id);hidePreview();dragStartPart(p);b.classList.add('dragging');});
        b.addEventListener('dragend',()=>{b.classList.remove('dragging');dragEndPart();});
      });
      if(cfg.preview)bindPreview(grid,'.picker-tile',el=>PARTS[el.dataset.part]);
      hydrateImages(grid);
    }
    document.getElementById(cfg.search)?.addEventListener('input',render);
    render.setKind=(k)=>{ st.kind=k||''; const filters=document.getElementById(cfg.filters); filters?.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x.dataset.kind===st.kind)); };
    render.getKind=()=>st.kind;
    return render;
  }

  // Builder: clique coloca no Bey ativo
  const renderPicker=makePicker({
    search:'pickerSearch',filters:'pickerFilters',grid:'pickerGrid',hint:'pickerHint',
    draggable:true,favorites:true,ownership:true,preview:true,
    hintText:()=>panelTarget?`escolha um(a) <b>${escapeHTML(SLOT_LABEL[panelTarget.kind]||'')}</b> para o <b>Bey ${panelTarget.bey+1}</b> — ou arraste até o slot. <a href="#" data-cancel-target>cancelar</a>`:`clique para preencher o primeiro slot livre compatível (ou o <b>Bey ${activeSlot+1}</b>); arraste para escolher o slot.`,
    onPick:placeFromPanel,
  });
  document.getElementById('pickerHint')?.addEventListener('click',e=>{ if(e.target.closest('[data-cancel-target]')){e.preventDefault();panelTarget=null;renderPicker.setKind('');renderPicker();renderBuilder();} });

  // Coleção: clique adiciona +1 cópia
  const renderSessPicker=makePicker({
    search:'sessPickerSearch',filters:'sessPickerFilters',grid:'sessPickerGrid',hint:'sessPickerHint',onlyOwned:true,
    tileState:(p)=>{const {left,repeated}=sessionLeft(p);const have=inventory[p.id]||0;return {disabled:left<=0||repeated,badge:left>0?`${left} livre${left>1?'s':''}`:'reservada',title:repeated?'já está neste deck':left<=0?`todas as ${have} cópias já estão reservadas`:`${left} de ${have} livre(s)`};},
    disabledText:(p)=>sessionLeft(p).repeated?`${p.display} já está em outro Bey deste deck.`:`Todas as cópias de ${p.display} já estão reservadas em outros decks.`,
    hintText:()=>`só peças da sua coleção — clique para colocar no <b>Bey ${sessionActiveSlot+1}</b>; acinzentadas já estão reservadas`,
    onPick:async(p)=>{const c=await chooseOwnedColor(p);if(!c){toast(`Nenhuma cópia livre de ${p.display}.`);return;}sessionDraft[sessionActiveSlot]=buildSlotWith(sessionDraft[sessionActiveSlot],c);saveSession();renderSession();toast(`${c.display}${c.colorLabel?` (${c.colorLabel})`:''} → Bey ${sessionActiveSlot+1}`);},
  });
  const renderColPicker=makePicker({
    search:'colPickerSearch',filters:'colPickerFilters',grid:'colPickerGrid',hint:'colPickerHint',
    hintText:()=>'clique para adicionar <b>+1</b> à sua coleção (o botão − no card da peça remove).',
    onPick:async(p)=>{const c=await chooseColor(p);if(!c)return;changeManualQty(c.id,1);toast(`+1 ${c.display}${c.colorLabel?` (${c.colorLabel})`:''} na coleção (agora ×${inventory[c.id]||1}).`);},
  });

  /** Adiciona várias peças de uma vez (ex.: as de um produto) — um só re-render. */
  function addManualParts(ids){
    let n=0;
    for(const id of ids){ if(!PARTS[id])continue; if(!manualParts[id])manualParts[id]={part:PARTS[id],qty:0}; manualParts[id].qty=(manualParts[id].qty||0)+1; n++; }
    persistCollection();
    rebuildInventory();
    return n;
  }

  /** Bloco "Decks físicos" do builder: lista os decks reservados na sessão física, com importar e publicar. */
  function renderPhysicalPanel(){
    const el=document.getElementById('physicalDecksPanel'); if(!el)return;
    if(!sessionDecks.length){el.innerHTML='<div class="empty-state">Nenhum deck físico reservado. Monte um na <a href="/#session" style="color:var(--cyan)">Sessão física</a> e ele aparece aqui pra importar ou publicar.</div>';return;}
    const canPreview=window.BX?.deckPreview&&window.BX.partTag?._idx;
    el.innerHTML=sessionDecks.map((d,i)=>`<div class="saved-deck physical">
      <div class="saved-deck-main">
        <h3>${escapeHTML(d.name||`Deck físico ${i+1}`)}</h3>
        ${canPreview?`<div class="physical-preview small">${window.BX.deckPreview(deckBeyNames(d.deck),{u:34})}</div>`:''}
        <p>${(d.deck||[]).map(slotName).map(escapeHTML).join(' • ')}</p>
      </div>
      <div class="saved-deck-actions col">
        <button class="btn secondary" data-phys-import="${i}" title="Carregar este deck no builder">${BX.ic('refresh', 14)} Importar</button>
        <button class="btn primary" data-phys-publish="${i}" title="Carregar e salvar na sua conta">${BX.ic('save', 14)} Publicar</button>
      </div>
    </div>`).join('');
    el.querySelectorAll('[data-phys-import]').forEach(b=>b.addEventListener('click',()=>{loadPhysicalDeck(+b.dataset.physImport);toast('Deck físico carregado no builder.');}));
    el.querySelectorAll('[data-phys-publish]').forEach(b=>b.addEventListener('click',()=>{loadPhysicalDeck(+b.dataset.physPublish);setTimeout(()=>document.getElementById('publishDeckBtn')?.click(),60);}));
  }
  /** Copia um deck físico (sessão) para o builder principal. */
  function loadPhysicalDeck(i){
    const d=sessionDecks[i]; if(!d)return;
    deck=clone(d.deck); while(deck.length<3)deck.push(emptySlot()); deck=deck.slice(0,3);
    const nameEl=document.getElementById('deckName'); if(nameEl){nameEl.value=d.name||`Deck físico ${i+1}`; localStorage.setItem('bx_deck_name',nameEl.value);}
    saveState(); renderAll(); activateView('builder');
    document.getElementById('deckGrid')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  // Renderização preguiçosa: só a view visível é desenhada; as demais ficam marcadas como "sujas"
  // e renderizam quando o usuário abre (evita centenas de imagens/DOM de abas escondidas no boot).
  const VIEW_RENDERERS={
    home:[],
    meta:[()=>renderWeekly()],
    builder:[()=>renderBuilder(),()=>renderPicker(),()=>renderPhysicalPanel()],
    collection:[()=>renderCollection(),()=>renderColPicker()],
    missing:[()=>renderMissing()],
    popular:[()=>renderPopular()],
    session:[()=>renderSession()],
    tournament:[()=>renderTournament()],
  };
  let currentView='home'; const dirtyViews=new Set(Object.keys(VIEW_RENDERERS));
  function renderView(name){ (VIEW_RENDERERS[name]||[]).forEach(fn=>{try{fn();}catch(e){console.error('[render]',name,e);}}); dirtyViews.delete(name); }
  function renderAll(){ renderHeader(); Object.keys(VIEW_RENDERERS).forEach(v=>dirtyViews.add(v)); renderView(currentView); }

  function escapeHTML(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function escapeAttr(s){return escapeHTML(s).replace(/`/g,'&#96;');}
  let toastTimer; function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}

  // Views por hash (#builder, #collection, …) — a sidebar do shell navega por aqui
  function activateView(name){
    // A antiga aba de meta virou uma seção da home
    const metaJump=(name==='weekly');
    const target=metaJump?'meta':(document.getElementById(`view-${name}`)?name:'home');
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${target}`));
    currentView=target;
    if(dirtyViews.has(target))renderView(target);
    else if(target==='tournament'){bracketNatural=null;applyBracketLayout();}
    if(metaJump){
      const sec=document.getElementById('metaSection');
      if(sec){ requestAnimationFrame(()=>sec.scrollIntoView({behavior:'smooth',block:'start'})); return; }
    }
    window.scrollTo({top:0});
  }
  window.addEventListener('hashchange',()=>activateView(location.hash.slice(1)||'home'));
  activateView(location.hash.slice(1)||'home');

  // Alternância catálogo inteiro × só minha coleção (Deck Builder)
  const builderModeBtn=document.getElementById('builderModeBtn');
  function syncBuilderModeBtn(){
    if(!builderModeBtn)return;
    builderModeBtn.innerHTML=builderShowAll?`${BX.ic('globe',14)} Catálogo inteiro`:`${BX.ic('backpack',14)} Só minha coleção`;
    builderModeBtn.title=builderShowAll?'Mostrando todas as peças do catálogo — clique para ver só a sua coleção':'Mostrando só peças que você possui — clique para liberar o catálogo inteiro';
  }
  builderModeBtn?.addEventListener('click',()=>{
    builderShowAll=!builderShowAll;
    localStorage.setItem('bx_builder_show_all',builderShowAll?'1':'0');
    syncBuilderModeBtn(); renderAll();
    toast(builderShowAll?'Modo catálogo: monte com qualquer peça, mesmo sem possuir.':'Modo coleção: só peças que você tem.');
  });
  syncBuilderModeBtn();
  setActiveSlot(0);

  document.getElementById('importBtn').addEventListener('click',()=>smartImportInventory(document.getElementById('inventoryText').value));
  document.getElementById('manualAddBtn')?.addEventListener('click',addManualPart);
  document.getElementById('syncCatalogBtn')?.addEventListener('click',()=>syncLiveCatalog({quiet:false,force:true}));
  document.getElementById('catalogSearchBtn')?.addEventListener('click',searchCatalog);
  document.getElementById('catalogSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchCatalog();});
  ['missingSearchInput','missingShowFilter'].forEach(id=>document.getElementById(id)?.addEventListener(id==='missingSearchInput'?'input':'change',renderMissing));
  document.getElementById('loadMoreMetaBtn')?.addEventListener('click',loadMoreMetaDecks);

  document.getElementById('randomDeckBtn').addEventListener('click',()=>generateRandomDeck(false));
  document.getElementById('viableDeckBtn').addEventListener('click',()=>generateRandomDeck(true));
  document.getElementById('clearDeckBtn').addEventListener('click',()=>{deck=emptyDeck();saveState();renderAll();toast('Deck limpo.');});
  document.getElementById('deckName').addEventListener('input',e=>localStorage.setItem('bx_deck_name',e.target.value));
  document.getElementById('deckName').value=localStorage.getItem('bx_deck_name')||'';

  document.getElementById('slotPickerClose').addEventListener('click',closeSlotPicker);
  document.getElementById('slotPickerModal').addEventListener('click',e=>{if(e.target.id==='slotPickerModal')closeSlotPicker();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSlotPicker();});

  document.getElementById('sessionCopyCurrentBtn').addEventListener('click',()=>{sessionDraft=clone(deck);saveSession();renderSession();toast('Deck em andamento copiado para o rascunho físico.');});
  document.getElementById('sessionClearDraftBtn').addEventListener('click',()=>{sessionDraft=emptyDeck();saveSession();renderSession();toast('Rascunho físico limpo.');});
  document.getElementById('sessionLockBtn').addEventListener('click',lockSessionDeck);
  document.getElementById('sessionResetBtn').addEventListener('click',()=>{if(confirm('Liberar todas as peças reservadas nesta sessão?')){sessionDecks=[];sessionDraft=emptyDeck();saveSession();renderSession();toast('Sessão física resetada.');}});

  document.getElementById('tournamentMaxPlayers').addEventListener('change',e=>{let n=Math.max(2,Math.min(32,parseInt(e.target.value,10)||8));n=Math.max(n,tournament.players.length);tournament.maxPlayers=n;e.target.value=n;saveTournament();renderTournament();});
  document.getElementById('tournamentThirdPlace')?.addEventListener('change',e=>{tournament.thirdPlaceEnabled=e.target.checked;syncThirdPlaceMatch();saveTournament();renderTournament();});
  document.getElementById('playerPhotoInput').addEventListener('change',e=>handlePlayerPhoto(e.target.files?.[0]));
  document.getElementById('useCurrentDeckForPlayerBtn').addEventListener('click',()=>{document.getElementById('playerDeckInput').value=deck.map(slotName).join('\n');});
  document.getElementById('addPlayerBtn').addEventListener('click',addTournamentPlayer);
  document.getElementById('shuffleBracketBtn').addEventListener('click',generateBracket);
  document.getElementById('resetTournamentBtn').addEventListener('click',()=>{if(confirm('Apagar inscrições, resultados e chave deste torneio?')){tournament={maxPlayers:tournament.maxPlayers||8,players:[],rounds:[],thirdPlaceEnabled:!!tournament.thirdPlaceEnabled,thirdPlaceMatch:null};saveTournament();renderTournament();toast('Torneio resetado.');}});

  loadLiveCatalog();
  const productSavedAt=loadProductCatalog();
  onlineStockCache=loadJSON(ONLINE_STOCK_KEY,[]);
  onlineStockCache.forEach(rec=>{if(rec?.match&&!STOCK.some(s=>s.match.some(x=>rec.match.includes(x))))STOCK.push(rec);});
  rebuildInventory();
  // sem login/coleção ainda: se a camada de comunidade não chamar setCloud em 6s, mostra o estado "entre"
  setTimeout(()=>{ if(!cloudReady)setCloud(null); },6000);

  // Hooks para a camada de comunidade (home, perfil, PartTag) — js/home.js
  window.BXApp = {
    getMetaDecks: () => metaDecks,
    getWeekly: () => BBX_WEEKLY,
    getInventory: () => ({ ...inventory }),
    /** Coleção pronta pra enviar: {localId, qty} sem contar a peça-pai duas vezes (só o "sem cor" dela). */
    loadPhysicalDeck,
    setCloud,
    cloud: null,
    getCollectionItems: () => Object.entries(inventory).map(([id,qty])=>{const p=PARTS[id];if(!p)return null;if(p.parentId)return {id,qty};const kidsQty=childrenOf(p).reduce((n,k)=>n+(inventory[k.id]||0),0);const generic=qty-kidsQty;return generic>0?{id,qty:generic}:null;}).filter(Boolean),
    getPart: (id) => PARTS[id],
    listParts: () => Object.values(PARTS),
    partSlug: (p) => slug(p.display || p.name),
    rerenderMeta: () => { renderAll(); },
    rerenderHeader: renderHeader,
    activateView,
    /** Traz o catálogo do servidor (todas as peças + fotos oficiais) para o montador. */
    importCatalog: (serverParts) => {
      const KIND_MAP={BLADE:'blade',LOCK_CHIP:'lock',OVER_BLADE:'over',MAIN_BLADE:'main',ASSIST_BLADE:'assist',RATCHET:'ratchet',BIT:'bit'};
      let added=0,enriched=0;
      const list=serverParts||[];
      const localByServer={};
      for(const sp of list.filter(x=>!x.parentId)){
        let kind=KIND_MAP[sp.kind]||'blade';
        if(sp.subKind==='INTEGRATED')kind='integrated';
        if(sp.subKind==='RIB')kind='rib';
        const display=sp.display||sp.name;
        if(!display)continue;
        const keys=[display,sp.name,...(sp.aliases||[])].filter(Boolean).map(equivalentKey);
        const abbr=(sp.abbrev||'').toUpperCase();
        let exists=PARENTS().find(p=>p.kind===kind&&([p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>x&&keys.includes(equivalentKey(x)))||(abbr&&['bit','ratchet','rib'].includes(kind)&&(p.abbrev||'').toUpperCase()===abbr)));
        if(exists){
          if(!exists.image&&sp.img){exists.image=sp.img;enriched++;}
          if(!exists.type&&sp.type)exists.type=sp.type;
          if(!exists.serverId){exists.serverId=sp.id;enriched++;}
          if(sp.display&&exists.display!==sp.display){exists.aliases=[...new Set([...(exists.aliases||[]),exists.display])];exists.display=sp.display;enriched++;}
          // outras locais que também casam com esta peça do servidor são duplicatas → funde
          for(const dup of PARENTS().filter(p=>p!==exists&&p.kind===kind&&!p.serverId&&([p.name,p.display,p.abbrev,...(p.aliases||[])].some(x=>x&&keys.includes(equivalentKey(x)))||(abbr&&['bit','ratchet','rib'].includes(kind)&&(p.abbrev||'').toUpperCase()===abbr)))){ mergeLocalPart(dup,exists); enriched++; }
        } else {
          const id=reg(P(kind,sp.name||display,{display,aliases:sp.aliases||[],abbrev:sp.abbrev||'',type:sp.type||'',image:sp.img||'',basicLock:kind==='lock',source:'catálogo do site',serverId:sp.id}));
          exists=PARTS[id]; added++;
        }
        localByServer[sp.id]=exists;
      }
      // recolors: peças-filhas com id próprio, mesma identidade do pai
      let order=0;
      for(const sp of list.filter(x=>x.parentId)){
        const parent=localByServer[sp.parentId]||Object.values(PARTS).find(p=>p.serverId===sp.parentId);
        if(!parent)continue;
        const id=parent.id+'#'+sp.id;
        if(!PARTS[id]){
          PARTS[id]={...parent,id,aliases:[],image:sp.img||parent.image,parentId:parent.id,serverId:sp.id,colorLabel:sp.variantLabel||'Cor',colorOrder:order++,source:'catálogo do site',wiki:''};
          added++;
        } else { const c=PARTS[id]; if(sp.img)c.image=sp.img; c.colorLabel=sp.variantLabel||c.colorLabel; c.serverId=sp.id; c.colorOrder=order++; c.display=parent.display; c.name=parent.name; c.abbrev=parent.abbrev; c.type=parent.type||c.type; }
      }
      if(added||enriched){saveLiveCatalog();rebuildInventory();}
      updateCatalogStatus(`Online • ${PARENTS().length} peças • ${productCatalog.length} produtos`,'live');
      return {added,enriched};
    },
    /** Adiciona à coleção as peças de um produto vindas do servidor. Devolve os nomes adicionados. */
    addProductParts: (serverParts) => {
      const KIND_MAP={BLADE:'blade',LOCK_CHIP:'lock',OVER_BLADE:'over',MAIN_BLADE:'main',ASSIST_BLADE:'assist',RATCHET:'ratchet',BIT:'bit'};
      const ids=[];
      for(const sp of serverParts||[]){
        let kind=KIND_MAP[sp.kind]||'blade';
        if(sp.subKind==='INTEGRATED')kind='integrated';
        if(sp.subKind==='RIB')kind='rib';
        const display=sp.displayName||sp.display||sp.name; if(!display)continue;
        const keys=[display,sp.name,...(sp.aliases||[])].filter(Boolean).map(equivalentKey);
        let p=sp.id?Object.values(PARTS).find(x=>x.serverId===sp.id):null; // cor específica do produto (peça-filha)
        if(!p&&sp.parentId){ // filha ainda não conhecida localmente: cria a partir do pai
          const parent=Object.values(PARTS).find(x=>x.serverId===sp.parentId)||PARENTS().find(x=>x.kind===kind&&[x.name,x.display,x.abbrev,...(x.aliases||[])].some(y=>y&&keys.includes(equivalentKey(y))));
          if(parent){const id=parent.id+'#'+sp.id;PARTS[id]=PARTS[id]||{...parent,id,aliases:[],image:sp.imageUrl||sp.img||parent.image,parentId:parent.id,serverId:sp.id,colorLabel:sp.variantLabel||'Cor',colorOrder:sp.variantOrder||0,source:'catálogo do site',wiki:''};p=PARTS[id];}
        }
        if(!p)p=PARENTS().find(x=>x.kind===kind&&[x.name,x.display,x.abbrev,...(x.aliases||[])].some(y=>y&&keys.includes(equivalentKey(y))));
        if(!p){reg(P(kind,sp.name||display,{display,aliases:sp.aliases||[],abbrev:sp.abbrev||'',type:sp.type||'',image:sp.imageUrl||sp.img||'',basicLock:kind==='lock',source:'catálogo do site',serverId:sp.id||''}));p=findEquivalent(kind,display);}
        if(p)ids.push(p.id);
      }
      const n=addManualParts(ids);
      return {added:n,names:ids.map(id=>PARTS[id]?.display).filter(Boolean)};
    },
    // Deck atual como listas de peças (para publicar na comunidade)
    getDeck: () => deck.map(slot => ({ complete: isComplete(slot), name: slotName(slot), parts: slotParts(slot).map(id => PARTS[id]).filter(Boolean) })),
    getDeckName: () => document.getElementById('deckName')?.value || '',
    setDeckName: (v) => { const el=document.getElementById('deckName'); if(el){el.value=v; localStorage.setItem('bx_deck_name',v);} },
    /** Carrega um deck (arrays de nomes de peça) no builder — usado ao editar. */
    loadDeck: (beys) => {
      deck = emptyDeck();
      beys.slice(0,3).forEach((bey,i)=>{
        (bey||[]).forEach(name=>{
          let p=null;
          if(String(name).startsWith('#sid:')){const sid=String(name).slice(5);p=Object.values(PARTS).find(x=>x.serverId===sid)||null;}
          if(!p){const key=equivalentKey(name);p=Object.values(PARTS).find(x=>[x.name,x.display,x.abbrev,...(x.aliases||[])].some(a=>a&&equivalentKey(a)===key));}
          if(p)applyPartToSlot(p,i);
        });
      });
      saveState(); renderAll(); location.hash='builder';
    },
  };
  document.dispatchEvent(new CustomEvent('bxapp-ready'));
  updateCatalogStatus('Carregando catálogo…','live',true);
  // Peças vêm do servidor. O sync remoto legado (produtos/imagens do hub) roda em segundo plano, no máximo 1x a cada 24h, e só quando o navegador está ocioso.
  const lazySync=()=>{ if(productCatalog.length&&Date.now()-productSavedAt<24*3600e3)return; syncLiveCatalog({quiet:true,force:true}).catch(()=>{}); };
  if('requestIdleCallback' in window)requestIdleCallback(()=>setTimeout(lazySync,3000),{timeout:10000}); else setTimeout(lazySync,6000);
})();
