/* A foto tirada dentro do aplicativo, onde a imagem não chega ao Claude
   da página: ela tem de ficar guardada no banco da estante, encolhida o
   bastante para caber, para o Claude da conversa cadastrar de lá.
   npm i playwright; CHROME=/caminho/do/chrome node pendentes.teste.js */
const { chromium } = require("playwright");

/* o leitor agora mora dentro de "+ Livro novo" */
async function abrirLeitor(pag){
  await pag.click("#b-novo");
  await pag.waitForSelector("#q-codigo", { timeout: 8000 });
  await pag.click("#q-codigo");
}
const fs = require("fs");
const zlib = require("zlib");

/* uma "capa" de 1400x2000, colorida, para valer como foto de celular */
function pngGrande(w = 1400, h = 2000) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(w * 3);
    for (let x = 0; x < w; x++) {
      linha[x*3] = (x * 7 + y * 3) % 256;
      linha[x*3+1] = (y * 5) % 256;
      linha[x*3+2] = (x * 11) % 256;
    }
    linhas.push(Buffer.concat([Buffer.from([0]), linha]));
  }
  const idat = zlib.deflateSync(Buffer.concat(linhas), { level: 1 });
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    pedaco("IHDR", ihdr), pedaco("IDAT", idat), pedaco("IEND", Buffer.alloc(0))]);
}

/* o Claude da página recusa imagens, como no aplicativo; o banco aceita */
const CLAUDE = `
  window.__db = {};
  window.claude = { use: function(nome){
    return new Promise(function(res){ setTimeout(function(){
      if (nome === "sample"){
        var s = function(){ return Promise.resolve({ text:"" }); };
        s.json = function(pedido, op){
          if (op && op.images){
            var e = new Error("sem imagem aqui"); e.code = "images_unavailable";
            return Promise.reject(e);
          }
          return Promise.resolve({ titulo:"", confianca:"baixa", nicho:"C5P4", aviso:"" });
        };
        s.limits = function(){ return Promise.resolve({}); };
        res(s);
      } else if (nome === "db"){
        var ouvintes = {};
        res({
          doc: function(c){ return {
            set: function(v){ window.__db[c] = JSON.parse(JSON.stringify(v));
              if (ouvintes.pendentes) ouvintes.pendentes(instantaneo("pendentes"));
              return Promise.resolve(); },
            delete: function(){ delete window.__db[c];
              if (ouvintes.pendentes) ouvintes.pendentes(instantaneo("pendentes"));
              return Promise.resolve(); } }; },
          collection: function(nome){ return { onSnapshot: function(fn){
            ouvintes[nome] = fn; fn(instantaneo(nome)); return function(){}; } }; }
        });
        window.__avisar = function(col){ if (ouvintes[col]) ouvintes[col](instantaneo(col)); };
        function instantaneo(col){
          var docs = Object.keys(window.__db)
            .filter(function(k){ return k.indexOf(col + "/") === 0; })
            .map(function(k){ return { exists: true, id: k.slice(col.length + 1),
              data: function(){ return window.__db[k]; } }; });
          return { docs: docs, docChanges: function(){ return []; } };
        }
      } else res(null);
    }, 10); });
  } };`;

