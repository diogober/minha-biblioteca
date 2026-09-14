/* A capa como caminho de entrada: a foto vai ao Claude, que lê o que
   está escrito nela. E o que acontece quando a visualização não deixa a
   foto passar.
   npm i playwright; CHROME=/caminho/do/chrome node capa.teste.js */
const { chromium } = require("playwright");
const fs = require("fs");

/* um PNG qualquer serve: quem "lê" a capa no teste é o Claude de mentira */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

function claudeDeMentira(passaImagem){
  return `
  window.__perguntas = [];
  window.claude = { use: function(nome){
    return new Promise(function(res){ setTimeout(function(){
      if (nome === "sample"){
        var s = function(){ return Promise.resolve({ text:"" }); };
        s.json = function(pedido, op){
          var imagens = (op && op.images || []).length;
          window.__perguntas.push({ pedido: pedido, imagens: imagens });
          if (imagens && !${passaImagem}){
            var e = new Error("sem imagem aqui"); e.code = "images_unavailable";
            return Promise.reject(e);
          }
          if (/A foto é a capa/.test(pedido)){
            return Promise.resolve({ titulo: "Grande Sertão: Veredas",
              autor: "João Guimarães Rosa", editora: "Companhia das Letras", ano: "2019",
              confianca: "alta", nicho: "C4P2", porque: "Brasil e Portugal, onde mora Rosa.",
              sinopse: "Riobaldo conta a travessia e o pacto.",
              gostar: "A língua inteira reinventada.", aviso: null });
          }
          if (/o título é/.test(pedido)){
            return Promise.resolve({ titulo: "Grande Sertão: Veredas",
              autor: "João Guimarães Rosa", editora: "Companhia das Letras",
              confianca: "media", nicho: "C4P2", porque: "Pelo título.",
              sinopse: "Riobaldo conta a travessia.", gostar: "Vale.", aviso: null });
          }
          return Promise.resolve({ titulo:"", confianca:"baixa", nicho:"C5P4",
            porque:"", sinopse:"", gostar:"", aviso:"Não reconheci o número." });
        };
        s.limits = function(){ return Promise.resolve(${passaImagem}
          ? { images: { maxCount: 4, mediaTypes: ["image/png"] } } : {}); };
        res(s);
      } else if (nome === "db"){
        window.__db = window.__db || {};
        res({ doc: function(c){ return { set: function(v){ window.__db[c]=v; return Promise.resolve(); },
               delete: function(){ delete window.__db[c]; return Promise.resolve(); } }; },
              collection: function(){ return { onSnapshot: function(fn){
                fn({ docs: [], docChanges: function(){ return []; } }); return function(){}; } }; } });
      } else res(null);
    }, 10); });
  } };`;
}

async function cena(nav, passaImagem, teste){
  const ctx = await nav.newContext({ viewport: { width: 460, height: 900 } });
  await ctx.addInitScript(claudeDeMentira(passaImagem));
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push(e.message));
  await pag.goto("file://" + __dirname + "/index.html", { waitUntil: "domcontentloaded" });
  await pag.waitForSelector(".item");
  await teste(pag);
  if (erros.length) throw new Error("erro na página: " + erros[0]);
  await ctx.close();
}

(async () => {
  const foto = require("os").tmpdir() + "/capa-teste.png";
  fs.writeFileSync(foto, PNG);
  const nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });

  /* ---- 1. onde a foto passa: a capa identifica o livro ---- */
  await cena(nav, true, async pag => {
    await pag.click("#b-codigo");
    /* no navegador de teste não há câmera, então a tela que aparece é a
       que explica isso — e é lá que o botão da capa tem de estar */
    await pag.waitForSelector(".c-fora #c-capa3", { state: "attached", timeout: 10000 });
    await pag.setInputFiles(".c-fora #c-capa3", foto);
    await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
    const titulo = (await pag.textContent(".c-achado h3")).trim();
    const nicho = await pag.inputValue("#c-nicho");
    const perg = await pag.evaluate(() => window.__perguntas[0]);
    console.log("pela capa:", titulo, "| nicho:", nicho, "| imagens enviadas:", perg.imagens);
    if (titulo !== "Grande Sertão: Veredas") throw new Error("não identificou pela capa");
    if (nicho !== "C4P2") throw new Error("não usou o nicho da capa");
    if (perg.imagens !== 1) throw new Error("não mandou a foto");
    if (!/A foto é a capa/.test(perg.pedido)) throw new Error("não pediu leitura da capa");
    await pag.click("#c-guardar");
    await pag.waitForSelector(".recado", { timeout: 8000 });
    console.log("guardado:", (await pag.textContent(".recado")).replace(/\s+/g," ").trim());
  });

  /* ---- 2. onde a foto não passa: diz por que, e oferece o título ---- */
  await cena(nav, false, async pag => {
    await pag.click("#b-codigo");
    await pag.waitForSelector(".c-fora #c-capa3", { state: "attached", timeout: 10000 });
    await pag.setInputFiles(".c-fora #c-capa3", foto);
    await pag.waitForSelector(".c-fora h3", { timeout: 15000 });
    const titulo = (await pag.textContent(".c-fora h3")).trim();
    console.log("sem imagem:", titulo);
    if (!/não deixa a foto chegar/.test(titulo))
      throw new Error("não explicou que a foto não passou: " + titulo);
    const conversa = await pag.textContent(".c-chat");
    console.log("saída sem digitar:", conversa.replace(/\s+/g, " ").trim().slice(0, 90) + "…");
    if (!/mande a foto do livro na conversa/.test(conversa))
      throw new Error("não ofereceu o caminho da conversa");
    await pag.fill("#c-tit2", "Grande Sertão: Veredas");
    await pag.click("#c-portitulo2");
    await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
    console.log("pelo título, então:", (await pag.textContent(".c-achado h3")).trim(),
      "| nicho:", await pag.inputValue("#c-nicho"));
  });

  await nav.close();
  console.log("\ncapa, tudo certo");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
