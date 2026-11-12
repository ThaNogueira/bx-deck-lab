// Modelos da própria franquia no catálogo, agrupados pelo sentido de giro.
// Novos modelos entram no sorteio depois de serem classificados aqui.
const rightSpin = new Set(`
  aeropegasus arrow-wizard bear-scratch bearscratch black-shell bullet-griffon
  clockmirage cobaltdrake cowl-sphinx crimson-garuda crimsongaruda croc-crunch
  draciel-shield dranbuster drandagger dranstrike dransword-2-0 dranzer-spiral driger-slash
  ghostcircle glare-cyclops glory-valkyrie goattackle golemrock gust-bat hack-viking
  hells-nether hellschain hellshammer hellsscythe-2-0 helm-knight horn-rhino impactdrake
  keel-shark knightlance knightmail knightshield-2-0 leonclaw leoncrest mammothtusk
  mummycurse orochicluster phoenixfeather phoenixrudder phoenixwing ring-aether
  rock-leone samuraicalibur samuraisaber samuraisteel scorpiospear scythe-incendio
  sharkgill sharkscale shatter-horus shelter-drake shinobiknife shinobishadow silverwolf
  sting-unicorn storm-pegasus storm-spriggan stun-medusa suppress-superion sword-dran
  talon-ptera tricerapress triceraspiky tyrannobeat tyrannoroar valor-bison vanish-lucifer
  victory-valkyrie vipertail weiss-tiger whalewave wizardarrow-2-0 wizardrod wyverngale
  wyvernhover xeno-xcalibur yell-kong
`.trim().split(/\s+/));

// Takara Tomy: BX-34, UX-17, BX-00 (Dragoon Storm e Lightning L-Drago) e BX-52.
const leftSpin = new Set([
  'cobaltdragoon', 'meteoroid-dragoon', 'dragoon-storm', 'lightning-l-drago', 'luster-dragoon',
]);

export function broadcastBladeSpin(part) {
  if (part.kind !== 'BLADE' || part.parentId || (part.subKind && part.subKind !== 'INTEGRATED') || !part.img) return null;
  if (/collab|sushiro/i.test(part.img)) return null;
  if (leftSpin.has(part.slug)) return 'left';
  return rightSpin.has(part.slug) ? 'right' : null;
}
