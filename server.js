const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const rules = require('./rules');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// A roleta e o tempo têm um dono só: o rules.js. O cliente recebe daqui.
app.get('/regras.js', (_req, res) => {
  res.type('application/javascript').send(
    `const LETRAS=${JSON.stringify(rules.LETRAS)},TEMPO_MS=${rules.TEMPO_MS},PONTOS_VITORIA=${rules.PONTOS_VITORIA};`
  );
});

const rooms = new Map();

// A sala só morre 30 min depois de os DOIS caírem: refresh, troca de aba e 4G oscilando
// não apagam a partida. Sem disco (ponytail: Render reinicia e perde tudo mesmo).
const ROOM_TTL_MS = 30 * 60 * 1000;
const REAPER_MS = 5 * 60 * 1000;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const reaper = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.some(Boolean)) continue;
    if (now - room.lastSeen > ROOM_TTL_MS) { desarmar(room); rooms.delete(code); }
  }
}, REAPER_MS);
reaper.unref();

// --- RELÓGIO (o server é o dono do tempo; o cliente só desenha) ---
// Só corre com os dois na sala: queda de rede pausa em vez de dar derrota.
function desarmar(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
}
function pausar(room) {
  if (!room.timer) return;
  desarmar(room);
  room.restante = Math.max(0, room.deadline - Date.now());
}
function armar(room) {
  desarmar(room);
  if (room.phase !== 'playing' || !room.players[0] || !room.players[1]) return;
  room.deadline = Date.now() + room.restante;
  room.timer = setTimeout(() => {
    room.timer = null;
    rules.estourar(room);
    broadcast(room);
  }, room.restante);
}

// Tudo que a tela precisa pra se remontar, do lobby ao fim da partida.
function roomState(room, idx) {
  return {
    code: room.code,
    playerIndex: idx,
    phase: room.phase,
    scores: room.scores,
    round: room.round,
    msLeft: room.timer ? Math.max(0, room.deadline - Date.now()) : room.restante,
    relogioParado: !room.timer,
    winner: room.winner,
    opponentOnline: !!room.players[1 - idx]
  };
}
function broadcast(room) {
  for (let i = 0; i < 2; i++) if (room.players[i]) io.to(room.players[i]).emit('estado', roomState(room, i));
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIndex = -1;

  socket.on('create_room', () => {
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();
    const room = {
      code, players: [socket.id, null], tokens: [crypto.randomUUID(), null],
      lastSeen: Date.now(), phase: 'waiting', scores: [0, 0], round: null,
      restante: rules.TEMPO_MS, deadline: 0, timer: null, winner: null, starter: 0
    };
    rooms.set(code, room);
    currentRoom = code; playerIndex = 0;
    socket.join(code);
    socket.emit('room_created', { code, playerIndex: 0, token: room.tokens[0] });
  });

  socket.on('join_room', (code) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('error_msg', 'Sala não encontrada.');
    if (room.tokens[1]) return socket.emit('error_msg', 'Sala cheia.');

    room.players[1] = socket.id;
    room.tokens[1] = crypto.randomUUID();
    room.lastSeen = Date.now();
    currentRoom = code; playerIndex = 1;
    socket.join(code);
    socket.emit('room_joined', { code, playerIndex: 1, token: room.tokens[1] });

    // Dois na sala = a primeira carta sai na hora.
    rules.novaPartida(room, 0);
    armar(room);
    broadcast(room);
  });

  socket.on('rejoin', ({ code, token } = {}) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    const idx = room && token ? room.tokens.indexOf(token) : -1;
    if (idx === -1) return socket.emit('rejoin_failed', 'Sala não encontrada.');

    // Mesma pessoa em duas abas: o socket novo toma o lugar, não vira 2º jogador.
    const old = room.players[idx];
    room.players[idx] = socket.id;
    room.lastSeen = Date.now();
    if (old && old !== socket.id) io.sockets.sockets.get(old)?.disconnect(true);

    currentRoom = code; playerIndex = idx;
    socket.join(code);
    armar(room);
    socket.emit('rejoined', roomState(room, idx));
    const opId = room.players[1 - idx];
    if (opId) io.to(opId).emit('estado', roomState(room, 1 - idx));
  });

  socket.on('letra', (letra) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.round) return;
    if (!room.players[1 - playerIndex]) return socket.emit('error_msg', 'Adversário caiu, relógio parado.');
    const r = rules.jogarLetra(room, playerIndex, letra);
    if (!r.ok) return socket.emit('error_msg', r.error);
    armar(room);
    broadcast(room);
  });

  socket.on('proxima', () => {
    const room = rooms.get(currentRoom);
    if (!room || !rules.proximaRodada(room)) return;
    armar(room);
    broadcast(room);
  });

  socket.on('rematch', () => {
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== 'finished') return;
    rules.novaPartida(room, 1 - room.starter);
    armar(room);
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = currentRoom && rooms.get(currentRoom);
    if (!room) return;
    const idx = room.players.indexOf(socket.id);
    if (idx === -1) return;
    room.players[idx] = null;
    room.lastSeen = Date.now();
    pausar(room);
    const opId = room.players[1 - idx];
    if (opId) io.to(opId).emit('estado', roomState(room, 1 - idx));
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tapple Online rodando em http://localhost:${PORT}`);
  const os = require('os');
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) console.log(`Acesse pelo celular: http://${net.address}:${PORT}`);
    }
  }
});

module.exports = { app, server, io, rooms, ROOM_TTL_MS };
