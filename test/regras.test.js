const test = require('node:test');
const assert = require('node:assert');
const rules = require('../rules');

function sala() { const r = { players: ['a', 'b'] }; rules.novaPartida(r, 0); return r; }

test('roleta tem 23 letras, sem K, W e Y', () => {
  assert.equal(rules.LETRAS.length, 23);
  for (const l of ['K', 'W', 'Y']) assert.ok(!rules.LETRAS.includes(l));
  assert.equal(new Set(rules.LETRAS).size, 23);
});

test('letra válida passa a vez; repetida, fora da vez ou fora da roleta é recusada', () => {
  const r = sala();
  assert.ok(r.round.categoria);
  assert.equal(rules.jogarLetra(r, 1, 'A').error, 'Não é sua vez.');
  assert.equal(rules.jogarLetra(r, 0, 'K').error, 'Letra não existe na roleta.');
  assert.ok(rules.jogarLetra(r, 0, 'a').ok, 'minúscula entra igual');
  assert.equal(r.round.turn, 1);
  assert.equal(rules.jogarLetra(r, 1, 'A').error, 'Letra já usada.');
  assert.ok(rules.jogarLetra(r, 1, 'B').ok);
  assert.deepEqual(r.round.usadas, ['A', 'B']);
});

test('roleta inteira apertada = empate, ninguém pontua', () => {
  const r = sala();
  rules.LETRAS.forEach((l, i) => assert.ok(rules.jogarLetra(r, i % 2, l).ok));
  assert.equal(r.phase, 'round_over');
  assert.equal(r.round.motivo, 'roleta');
  assert.deepEqual(r.scores, [0, 0]);
  assert.ok(rules.proximaRodada(r));
  assert.equal(r.round.n, 2);
  assert.equal(r.round.turn, 1, 'quem abre alterna');
});

test('estourar dá o ponto ao outro; 5 pontos fecham a partida', () => {
  const r = sala();
  rules.jogarLetra(r, 0, 'A'); // vez do 1
  rules.estourar(r);
  assert.equal(r.round.loser, 1);
  assert.deepEqual(r.scores, [1, 0]);
  assert.equal(r.phase, 'round_over');
  rules.estourar(r); // fora de hora não conta
  assert.deepEqual(r.scores, [1, 0]);
  for (let i = 0; i < 4; i++) {
    rules.proximaRodada(r);
    r.round.turn = 1; // força o 1 na vez
    rules.estourar(r);
  }
  assert.deepEqual(r.scores, [5, 0]);
  assert.equal(r.phase, 'finished');
  assert.equal(r.winner, 0);
});

test('categorias não repetem antes de o baralho acabar', () => {
  const r = sala();
  const vistas = new Set([r.round.categoria]);
  for (let i = 1; i < rules.CATEGORIAS.length; i++) {
    r.phase = 'round_over'; rules.proximaRodada(r);
    assert.ok(!vistas.has(r.round.categoria), 'repetiu ' + r.round.categoria);
    vistas.add(r.round.categoria);
  }
});
