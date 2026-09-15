/* Testa a página de verdade num Chromium (npm i playwright; CHROME=… se
   o navegador estiver fora do lugar de sempre): finge o window.claude (db,
   sample, assets), entra pelo botão de leitura, digita um ISBN, confere a
   ficha que o "Claude" devolveu, guarda e verifica que o livro entrou na
   estante e no banco. Também testa a leitura de uma foto de código de
   barras desenhada na hora. */
const { chromium } = require("playwright");

/* o leitor agora mora dentro de "+ Livro novo" */
async function abrirLeitor(pag){
  await pag.click("#b-novo");
  await pag.waitForSelector("#q-codigo", { timeout: 8000 });
  await pag.click("#q-codigo");
}
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;

/* ---- desenha um PNG de código de barras EAN-13 (sem biblioteca) ---- */
function pngEAN(codigo, escala = 4, altura = 120, margem = 30) {
  const DIG = [[3,2,1,1],[2,2,2,1],[2,1,2,2],[1,4,1,1],[1,1,3,2],
               [1,2,3,1],[1,1,1,4],[1,3,1,2],[1,2,1,3],[3,1,1,2]];
  const PAR = ["000000","001011","001101","001110","010011",
               "011001","011100","010101","010110","011010"];
  const ds = codigo.split("").map(Number);
  const barras = (c, pretoPrimeiro) => {
    let s = "", cor = pretoPrimeiro ? "1" : "0";
    for (const n of c) { s += cor.repeat(n); cor = cor === "1" ? "0" : "1"; }
    return s;
  };
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    let p = DIG[ds[i]];
    if (PAR[ds[0]][i-1] === "1") p = p.slice().reverse();
    bits += barras(p, false);
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += barras(DIG[ds[i]], true);
  bits += "101";

  const larg = bits.length * escala + margem * 2, alt = altura;
  const linhas = [];
  for (let y = 0; y < alt; y++) {
    const linha = Buffer.alloc(larg * 3, 255);
    for (let x = 0; x < larg; x++) {
      const i = Math.floor((x - margem) / escala);
      if (i >= 0 && i < bits.length && bits[i] === "1") {
        linha[x*3] = 20; linha[x*3+1] = 20; linha[x*3+2] = 20;
      }
    }
    linhas.push(Buffer.concat([Buffer.from([0]), linha]));
  }
  const cru = Buffer.concat(linhas);
  const zlib = require("zlib");
  const idat = zlib.deflateSync(cru);
  const crcTab = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const v of b) c = crcTab[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const pedaco = (tipo, dados) => {
    const t = Buffer.from(tipo, "ascii");
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(larg, 0); ihdr.writeUInt32BE(alt, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pedaco("IHDR", ihdr), pedaco("IDAT", idat), pedaco("IEND", Buffer.alloc(0))
  ]);
}

const FINGE_CLAUDE = `
  window.__db = {};
  window.__perguntas = [];
  window.claude = {
    use: function(nome){
      return new Promise(function(res){
        setTimeout(function(){
          if (nome === "db"){
            var ouvintes = {};
            var api = {
              doc: function(cam){ return {
                set: function(v){ window.__db[cam] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
                delete: function(){ delete window.__db[cam]; return Promise.resolve(); }
              }; },
              collection: function(nome){ return {
                onSnapshot: function(fn){ ouvintes[nome] = fn; fn({ docs: [], docChanges: function(){ return []; } }); return function(){}; }
              }; }
            };
            res(api);
          } else if (nome === "sample"){
            var s = function(){ return Promise.resolve({ text: "", truncated: false }); };
            s.json = function(pedido, op){
              window.__perguntas.push({ pedido: pedido, temImagem: !!(op && op.images) });
              if (/Leia os\\s+algarismos/.test(pedido) || /algarismos impressos/.test(pedido)){
                return Promise.resolve({ isbn: "9788535914849" });
              }
              if (/9788593828126/.test(pedido)){
                return Promise.resolve({ titulo: "A vida invisível de Eurídice Gusmão",
                  autor: "Martha Batalha", editora: "Companhia das Letras", ano: "2016",
                  confianca: "alta", nicho: "C4P4",
                  porque: "Romance brasileiro contemporâneo, como o resto do nicho.",
                  sinopse: "Duas irmãs no Rio dos anos 1940.", gostar: "Curto e afiado.", aviso: null });
              }
              return new Promise(function(ok){ setTimeout(function(){ ok({
                titulo: "Crime e Castigo", autor: "Fiódor Dostoiévski",
                editora: "Todavia", ano: "2019", idioma: "português",
                confianca: window.__confianca || "alta",
                nicho: "C1P4", porque: "É Dostoiévski, e o nicho C1P4 é só dele.",
                sinopse: "Um estudante mata uma velha agiota e passa o resto do livro sendo perseguido pela própria consciência.",
                gostar: "O melhor romance já escrito sobre culpa.",
                aviso: null }); }, 30); });
            };
            s.limits = function(){ return Promise.resolve({ images: { maxCount: 4, mediaTypes: ["image/jpeg","image/png"] } }); };
            res(s);
          } else if (nome === "assets"){
            res({ upload: function(){ return Promise.reject(new Error("sem anexos no teste")); },
                  delete: function(){ return Promise.resolve(); } });
          } else res(null);
        }, 10);
      });
    }
  };
`;