(async () => {
  const foto = require("os").tmpdir() + "/capa-grande.png";
  fs.writeFileSync(foto, pngGrande());
  console.log("foto de entrada:", (fs.statSync(foto).size / 1024).toFixed(0) + " KB");

  const nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const ctx = await nav.newContext({ viewport: { width: 460, height: 900 } });
  await ctx.addInitScript(CLAUDE);
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push(e.message));
  await pag.goto("file://" + __dirname + "/index.html", { waitUntil: "domcontentloaded" });
  await pag.waitForSelector(".item");

  await abrirLeitor(pag);
  await pag.waitForSelector(".c-fora #c-capa3", { state: "attached", timeout: 10000 });
  await pag.setInputFiles(".c-fora #c-capa3", foto);
  await pag.waitForSelector(".c-retrato", { timeout: 20000 });
  console.log("a página diz:", (await pag.textContent(".c-fora h3")).trim());

  const guardada = await pag.evaluate(() => {
    const k = Object.keys(window.__db).find(k => k.startsWith("pendentes/"));
    const d = k && window.__db[k];
    return d && { id: d.id, estado: d.estado, bytes: d.foto.length,
      tipo: d.foto.slice(0, 30), largura: d.largura, altura: d.altura };
  });
  console.log("guardada no banco:", JSON.stringify(guardada));
  if (!guardada) throw new Error("não guardou a foto no banco");
  if (guardada.bytes > 262144) throw new Error("a foto não cabe no documento: " + guardada.bytes);
  if (!/^data:image\/jpeg/.test(guardada.tipo)) throw new Error("não virou JPEG");
  if (guardada.estado !== "aguardando") throw new Error("estado errado");
  console.log("cabe no limite de 256 KB e está em JPEG: ok");

  /* segunda foto pelo botão "fotografar o próximo" */
  await pag.setInputFiles("#c-capa4", foto);
  await pag.waitForFunction(() => document.querySelectorAll(".c-retrato").length === 1
    && /2 fotos esperando/.test(document.querySelector(".c-chat")?.textContent || ""),
    { timeout: 20000 });
  console.log("segunda foto:", (await pag.textContent(".c-chat")).trim());

  await pag.click("#c-fim");
  await pag.waitForSelector("#b-pendentes:not([hidden])", { timeout: 8000 });
  console.log("aviso na estante:", (await pag.textContent("#b-pendentes")).trim());
  await pag.click("#b-pendentes");
  await pag.waitForSelector(".fotos img", { timeout: 8000 });
  console.log("galeria mostra", await pag.$$eval(".fotos img", e => e.length), "fotos");

  /* O balão de comentários do artefato pousa no canto de cima e pode tapar
     o Fechar de lá — e, se alguém comentar no próprio botão, o alfinete
     gruda nele. Então a saída principal tem de estar no corpo da página,
     acima das fotos, e o botão do alto não pode ter id que um comentário
     antigo reconheça. */
  if (!(await pag.$("#fp-sair2"))) throw new Error("não há saída no corpo da galeria");
  if (await pag.$("#fp-fechar")) throw new Error("o id que o comentário antigo ancorou voltou");
  const ordem = await pag.evaluate(() => {
    const corpo = document.querySelector("#fp-corpo");
    const saida = corpo.querySelector("#fp-sair2");
    const foto = corpo.querySelector(".fotos");
    return foto ? (saida.compareDocumentPosition(foto) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : true;
  });
  if (!ordem) throw new Error("a saída ficou depois das fotos");
  console.log("saída no corpo, antes das fotos: ok");

  /* o Claude cadastra: a galeria aberta tem de se repintar sozinha, sem
     ficar mostrando foto de livro que já entrou na estante */
  await pag.evaluate(() => {
    Object.keys(window.__db).filter(k => k.startsWith("pendentes/"))
      .forEach(k => delete window.__db[k]);
    window.__avisar && window.__avisar("pendentes");
  });
  await pag.waitForSelector(".c-fora h3:has-text('Nenhuma foto esperando')", { timeout: 8000 })
    .catch(async () => {
      const t = await pag.textContent(".c-fora h3");
      throw new Error("a galeria não se repintou: continua dizendo \"" + t.trim() + "\"");
    });
  console.log("depois de cadastrar, a galeria diz:", (await pag.textContent(".c-fora h3")).trim());
  if (await pag.$(".fotos img")) throw new Error("ainda mostra foto de livro já cadastrado");
  await pag.click("#fp-sair2");
  if (await pag.$(".leitor")) throw new Error("o Fechar de baixo não fechou");
  console.log("saída de baixo: ok");

  if (erros.length){ console.log("ERROS:", erros); process.exitCode = 1; }
  await nav.close();
  if (!process.exitCode) console.log("\nfotos pendentes, tudo certo");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
