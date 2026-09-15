import assert from 'node:assert/strict';
import { standingsOf } from '../server/routes/tournaments.js';

const player = (id, name, dropped = false) => ({ id, dropped, lateLosses: 0, user: { id: `u-${id}`, name, slug: id, role: 'USER', verified: false } });
const match = (p1Id, p2Id, winnerId, round = 1) => ({ id: `${p1Id}-${p2Id}-${round}`, p1Id, p2Id, winnerId, round, status: 'DONE', p1Score: 1, p2Score: 0 });
const bye = (p1Id, round = 1) => ({ id: `bye-${p1Id}-${round}`, p1Id, p2Id: null, winnerId: p1Id, round, status: 'DONE' });
const tournament = (players, matches) => ({ players, matches });

// A enfrenta B duas vezes: B conta uma única vez no Op% de A. O BYE de B
// não eleva o Win % de B usado por A: B fica 1-2 em partidas reais = 33,333%.
{
  const table = standingsOf(tournament([player('a', 'Ana'), player('b', 'Bia'), player('c', 'Caio')], [
    match('a', 'b', 'a', 1), match('a', 'b', 'b', 2), match('b', 'c', 'c', 3), bye('b', 4),
  ]));
  const a = table.find((row) => row.player.id === 'a');
  assert.equal(a.omw, 1 / 3, 'Op% usa oponente único e ignora BYE no Win %');
}

// O piso é aplicado por oponente antes da média, e OOWP usa o OWP deles.
{
  const table = standingsOf(tournament([player('a', 'Ana'), player('b', 'Bia'), player('c', 'Caio')], [
    match('a', 'b', 'a'), match('b', 'c', 'c', 2),
  ]));
  const a = table.find((row) => row.player.id === 'a');
  assert.equal(a.omw, .25, 'oponente 0-2 recebe piso de 25%');
  assert.equal(a.oomw, 1, 'Op% do oponente, não recorde bruto, compõe Op do Op%');
}

// Head-to-head só ordena um grupo de exatamente dois; drop fica abaixo de ativo.
{
  const table = standingsOf(tournament([player('a', 'Ana'), player('b', 'Bia'), player('c', 'Caio'), player('d', 'Duda', true)], [
    match('a', 'b', 'a', 1), match('a', 'c', 'c', 2), match('b', 'c', 'b', 3),
  ]));
  assert.deepEqual(table.map((row) => row.player.id), ['a', 'b', 'c', 'd']);
}

console.log('TamerLeague Swiss tiebreaker tests passed.');
