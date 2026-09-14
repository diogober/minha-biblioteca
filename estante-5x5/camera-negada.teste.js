/* Quando a câmera não abre, a página tem de dizer qual dos motivos foi —
   só um deles se resolve nos ajustes do aparelho.
   npm i playwright; CHROME=/caminho/do/chrome node camera-negada.teste.js */
const { chromium } = require("playwright");
const FINGE = require("fs").readFileSync(__dirname + "/pagina.teste.js","utf8")
  .split("const FINGE_CLAUDE = `")[1].split("`;")[0];

let nav;
async function cena(nome, guiao, esperado){
  const ctx = await nav.newContext({ viewport:{width:480,height:800} });
  await ctx.addInitScript(FINGE);
  await ctx.addInitScript(guiao);
  const pag = await ctx.newPage();
  await pag.goto("file://" + __dirname + "/index.html", { waitUntil: "domcontentloaded" });
  await pag.waitForSelector(".item");
  await pag.click("#b-codigo");
  await pag.waitForSelector(".c-fora h3", { timeout: 8000 });
  const titulo = (await pag.textContent(".c-fora h3")).trim();
  const texto = (await pag.textContent(".c-fora .vazio-txt")).trim();
  const temTentar = !!(await pag.$("#c-tentar"));
  const temFoto = !!(await pag.$("#c-foto2"));
  console.log("• " + nome + "\n  título: " + titulo + "\n  texto: " + texto.slice(0,150) +
    "\n  tentar de novo: " + temTentar + " | foto: " + temFoto);
  /* o servidorzinho de teste não manda charset; compara só o esqueleto */
  const so = t => t.replace(/[^\x20-\x7e]/g, "");
  if (!so(titulo).includes(so(esperado)))
    throw new Error("esperava '" + esperado + "', veio '" + titulo + "'");
  if (!temFoto) throw new Error("sumiu o caminho da foto");
  await ctx.close();
}

(async () => {
  nav = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"] });
  /* 1. o quadro não libera a câmera (o caso do iframe sem allow=camera) */
  await cena("quadro sem permissão de câmera", `
    Object.defineProperty(document, "permissionsPolicy", { value: { allowsFeature: function(n){ return n !== "camera"; } }, configurable: true });
    navigator.mediaDevices.getUserMedia = function(){
      var e = new Error("Permission denied by permissions policy");
      e.name = "NotAllowedError"; return Promise.reject(e);
    };`, "Esta janela não libera a câmera");

  /* 2. o usuário é que negou (o quadro libera) */
  await cena("usuário negou", `
    Object.defineProperty(document, "permissionsPolicy", { value: { allowsFeature: function(){ return true; } }, configurable: true });
    navigator.permissions.query = function(){ return Promise.resolve({ state: "denied" }); };
    navigator.mediaDevices.getUserMedia = function(){
      var e = new Error("Permission denied"); e.name = "NotAllowedError"; return Promise.reject(e);
    };`, "bloqueada para este site");

  /* 3. aparelho sem câmera */
  await cena("sem câmera no aparelho", `
    Object.defineProperty(document, "permissionsPolicy", { value: { allowsFeature: function(){ return true; } }, configurable: true });
    navigator.mediaDevices.getUserMedia = function(){
      var e = new Error("Requested device not found"); e.name = "NotFoundError"; return Promise.reject(e);
    };`, "Não achei câmera");

  await nav.close();
  console.log("\ndiagnósticos ok");
})().catch(async e => { console.error("FALHOU:", e.message); process.exitCode = 1;
  if (nav) await nav.close(); });
