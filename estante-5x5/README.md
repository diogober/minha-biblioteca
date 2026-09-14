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
2. Sem câmera disponível, dá para fotografar o código ou digitar o
   número; se as barras não saírem legíveis na foto, o Claude lê os
   algarismos impressos. A página distingue os dois motivos de a câmera
   não abrir — o quadro em que ela roda não liberar a câmera (pela
   política de permissões do documento, e aí não há ajuste que resolva)
   ou o navegador ter bloqueado o site — e só ensina a liberar quando
   liberar adianta.
3. Com o ISBN em mãos, o Claude identifica o volume — a foto do momento
   vai junto, quando a visualização deixa mandar imagem — e escolhe o
   nicho olhando o que já está guardado em cada um. Volta título, autor,
   editora, ano, sinopse e o porquê do nicho. O número sozinho é pista
   fraca (a numeração do ISBN não guarda o título, e a página não
   alcança catálogo nenhum): quando não dá para reconhecer, a ficha pede
   o título e o Claude completa o resto a partir dele.
4. A ficha aparece para conferência (com aviso se o livro já estiver na
   estante) e um toque guarda. Marcando "guardar sozinho", volume
   reconhecido com confiança alta e sem repetição entra direto, com
   "desfazer" à mão, e a câmera volta para o próximo.