(async () => {
  const codigo = "9788535914849";
  const png = pngEAN(codigo);
  const fotoPath = require("os").tmpdir() + "/codigo-teste.png";
  fs.writeFileSync(fotoPath, png);

  const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await navegador.newContext({ viewport: { width: 900, height: 780 } });
  await ctx.addInitScript(FINGE_CLAUDE);
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push("pageerror: " + e.message));
  pag.on("console", m => { if (m.type() === "error") erros.push("console: " + m.text()); });

  await pag.goto("file://" + path.join(RAIZ, "index.html"));
  await pag.waitForSelector(".item");
  const totalAntes = await pag.$$eval(".item", e => e.length);
  console.log("volumes na lista:", totalAntes);

  /* ---- 1. digitar o ISBN ---- */
  await abrirLeitor(pag);
  await pag.waitForSelector(".leitor");
  await pag.click("#c-digitar");
  await pag.fill("#c-num", "978-85-359-1484-9");
  await pag.click("#c-ok");
  await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
  const achado = await pag.textContent(".c-achado h3");
  const nicho = await pag.inputValue("#c-nicho");
  const porque = await pag.textContent(".c-porque");
  console.log("identificou:", achado, "| nicho sugerido:", nicho, "|", porque.trim());
  if (achado !== "Crime e Castigo") throw new Error("não mostrou o título identificado");
  if (nicho !== "C1P4") throw new Error("não pré-selecionou o nicho sugerido");

  const perg = await pag.evaluate(() => window.__perguntas[0].pedido);
  if (!/C1P4 — Dostoiévski/.test(perg)) throw new Error("o retrato da estante não foi ao Claude");
  if (!/9788535914849/.test(perg)) throw new Error("o ISBN não foi ao Claude");

  await pag.click("#c-guardar");
  await pag.waitForSelector(".recado");
  console.log("recado:", (await pag.textContent(".recado")).replace(/\\s+/g, " ").trim());
  await pag.click("#c-fechar");

  const guardado = await pag.evaluate(() => {
    const ch = Object.keys(window.__db).filter(k => k.startsWith("novos/"));
    return ch.map(k => window.__db[k]).concat(
      Object.keys(window.__db).filter(k => k.startsWith("estado/")).map(k => window.__db[k]));
  });
  console.log("gravado no banco:", JSON.stringify(guardado));
  if (!guardado.some(r => r.t === "Crime e Castigo" && r.n === "C1P4" && r.isbn === codigo))
    throw new Error("não gravou o registro no banco");
  if (!guardado.some(r => r.sinopse))
    throw new Error("não gravou a sinopse");

  /* o volume aparece na lista e na ficha */
  await pag.fill("#busca", "Crime e Castigo");
  await pag.waitForTimeout(400);
  const naLista = await pag.$$eval('.item[data-id^="novo-"] .tit', e => e.map(x => x.textContent));
  if (!naLista.includes("Crime e Castigo")) throw new Error("não entrou na lista como volume novo");
  await pag.click('.item[data-id^="novo-"]');
  await pag.waitForSelector(".painel h2");
  const tags = await pag.textContent(".painel .tags");
  const sinopse = await pag.textContent(".painel .secao p");
  console.log("ficha:", tags.replace(/\\s+/g," ").trim(), "|", sinopse.slice(0, 60) + "…");
  if (!/ISBN 9788535914849/.test(tags)) throw new Error("a ficha não mostra o ISBN");
  if (!/agiota/.test(sinopse)) throw new Error("a ficha não mostra a sinopse do Claude");
  await pag.click("#p-fechar");

  /* ---- 2. ler o código de uma foto ---- */
  await abrirLeitor(pag);
  await pag.waitForSelector(".leitor");
  await pag.waitForSelector("#c-foto, #c-foto2", { state: "attached", timeout: 5000 });
  const entrada = (await pag.$("#c-foto")) || (await pag.$("#c-foto2"));
  await entrada.setInputFiles(fotoPath);
  await pag.waitForSelector(".c-achado h3", { timeout: 15000 });
  const isbnLido = await pag.textContent(".c-isbn");
  console.log("lido da foto:", isbnLido);
  if (!/978-8-5359-1484-9/.test(isbnLido)) throw new Error("não leu o código da foto: " + isbnLido);

  /* aviso de duplicata, já que o mesmo livro foi guardado ---- */
  const dup = await pag.$(".c-achado .aviso");
  if (!dup) throw new Error("não avisou que o livro já está na estante");
  console.log("duplicata:", (await dup.textContent()).replace(/\\s+/g," ").trim());
  await pag.click("#c-fechar");

  /* ---- 3a. "guardar sozinho" não guarda sozinho o que já está lá ---- */
  await pag.evaluate(() => { const r = document.querySelector(".recado"); if (r) r.remove(); });
  await abrirLeitor(pag);
  await pag.waitForSelector(".leitor");
  await pag.check("#c-sozinho");
  await pag.click("#c-digitar");
  await pag.fill("#c-num", "9788535914849");
  await pag.click("#c-ok");
  await pag.waitForSelector(".c-achado .aviso", { timeout: 15000 });
  if (await pag.$(".recado")) throw new Error("guardou sozinho um livro repetido");
  console.log("repetido no modo sozinho: pediu confirmação, como deve");

  /* ---- 3b. livro novo: guarda sozinho ---- */
  await pag.click("#c-outro");
  await pag.click("#c-digitar");   /* o botão do alto, que nunca é repintado */
  await pag.fill("#c-num", "9788593828126");
  await pag.click("#c-ok");
  await pag.waitForSelector(".recado", { timeout: 15000 });
  console.log("sozinho:", (await pag.textContent(".recado")).replace(/\s+/g," ").trim());
  const conta = await pag.textContent("#c-conta");
  if (!/1 livro guardado/.test(conta)) throw new Error("não contou o livro guardado: " + conta);
  if (!/C4P4/.test(await pag.textContent(".recado"))) throw new Error("não usou o nicho sugerido");

  /* desfazer ---- */
  const antesDesfazer = await pag.evaluate(() =>
    Object.keys(window.__db).filter(k => k.startsWith("novos/")).length);
  await pag.click(".recado [data-desfazer]");
  const sobrou = await pag.evaluate(() =>
    Object.keys(window.__db).filter(k => k.startsWith("novos/")).length);
  if (sobrou !== antesDesfazer - 1) throw new Error("desfazer não retirou o volume");
  console.log("desfazer: ok (" + antesDesfazer + " → " + sobrou + ")");
  await pag.click("#c-fechar");

  /* ---- 4. sem o Claude e sem banco: a página vira posto de leitura ---- */
  const pag2 = await ctx.newPage();
  await pag2.addInitScript(`window.claude = { use: function(){ return Promise.resolve(null); } };`);
  await pag2.goto("file://" + path.join(RAIZ, "index.html"));
  await pag2.waitForSelector(".item");
  await pag2.evaluate(() => localStorage.removeItem("estante-fila-codigos"));
  await abrirLeitor(pag2);
  await pag2.click("#c-digitar");
  await pag2.fill("#c-num", "9788535914849");
  await pag2.click("#c-ok");
  await pag2.waitForFunction(
    () => /na fila|código lido/.test(document.querySelector("#c-conta")?.textContent || ""),
    { timeout: 10000 });
  const guardadoNaFila = await pag2.evaluate(() => localStorage.getItem("estante-fila-codigos"));
  console.log("sem Claude, o código vai para a fila:", guardadoNaFila);
  if (!/9788535914849/.test(guardadoNaFila || ""))
    throw new Error("não enfileirou o código onde não há como cadastrar");

  /* ---- 5. número inválido ---- */
  await pag2.click("#c-digitar");
  await pag2.fill("#c-num", "9788535914840");
  await pag2.click("#c-ok");
  const erro = await pag2.textContent("#c-erro");
  console.log("número torto:", erro);
  if (!/verificação/.test(erro)) throw new Error("aceitou um ISBN inválido");

  /* erro de rede é a caixa de areia barrando CDN e fontes, não a página */
  const graves = erros.filter(e => !/Failed to load resource/.test(e));
  if (graves.length) { console.log("\nERROS NO CONSOLE:"); graves.forEach(e => console.log(" -", e)); }
  await navegador.close();
  if (graves.length) process.exitCode = 1;
  else console.log("\ntudo certo");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
