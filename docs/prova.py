# Prova a 390px: dois celulares, criar/entrar, letra, estouro, F5 no meio, revanche.
import sys, time, json
from playwright.sync_api import sync_playwright
PORTA_CDP = int(sys.argv[1]); URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:3100'
OUT = sys.argv[3] if len(sys.argv) > 3 else 'docs/shots'
TEMPO = 12 if 'onrender' in URL else 4  # produção tem 10 s de relógio
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f'http://127.0.0.1:{PORTA_CDP}')
    # Um contexto por celular: localStorage separado, senão o 2º senta na cadeira do 1º pelo token.
    def cel():
        pg = b.new_context().new_page(); pg.set_viewport_size({'width': 390, 'height': 780}); return pg
    a, c = cel(), cel()
    erros = []
    for pg in (a, c): pg.on('pageerror', lambda e: erros.append(str(e))); pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    a.goto(URL); a.wait_for_timeout(600)
    a.screenshot(path=f'{OUT}/01-lobby.png')
    a.click('text=Criar sala'); a.wait_for_selector('#waiting.active'); a.wait_for_timeout(300)
    code = a.inner_text('#roomCodeDisplay').strip()
    a.screenshot(path=f'{OUT}/02-espera.png')
    c.goto(f'{URL}/?sala={code}'); c.wait_for_selector('#game.active'); a.wait_for_selector('#game.active'); a.wait_for_timeout(400)
    cat = a.inner_text('#cat')
    a.screenshot(path=f'{OUT}/03-a-minha-vez.png'); c.screenshot(path=f'{OUT}/03-c-vez-dele.png')
    assert 'minha-vez' in a.get_attribute('#roleta', 'class') and 'minha-vez' not in c.get_attribute('#roleta', 'class')
    a.click('.tecla[data-l="M"]'); c.wait_for_timeout(300)
    assert 'usada' in a.get_attribute('.tecla[data-l="M"]', 'class')
    c.click('.tecla[data-l="A"]'); a.wait_for_timeout(300)
    a.click('.tecla[data-l="S"]'); c.wait_for_timeout(300)
    a.screenshot(path=f'{OUT}/04-a-3-letras.png'); c.screenshot(path=f'{OUT}/04-c-3-letras-minha-vez.png')
    # F5 no meio da vez do C: volta na mesma rodada com as mesmas letras e o relógio andando
    c.reload(); c.wait_for_selector('#game.active'); c.wait_for_timeout(500)
    assert c.inner_text('#cat') == cat and 'usada' in c.get_attribute('.tecla[data-l="S"]', 'class')
    assert 'minha-vez' in c.get_attribute('#roleta', 'class')
    c.screenshot(path=f'{OUT}/05-c-apos-f5.png')
    # Deixa estourar (TEMPO_MS local = 1 s)
    a.wait_for_selector('#overlay.show', timeout=TEMPO*1000); c.wait_for_selector('#overlay.show')
    assert a.inner_text('#ptsEu') == '1' and c.inner_text('#ptsEle') == '1'
    a.screenshot(path=f'{OUT}/06-a-ponto-seu.png'); c.screenshot(path=f'{OUT}/06-c-tempo-esgotado.png')
    c.click('#cartaBtn'); a.wait_for_timeout(400)
    assert a.inner_text('#rodadaN') == '2' and 'minha-vez' in c.get_attribute('#roleta', 'class')
    # Corre até 5 x 0: A sempre responde e C sempre deixa estourar (ou vice-versa alternando quem abre)
    for i in range(4):
        # quem está na vez toca uma letra até C ficar na vez e estourar
        for _ in range(3):
            if 'minha-vez' in a.get_attribute('#roleta', 'class'):
                livre = a.query_selector('.tecla:not(.usada)').get_attribute('data-l'); a.click(f'.tecla[data-l="{livre}"]'); a.wait_for_timeout(250)
            else: break
        a.wait_for_selector('#overlay.show', timeout=TEMPO*1000); a.wait_for_timeout(200)
        if a.inner_text('#cartaBtn') == 'Revanche': break
        a.click('#cartaBtn'); a.wait_for_timeout(400)
    a.screenshot(path=f'{OUT}/07-a-venceu.png'); c.screenshot(path=f'{OUT}/07-c-perdeu.png')
    assert a.inner_text('#cartaT') == 'Você venceu!' and c.inner_text('#cartaT') == 'Você perdeu'
    a.click('#cartaBtn'); c.wait_for_timeout(400)
    assert a.inner_text('#ptsEu') == '0' and a.inner_text('#rodadaN') == '1'
    c.screenshot(path=f'{OUT}/08-c-revanche.png')
    print(json.dumps({'sala': code, 'categoria': cat, 'erros_console': erros}, ensure_ascii=False))
    a.close(); c.close()
