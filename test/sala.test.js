// Dois clientes de verdade contra o server real: carta na hora, relógio do server,
// queda pausa o relógio, token senta de volta.
process.env.TAPPLE_TEMPO_MS = '300';
const test = require('node:test');
const assert = require('node:assert');
const { io: Client } = require('socket.io-client');
const { server, io, rooms } = require('../server');

function espera(socket, evento, ms = 4000) {
  return new Promise((ok, falha) => {
    const relogio = setTimeout(() => falha(new Error(`timeout esperando ${evento}`)), ms);
    socket.once(evento, (carga) => { clearTimeout(relogio); ok(carga); });
  });
}
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Todo broadcast chega nos DOIS lados: esperar só um deixa o outro na fila e embaralha o próximo espera().
const ambos = (a, b, evento, ms) => Promise.all([espera(a, evento, ms), espera(b, evento, ms)]);

let porta;
test.before(() => new Promise((ok) => server.listen(0, () => { porta = server.address().port; ok(); })));
test.after(() => { io.disconnectSockets(true); return new Promise((ok) => io.close(ok)); });
const cliente = () => Client(`http://localhost:${porta}`, { transports: ['websocket'], forceNew: true });

async function partida() {
  const a = cliente(), b = cliente();
  const criada = espera(a, 'room_created');
  a.emit('create_room');
  const { code, token: tokenA } = await criada;
  const entrou = espera(b, 'room_joined');
  const estados = ambos(a, b, 'estado');
  b.emit('join_room', code.toLowerCase());
  const { token: tokenB } = await entrou;
  const [inicio] = await estados;
  return { a, b, code, tokenA, tokenB, inicio };
}

test('1. Segundo jogador entra e a primeira carta sai na hora, com o relógio andando', async () => {
  const { a, b, inicio, tokenA, tokenB } = await partida();
  assert.notEqual(tokenA, tokenB);
  assert.equal(inicio.phase, 'playing');
  assert.ok(inicio.round.categoria);
  assert.equal(inicio.round.turn, 0);
  assert.equal(inicio.relogioParado, false);
  assert.ok(inicio.msLeft > 0 && inicio.msLeft <= 300);
  a.close(); b.close();
});

test('2. Letra passa a vez; quem deixa o tempo estourar perde a rodada', async () => {
  const { a, b } = await partida();
  const depois = ambos(a, b, 'estado');
  a.emit('letra', 'M');
  const [, st] = await depois;
  assert.equal(st.round.turn, 1);
  assert.deepEqual(st.round.usadas, ['M']);
  assert.ok(st.msLeft > 200, 'relógio reinicia a cada letra');

  const fora = espera(b, 'error_msg');
  b.emit('letra', 'M');
  assert.match(await fora, /já usada/);

  const [fim] = await ambos(a, b, 'estado', 2000);
  assert.equal(fim.phase, 'round_over');
  assert.equal(fim.round.loser, 1);
  assert.deepEqual(fim.scores, [1, 0]);

  const prox = ambos(a, b, 'estado');
  b.emit('proxima');
  const [r2] = await prox;
  assert.equal(r2.phase, 'playing');
  assert.equal(r2.round.n, 2);
  assert.equal(r2.round.turn, 1, 'quem abre alterna');
  a.close(); b.close();
});

test('3. Queda pausa o relógio; token senta de volta e o relógio segue de onde parou', async () => {
  const { a, b, code, tokenA } = await partida();
  const caiu = espera(b, 'estado');
  a.close();
  const st = await caiu;
  assert.equal(st.opponentOnline, false);
  assert.equal(st.relogioParado, true);
  const restante = st.msLeft;
  await dorme(400); // mais que o TEMPO_MS inteiro
  assert.ok(rooms.has(code));
  assert.equal(rooms.get(code).phase, 'playing', 'ninguém perde por queda de rede');

  const recusa = espera(b, 'error_msg');
  b.emit('letra', 'A');
  assert.match(await recusa, /Adversário caiu/);

  const c = cliente();
  const voltou = espera(c, 'rejoined');
  const viu = espera(b, 'estado');
  c.emit('rejoin', { code, token: tokenA });
  const de_volta = await voltou;
  assert.equal((await viu).opponentOnline, true);
  assert.equal(de_volta.playerIndex, 0);
  assert.equal(de_volta.relogioParado, false);
  assert.ok(de_volta.msLeft <= restante + 5, 'segue de onde parou, não do zero');
  b.close(); c.close();
  await dorme(50);
  assert.ok(rooms.has(code), 'a sala só morre 30 min depois de os dois caírem');
});

test('4. Estranho com o link não senta na cadeira de quem caiu; token errado não entra', async () => {
  const { a, b, code, tokenB } = await partida();
  b.close();
  await espera(a, 'estado');
  const estranho = cliente();
  const recusa = espera(estranho, 'error_msg');
  estranho.emit('join_room', code);
  assert.match(await recusa, /Sala cheia/);
  const semToken = espera(estranho, 'rejoin_failed');
  estranho.emit('rejoin', { code, token: 'outro' });
  await semToken;
  const dono = cliente();
  const voltou = espera(dono, 'rejoined');
  const viu = espera(a, 'estado');
  dono.emit('rejoin', { code, token: tokenB });
  assert.equal((await voltou).playerIndex, 1);
  await viu;
  a.close(); estranho.close(); dono.close();
});

test('5. Revanche zera o placar e inverte quem abre', async () => {
  const { a, b, code } = await partida();
  const room = rooms.get(code);
  room.scores = [4, 0]; room.round.turn = 1; // 4 x 0 com o 1 na vez: o próximo estouro fecha
  const [fim] = await ambos(a, b, 'estado', 2000);
  assert.equal(fim.phase, 'finished');
  assert.equal(fim.winner, 0);
  const nova = ambos(a, b, 'estado');
  a.emit('rematch');
  const [, st] = await nova;
  assert.equal(st.phase, 'playing');
  assert.deepEqual(st.scores, [0, 0]);
  assert.equal(st.round.turn, 1, 'revanche inverte quem abre');
  a.close(); b.close();
});
