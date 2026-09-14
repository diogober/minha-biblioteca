# Estante 5 × 5

Fonte do artefato publicado em
<https://claude.ai/artifact/7aiuNwwF4oy7LQLCwF6t3R>.

- `index.html` — a página (o artefato publicado é este arquivo; o
  `<!doctype>`, o `<html>` e o `<head>` são acrescentados na publicação).
- `dados.js` — o acervo, os nichos e as sinopses.
- `leitor-ean.teste.js` — testes do leitor de código de barras, rodados
  contra o módulo que está dentro do `index.html` (`node
  leitor-ean.teste.js`): códigos sintéticos com borrão, ruído, luz
  torta, livro de cabeça para baixo, celular deitado, e a garantia de
  que ruído puro nunca vira um código.
- `aba-avulsa.teste.js` — o posto de leitura: a aba lê sem parar e
  enfileira, e a estante dentro do quadro recolhe a fila e cadastra
  (usa `quadro.teste.html`, que põe a estante dentro de um quadro como o
  aplicativo faz). Precisa da página servida por http.
- `capa.teste.js` — identificação pela foto da capa: onde a imagem
  passa, e onde não passa (aí tem de explicar e oferecer o título).
- `sem-foto.teste.js` — o caso do ISBN desconhecido numa visualização
  que não manda imagem: o pedido não pode prometer foto que não vai, e a
  ficha tem de oferecer o caminho do título.
- `camera-negada.teste.js` — testes do recado que aparece quando a câmera
  não abre: quadro sem permissão de câmera, usuário que negou, aparelho
  sem câmera.
- `pagina.teste.js` / `camera.teste.js` — testes da página num Chromium,
  com o `window.claude` de mentira (`npm i playwright`, depois `node
  pagina.teste.js`). O da câmera precisa da página servida por http
  (`python3 -m http.server 8731` neste diretório) porque o navegador só
  entrega câmera em origem segura; `CHROME=/caminho/do/chrome` se o
  navegador estiver fora do lugar de sempre.

## Leitura do código de barras

Cadastro de livro novo pelo código de barras da contracapa:

1. A câmera lê o EAN-13 sem biblioteca externa — a política de conteúdo
   do artefato barra requisições de rede, então o símbolo é decifrado
   aqui mesmo: varredura de linhas horizontais e verticais do quadro,
   limite de preto e branco calculado bloco a bloco (aguenta sombra de um
   lado e lâmpada do outro), bordas localizadas com fração de pixel
   (aguenta foto fora de foco) e o código só vale quando sai igual em
   duas linhas e em dois quadros diferentes — a soma de verificação
   sozinha deixa passar um erro em cada dez.
2. Dentro do aplicativo do Claude a estante roda num quadro que não
   entrega a câmera à página (permissão do aparelho não resolve: quem
   nega é o quadro). Para esse caso há o **posto de leitura**: o botão
   "Ler com a câmera numa aba" abre esta mesma página em aba própria,
   onde ela é dona da janela e o navegador pergunta pela câmera do jeito
   normal. Lá ela lê um livro atrás do outro sem parar e guarda os
   códigos numa fila (localStorage, mesma origem); de volta à estante, o
   botão vira "Cadastrar N códigos lidos" e cada um passa pela
   identificação de sempre. Se o navegador não deixar guardar nada, a
   aba mostra os números para copiar, e Digitar o número aceita vários
   colados de uma vez. Quem decide se a página é estante ou posto de
   leitura são as capacidades que responderem, não o formato da janela.
3. Sem câmera disponível, dá para fotografar o código ou digitar o
   número; se as barras não saírem legíveis na foto, o Claude lê os
   algarismos impressos. A página distingue os dois motivos de a câmera
   não abrir — o quadro em que ela roda não liberar a câmera (pela
   política de permissões do documento, e aí não há ajuste que resolva)
   ou o navegador ter bloqueado o site — e só ensina a liberar quando
   liberar adianta.
4. **Pela capa**, que é o caminho mais certeiro quando a visualização
   deixa a página mandar imagem ao Claude: a capa traz título e autor
   escritos, e ler o que está escrito é mais seguro do que reconhecer um
   número de cor. O botão "Fotografar a capa" aparece na barra da
   câmera, na tela de câmera indisponível e na ficha de um volume não
   reconhecido. Onde a imagem não passa, a recusa é explicada e o
   caminho do título fica ali mesmo.
5. Com o ISBN em mãos, o Claude identifica o volume — a foto do momento
   vai junto, quando a visualização deixa mandar imagem — e escolhe o
   nicho olhando o que já está guardado em cada um. Volta título, autor,
   editora, ano, sinopse e o porquê do nicho. O número sozinho é pista
   fraca (a numeração do ISBN não guarda o título, e a página não
   alcança catálogo nenhum): quando não dá para reconhecer, a ficha pede
   o título e o Claude completa o resto a partir dele.
6. A ficha aparece para conferência (com aviso se o livro já estiver na
   estante) e um toque guarda. Marcando "guardar sozinho", volume
   reconhecido com confiança alta e sem repetição entra direto, com
   "desfazer" à mão, e a câmera volta para o próximo.
