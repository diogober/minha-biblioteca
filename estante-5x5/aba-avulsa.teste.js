/* O caminho para quando o quadro do aplicativo não entrega a câmera:
   ler em aba própria (a página é dona da janela, o navegador pergunta
   pela câmera) e, de volta na estante, cadastrar a fila.
   Precisa da página servida por http (python3 -m http.server 8731).
   npm i playwright; CHROME=/caminho/do/chrome node aba-avulsa.teste.js */
const { chromium } = require("playwright");
const FINGE = require("fs").readFileSync(__dirname + "/pagina.teste.js","utf8")
  .split("const FINGE_CLAUDE = `")[1].split("`;")[0];
const CAMERA = require("fs").readFileSync(__dirname + "/camera.teste.js","utf8")
  .split("const CAMERA = `")[1].split("`;")[0];

const ENDERECO = process.env.SERVIDOR || "http://localhost:8731/index.html";

(async () => {
  const nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const ctx = await nav.newContext({ viewport: { width: 460, height: 860 } });
  await ctx.addInitScript(FINGE);
  const erros = [];

  /* ---- 1. a aba própria: só câmera, sem Claude e sem banco ---- */
  const aba = await ctx.newPage();
  aba.on("pageerror", e => erros.push("aba: " + e.message));
  await aba.addInitScript(CAMERA);
  await aba.addInitScript(`window.claude = { use: function(){ return Promise.resolve(null); } };`);
  await aba.goto(ENDERECO + "?leitura=1", { waitUntil: "domcontentloaded" });
  await aba.waitForSelector("#c-video", { timeout: 10000 });
  console.log("a aba abriu já na câmera: ok");
  await aba.waitForFunction(() => /na fila/.test(document.querySelector("#c-recado")?.textContent || ""),
    { timeout: 20000 });
  console.log("leu:", (await aba.textContent("#c-recado")).trim());
  console.log("contador:", (await aba.textContent("#c-conta")).trim());

  /* a câmera continua ligada para o próximo livro */
  const ligada = await aba.evaluate(() => {
    const v = document.querySelector("#c-video");
    return !!(v && v.srcObject && v.srcObject.getTracks().some(t => t.readyState === "live"));
  });
  if (!ligada) throw new Error("a câmera parou depois de ler; devia seguir para o próximo");
  console.log("câmera segue ligada para o próximo: ok");

  const guardado = await aba.evaluate(() => localStorage.getItem("estante-fila-codigos"));
  console.log("fila no navegador:", guardado);
  if (!/9788535914849/.test(guardado || "")) throw new Error("não guardou o código na fila");
  await aba.close();

  /* ---- 2. de volta à estante, dentro do quadro (como no aplicativo) ---- */
  const quadro = await ctx.newPage();
  quadro.on("pageerror", e => erros.push("quadro: " + e.message));
  /* a estante dentro do aplicativo roda num quadro: aqui é o mesmo desenho,
     e é por isso que ela sabe que não é dona da janela */
  await quadro.goto(ENDERECO.replace(/index\.html.*$/, "quadro.teste.html"),
    { waitUntil: "domcontentloaded" });
  const dentro = quadro.frameLocator("#estante");
  /* o botão já está no HTML: espera a lista, que só existe depois do script */
  await dentro.locator(".item").first().waitFor({ timeout: 15000 });
  const rotulo = (await dentro.locator("#b-codigo").textContent()).trim();
  console.log("botão da estante:", rotulo);
  if (!/1 código lido/.test(rotulo)) throw new Error("o botão não avisou da fila: " + rotulo);

  await dentro.locator("#b-codigo").click();
  await dentro.locator(".c-fora h3").waitFor({ timeout: 8000 });
  const cabecalho = (await dentro.locator(".c-fora h3").textContent()).trim();
  console.log("ao abrir:", cabecalho);
  if (!/código lido|códigos lidos/.test(cabecalho)) throw new Error("não ofereceu a fila");

  await dentro.locator("#c-comecar").click();
  await dentro.locator(".c-achado h3").waitFor({ timeout: 15000 });
  console.log("identificou:", (await dentro.locator(".c-achado h3").textContent()).trim(),
    "| nicho:", await dentro.locator("#c-nicho").inputValue());
  await dentro.locator("#c-guardar").click();
  await dentro.locator(".recado").waitFor({ timeout: 8000 });
  console.log("guardado:", (await dentro.locator(".recado").textContent()).replace(/\s+/g," ").trim());

  const sobrou = await quadro.frames()
    .find(f => /index\.html/.test(f.url()))
    .evaluate(() => localStorage.getItem("estante-fila-codigos"));
  if (!/^\[\]$/.test(sobrou || "[]")) throw new Error("a fila não esvaziou: " + sobrou);
  console.log("fila esvaziou depois de cadastrar: ok");

  if (erros.length){ console.log("ERROS:", erros); process.exitCode = 1; }
  await nav.close();
  if (!process.exitCode) console.log("\naba avulsa, tudo certo");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
