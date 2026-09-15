/* As duas portas do "+ Livro novo" (foto da capa e digitar na mão), e a
   lista dos volumes na ordem em que foram cadastrados, com o nicho de
   cada um à vista.
   npm i playwright; CHROME=/caminho/do/chrome node cadastro.teste.js */
const { chromium } = require("playwright");

const CLAUDE = `
  window.__db = {};
  window.claude = { use: function(nome){
    return new Promise(function(res){ setTimeout(function(){
      if (nome === "sample"){
        var s = function(){ return Promise.resolve({ text:"" }); };
        s.json = function(pedido, op){
          if (/A foto é a capa/.test(pedido)){
            return Promise.resolve({ titulo: "Nó Mestre", autor: "Tamara Klink",
              editora: "Companhia das Letras", ano: "2021", confianca: "alta",
              nicho: "C4P4", porque: "Brasil contemporâneo.",
              sinopse: "A travessia do Atlântico sozinha.", gostar: "Prosa seca.", aviso: null });
          }
          return Promise.resolve({ titulo:"", confianca:"baixa", nicho:"C5P4", aviso:"" });
        };
        s.limits = function(){ return Promise.resolve({ images: { maxCount: 4, mediaTypes: ["image/png"] } }); };
        res(s);
      } else if (nome === "db"){
        var ouvintes = {};
        res({ doc: function(c){ return {
                set: function(v){ window.__db[c] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
                delete: function(){ delete window.__db[c]; return Promise.resolve(); } }; },
              collection: function(n){ return { onSnapshot: function(fn){ ouvintes[n] = fn;
                fn({ docs: [], docChanges: function(){ return []; } }); return function(){}; } }; } });
      } else res(null);
    }, 10); });
  } };`;

(async () => {
  const foto = require("os").tmpdir() + "/capa-teste.png";
  require("fs").writeFileSync(foto, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"));
  const nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const ctx = await nav.newContext({ viewport: { width: 460, height: 900 } });
  await ctx.addInitScript(CLAUDE);
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push(e.message));
  await pag.goto("file://" + __dirname + "/index.html", { waitUntil: "domcontentloaded" });
  await pag.waitForSelector(".item");

  /* ---- 1. o botão do código saiu da barra ---- */
  if (await pag.$("#b-codigo")) throw new Error("o botão do código continua na barra de filtros");
  console.log("a barra de filtros tem:",
    (await pag.$$eval(".filtros .pilula", e => e.filter(x => !x.hidden).map(x => x.textContent.trim()))).join(" · "));

  /* ---- 2. as portas do "+ Livro novo" ---- */
  await pag.click("#b-novo");
  await pag.waitForSelector(".escolhas");
  const portas = await pag.$$eval(".escolha b", e => e.map(x => x.textContent.trim()));
  console.log("portas:", portas.join(" | "));
  if (portas[0] !== "Fotografar a capa" || portas[1] !== "Digitar na mão")
    throw new Error("as duas portas principais mudaram de ordem ou de nome");

  /* digitar na mão ---- */
  await pag.click("#q-mao");
  await pag.waitForSelector("#n-titulo");
  await pag.fill("#n-titulo", "Livro escrito à mão");
  await pag.fill("#n-autor", "Autora de Teste");
  await pag.selectOption("#n-nicho", "C1P1");
  await pag.click("#n-salvar");
  await pag.waitForSelector(".item", { timeout: 8000 });
  console.log("digitado na mão: guardado");

  /* fotografar a capa ---- */
  await pag.click("#f-limpar");
  await pag.click("#b-novo");
  await pag.waitForSelector("#q-foto");
  const [escolha] = await Promise.all([
    pag.waitForEvent("filechooser"),
    pag.click("#q-foto")
  ]);
  await escolha.setFiles(foto);
  await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
  console.log("pela capa:", (await pag.textContent(".c-achado h3")).trim(),
    "| nicho:", await pag.inputValue("#c-nicho"));
  await pag.click("#c-guardar");
  await pag.waitForSelector(".recado", { timeout: 8000 });
  await pag.click("#c-fechar");

  /* ---- 3. a ordem de cadastro, com o nicho à vista ---- */
  await pag.click("#f-recentes");
  await pag.waitForSelector(".grupo h2", { timeout: 8000 });
  console.log("cabeçalho:", (await pag.textContent(".grupo h2")).replace(/\s+/g, " ").trim());
  const titulos = await pag.$$eval(".item .tit", e => e.map(x => x.textContent.trim()));
  const nichos = await pag.$$eval(".item .sinal.nicho", e => e.map(x => x.textContent.trim()));
  console.log("na ordem:", titulos.map((t, i) => t + " → " + (nichos[i] || "?")).join("  ·  "));
  if (titulos[0] !== "Nó Mestre") throw new Error("o mais recente não veio primeiro: " + titulos[0]);
  if (!/C4P4/.test(nichos[0] || "")) throw new Error("o nicho não aparece na linha");
  if (titulos.length !== 2) throw new Error("a lista devia trazer só os cadastrados depois");
  const grupos = await pag.$$eval(".grupo", e => e.length);
  if (grupos !== 1) throw new Error("a ordem de cadastro não pode quebrar por nicho");

  /* sai do modo recente ---- */
  await pag.click("#f-recentes");
  await pag.waitForTimeout(300);
  if (await pag.$(".item .sinal.nicho")) throw new Error("o crachá do nicho ficou fora do modo recente");
  console.log("voltou à lista por nicho: ok");

  if (erros.length){ console.log("ERROS:", erros); process.exitCode = 1; }
  await nav.close();
  if (!process.exitCode) console.log("\ncadastro e ordem recente, tudo certo");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
