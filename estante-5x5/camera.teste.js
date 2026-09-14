/* A câmera de mentira (precisa da página servida por http, não file://:
   python3 -m http.server 8731 neste diretório):
    um canvas desenhando o código de barras, com
   tremor de mão e ruído, entregue como MediaStream. Exercita o caminho
   de verdade — vídeo → varredura → confirmação em dois quadros →
   desligar a câmera. */
const { chromium } = require("playwright");
const FINGE = require("fs").readFileSync(__dirname + "/pagina.teste.js","utf8")
  .split("const FINGE_CLAUDE = `")[1].split("`;")[0];

const CAMERA = `
(function(){
  var DIG = [[3,2,1,1],[2,2,2,1],[2,1,2,2],[1,4,1,1],[1,1,3,2],
             [1,2,3,1],[1,1,1,4],[1,3,1,2],[1,2,1,3],[3,1,1,2]];
  var PAR = ["000000","001011","001101","001110","010011",
             "011001","011100","010101","010110","011010"];
  function bits(codigo){
    var ds = codigo.split("").map(Number);
    function barras(c, pretoPrimeiro){
      var s = "", cor = pretoPrimeiro ? "1" : "0", i, j;
      for (i = 0; i < c.length; i++){ for (j = 0; j < c[i]; j++) s += cor; cor = cor === "1" ? "0" : "1"; }
      return s;
    }
    var b = "101", i, p;
    for (i = 1; i <= 6; i++){ p = DIG[ds[i]]; if (PAR[ds[0]][i-1] === "1") p = p.slice().reverse(); b += barras(p, false); }
    b += "01010";
    for (i = 7; i <= 12; i++) b += barras(DIG[ds[i]], true);
    return b + "101";
  }
  var B = bits(window.__CODIGO || "9788535914849");
  var lona = document.createElement("canvas");
  lona.width = 640; lona.height = 480;
  var tinta = lona.getContext("2d"), quadro = 0;
  function pintar(){
    quadro++;
    tinta.fillStyle = "#cfcabf"; tinta.fillRect(0, 0, 640, 480);
    var escala = 4.6, x0 = (640 - B.length*escala)/2 + ((quadro % 3) - 1);
    tinta.fillStyle = "#1a1a18";
    for (var i = 0; i < B.length; i++){
      if (B[i] === "1") tinta.fillRect(x0 + i*escala, 150, escala + 0.3, 170);
    }
    /* sombra de um lado, como uma lâmpada só */
    var g = tinta.createLinearGradient(0, 0, 640, 0);
    g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    tinta.fillStyle = g; tinta.fillRect(0, 0, 640, 480);
    requestAnimationFrame(pintar);
  }
  pintar();
  var fluxo = lona.captureStream(15);
  navigator.mediaDevices.getUserMedia = function(){ return Promise.resolve(fluxo); };
})();
`;

(async () => {
  const nav = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ["--no-sandbox","--disable-dev-shm-usage"]
  });
  const ctx = await nav.newContext({ viewport: { width: 500, height: 820 } });
  await ctx.addInitScript(FINGE);
  await ctx.addInitScript(CAMERA);
  const pag = await ctx.newPage();
  const erros = [];
  pag.on("pageerror", e => erros.push("pageerror: " + e.message));
  await pag.goto(process.env.SERVIDOR || "http://localhost:8731/index.html");
  await pag.waitForSelector(".item");
  await pag.click("#b-codigo");
  await pag.waitForSelector("#c-video");
  await pag.waitForFunction(() => {
    const r = document.querySelector("#c-recado");
    return r && /Aponte/.test(r.textContent);
  }, { timeout: 10000 });
  await pag.screenshot({ path: require("os").tmpdir() + "/camera-ligada.png" });
  const t0 = Date.now();
  await pag.waitForSelector(".c-achado h3, .c-fora h3", { timeout: 30000 });
  const isbn = await pag.$(".c-isbn");
  const txt = isbn ? await isbn.textContent() : await pag.textContent(".c-fora h3");
  console.log("leitura ao vivo em " + ((Date.now()-t0)/1000).toFixed(1) + "s:", txt.trim());
  if (!isbn || !/978-8-5359-1484-9/.test(txt)) throw new Error("a câmera não leu o código: " + txt);
  console.log("identificou:", (await pag.textContent(".c-achado h3")).trim(),
              "| nicho:", await pag.inputValue("#c-nicho"));
  const ligada = await pag.evaluate(() => {
    const v = document.querySelector("#c-video");
    return !!(v && v.srcObject && v.srcObject.getTracks().some(t => t.readyState === "live"));
  });
  if (ligada) throw new Error("a câmera continuou ligada depois da leitura");
  console.log("câmera desligada depois da leitura: ok");
  await pag.screenshot({ path: require("os").tmpdir() + "/leitura-achado.png" });
  if (erros.length){ console.log("ERROS:", erros); process.exitCode = 1; }
  await nav.close();
  if (!process.exitCode) console.log("câmera ok");
})().catch(e => { console.error("FALHOU:", e.message); process.exitCode = 1; });
