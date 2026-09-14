/* O caso do ISBN que o Claude não reconhece, numa visualização que não
   manda fotos: a página não pode prometer foto que não vai, e tem de
   oferecer o caminho do título.
   npm i playwright; CHROME=/caminho/do/chrome node sem-foto.teste.js */
const { chromium } = require("playwright");

const CLAUDE_SEM_IMAGEM = `
  window.__perguntas = [];
  window.claude = { use: function(nome){
    return new Promise(function(res){ setTimeout(function(){
      if (nome === "sample"){
        var s = function(){ return Promise.resolve({ text:"" }); };
        s.json = function(pedido, op){
          window.__perguntas.push({ pedido: pedido, imagens: (op && op.images || []).length });
          if (/o título é/.test(pedido)){
            return Promise.resolve({ titulo: "Torto arado", autor: "Itamar Vieira Junior",
              editora: "Todavia", ano: "2019", confianca: "alta", nicho: "C4P4",
              porque: "Brasil contemporâneo, como o resto do nicho.",
              sinopse: "Duas irmãs e uma foice no oeste da Bahia.",
              gostar: "A terra e a fala do sertão em primeira pessoa.", aviso: null });
          }
          return Promise.resolve({ titulo: "", autor: "", editora: "Companhia das Letras",
            ano: "", confianca: "baixa", nicho: "C5P4", porque: "Nicho livre até saber o que é.",
            sinopse: "", gostar: "", aviso: "O prefixo 8535 é da Companhia das Letras; me diga o título." });
        };
        /* esta visualização não manda imagem nenhuma */
        s.limits = function(){ return Promise.resolve({ maxInputBytes: 65536 }); };
        res(s);
      } else res(null);
    }, 10); });
  } };
`;

(async () => {
  const nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const ctx = await nav.newContext({ viewport: { width: 460, height: 900 } });
  await ctx.addInitScript(CLAUDE_SEM_IMAGEM);
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push(e.message));
  await pag.goto("file://" + __dirname + "/index.html", { waitUntil: "domcontentloaded" });
  await pag.waitForSelector(".item");

  await pag.click("#b-codigo");
  await pag.click("#c-digitar");
  await pag.fill("#c-num", "9788535944679");
  await pag.click("#c-ok");
  await pag.waitForSelector(".c-achado h3", { timeout: 15000 });

  const pedido = await pag.evaluate(() => window.__perguntas[0]);
  console.log("imagens enviadas:", pedido.imagens);
  if (pedido.imagens !== 0) throw new Error("mandou imagem onde não dá");
  if (/Vai junto a foto/.test(pedido.pedido))
    throw new Error("prometeu uma foto que não foi junto");
  if (!/não recebeu foto nenhuma/.test(pedido.pedido))
    throw new Error("não avisou o Claude de que não há foto");
  console.log("o pedido não promete foto: ok");

  const texto = await pag.textContent(".c-achado");
  if (!/Escreva o título como está na capa/.test(texto))
    throw new Error("não ofereceu o caminho do título");
  if (!/não consigo enxergar fotos/.test(texto))
    throw new Error("não explicou que esta visualização não manda fotos");
  /* o botão da capa continua à mão de propósito: o que o navegador diz
     sobre imagens nem sempre é verdade, e uma recusa explicada vale mais
     do que um caminho escondido (capa.teste.js cobre a recusa) */
  if (!(await pag.$("#c-capa"))) throw new Error("escondeu o caminho da capa");
  console.log("cartão do ISBN desconhecido: pede o título, sem prometer foto");

  /* escrever o título resolve */
  await pag.fill("#c-titulo", "Torto arado");
  await pag.click("#c-pelotitulo");
  await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
  const achado = (await pag.textContent(".c-achado h3")).trim();
  const nicho = await pag.inputValue("#c-nicho");
  console.log("pelo título:", achado, "| nicho:", nicho,
    "|", (await pag.textContent(".c-sinopse")).trim());
  if (achado !== "Torto arado") throw new Error("não identificou pelo título");
  if (nicho !== "C4P4") throw new Error("não usou o nicho sugerido pelo título");

  const segunda = await pag.evaluate(() => window.__perguntas[1].pedido);
  if (!/C4P4 — Brasil contemporâneo/.test(segunda)) throw new Error("não mandou os nichos");
  if (!/9788535944679/.test(segunda)) throw new Error("perdeu o ISBN pelo caminho");

  await pag.click("#c-guardar");
  await pag.waitForSelector(".recado");
  console.log("guardado:", (await pag.textContent(".recado")).replace(/\s+/g," ").trim());

  if (erros.length) { console.log("ERROS:", erros); process.exitCode = 1; }
  await nav.close();
  if (!process.exitCode) console.log("\nsem foto, tudo certo");
})().catch(async e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
