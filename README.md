# Tapple Online

Tapple pra dois jogadores no celular. Roleta de 23 letras (sem K, W, Y), carta de categoria no botão amarelo do centro, 10 segundos por vez. Quem está na vez fala a palavra e toca a letra; a letra sai da roleta e a vez passa. Estourou o relógio, o outro pontua. Primeiro a 5 pontos leva. Roleta inteira apertada é empate.

Mesmo esqueleto do Combate Online: Express + Socket.IO, 1 HTML, salas em memória com token que sobrevive ao F5 (queda de rede pausa o relógio), `node --test`, Render.

```bash
npm install
npm start                 # http://localhost:3000 (imprime o IP pro celular)
npm test                  # 10 testes: regras puras + 2 clientes reais
TAPPLE_TEMPO_MS=1000 npm start   # relógio curto pra prova
```

Prova a 390px em 2 celulares headless: `python3 docs/prova.py <porta-cdp>` (fotos em `docs/shots/`).

Deploy: Render Blueprint apontando pro repo (`render.yaml`).
