// Regras do Tapple, puras (sem socket) pra caber num node --test.
// Roleta de 23 letras: alfabeto sem K, W e Y, como no Stop de mesa brasileiro.
const LETRAS = 'ABCDEFGHIJLMNOPQRSTUVXZ'.split('');

const CATEGORIAS = [
  'Animal', 'Fruta', 'Cidade', 'País', 'Nome de pessoa', 'Profissão', 'Cor', 'Filme',
  'Marca', 'Comida', 'Bebida', 'Objeto da cozinha', 'Peça de roupa', 'Esporte',
  'Instrumento musical', 'Cantor ou banda', 'Time de futebol', 'Personagem de desenho',
  'Super-herói', 'Flor ou planta', 'Parte do corpo', 'Modelo de carro', 'Doença', 'Verbo',
  'Adjetivo', 'O que voa', 'Sobremesa', 'Programa de TV', 'Livro', 'Jogo', 'Brinquedo',
  'Ferramenta', 'Móvel', 'Eletrodoméstico', 'Loja', 'Aplicativo', 'Apelido', 'Nome de cachorro',
  'Material', 'Pedra ou mineral', 'Desenho animado', 'Novela', 'Ator ou atriz',
  'Jogador de futebol', 'Cientista', 'Música', 'Palavra em inglês', 'Palavra em espanhol',
  'Capital de estado', 'Estado do Brasil', 'Ponto turístico', 'Comida de festa junina',
  'Comida de Natal', 'Ingrediente de pizza', 'Sabor de sorvete', 'Tempero', 'Legume ou verdura',
  'Peixe ou fruto do mar', 'Ave', 'Inseto', 'Animal da fazenda', 'Animal selvagem',
  'Item de praia', 'Cômodo da casa', 'Meio de transporte', 'Sentimento', 'Sobrenome',
  'Matéria da escola', 'Item de papelaria', 'Rede social', 'Youtuber ou influencer',
  'Banda de rock', 'Ritmo musical', 'Dança', 'Feriado ou data comemorativa', 'Signo ou planeta',
  'Mitologia', 'Arma medieval', 'Item de acampamento', 'O que tem na geladeira',
  'O que tem no banheiro', 'O que tem na mochila', 'Motivo pra chegar atrasado',
  'Desculpa pra não ir na festa', 'Presente de aniversário', 'Nome de bebê', 'Pizza (sabor)',
  'Salgadinho de festa', 'Prato de restaurante', 'Vilão de filme', 'Personagem de videogame'
];

// Cronômetro do Tapple: 10 s por vez. Encurtável por env pra teste.
const TEMPO_MS = Number(process.env.TAPPLE_TEMPO_MS) || 10000;
const PONTOS_VITORIA = 5;

function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function novaPartida(room, starter = 0) {
  room.scores = [0, 0];
  room.starter = starter;
  room.rodadaN = 0;
  room.baralho = embaralhar(CATEGORIAS);
  room.winner = null;
  novaRodada(room);
}

function novaRodada(room) {
  if (!room.baralho.length) room.baralho = embaralhar(CATEGORIAS);
  room.rodadaN++;
  room.round = {
    n: room.rodadaN,
    categoria: room.baralho.pop(),
    usadas: [],
    ultima: null,
    turn: room.starter,
    winner: null,
    loser: null,
    motivo: null
  };
  room.restante = TEMPO_MS;
  room.phase = 'playing';
}

// Quem está na vez fala a palavra e toca a letra. A letra sai da roleta e a vez passa.
function jogarLetra(room, idx, letra) {
  const r = room.round;
  if (room.phase !== 'playing') return { ok: false, error: 'Não é hora de jogar.' };
  if (r.turn !== idx) return { ok: false, error: 'Não é sua vez.' };
  letra = String(letra || '').toUpperCase();
  if (!LETRAS.includes(letra)) return { ok: false, error: 'Letra não existe na roleta.' };
  if (r.usadas.includes(letra)) return { ok: false, error: 'Letra já usada.' };

  r.usadas.push(letra);
  r.ultima = letra;
  if (r.usadas.length === LETRAS.length) {
    // Roleta inteira apertada: os dois sobrevivem, ninguém pontua.
    r.motivo = 'roleta';
    room.phase = 'round_over';
  } else {
    r.turn = 1 - idx;
    room.restante = TEMPO_MS;
  }
  return { ok: true };
}

// Estourou o relógio: quem estava na vez perde a rodada, o outro pontua.
function estourar(room) {
  const r = room.round;
  if (room.phase !== 'playing') return;
  r.loser = r.turn;
  r.winner = 1 - r.turn;
  r.motivo = 'tempo';
  room.scores[r.winner]++;
  if (room.scores[r.winner] >= PONTOS_VITORIA) {
    room.phase = 'finished';
    room.winner = r.winner;
  } else {
    room.phase = 'round_over';
  }
}

// Rodada seguinte: quem começa alterna, pra ninguém abrir sempre com a roleta cheia.
function proximaRodada(room) {
  if (room.phase !== 'round_over') return false;
  room.starter = 1 - room.starter;
  novaRodada(room);
  return true;
}

module.exports = { LETRAS, CATEGORIAS, TEMPO_MS, PONTOS_VITORIA, novaPartida, novaRodada, jogarLetra, estourar, proximaRodada };
