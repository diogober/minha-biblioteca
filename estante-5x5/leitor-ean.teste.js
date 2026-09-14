/* Teste do leitor de código de barras que vai dentro do index.html:
   pega o módulo EAN da própria página (nada de segunda cópia para
   desandar), gera EAN-13 sintéticos, estraga a imagem de propósito
   (borrão, ruído, iluminação torta, de cabeça para baixo) e confere.

   node leitor-ean.teste.js */
var fonte = require("fs").readFileSync(__dirname + "/index.html", "utf8");
var i = fonte.indexOf("  var EAN = (function(){");
var j = fonte.indexOf("  })();", i) + "  })();".length;
if (i < 0 || j < 6) throw new Error("não achei o leitor dentro do index.html");
var L = eval("(function(){ " + fonte.slice(i, j) + " return EAN; })()");
/* o que o teste usa para desenhar os códigos, e a página não precisa expor */
L.DIG = [[3,2,1,1],[2,2,2,1],[2,1,2,2],[1,4,1,1],[1,1,3,2],
         [1,2,3,1],[1,1,1,4],[1,3,1,2],[1,2,1,3],[3,1,1,2]];
L.PARIDADE = ["000000","001011","001101","001110","010011",
              "011001","011100","010101","010110","011010"];
L.digitoVerificador = function(ds){
  var s = 0, i, n = ds.length;
  for (i = 0; i < n; i++) s += ds[n-1-i] * (i % 2 === 0 ? 3 : 1);
  return (10 - s % 10) % 10;
};

function modulosEAN13(codigo){
  var DIG = L.DIG, PARIDADE = L.PARIDADE;
  var ds = codigo.split("").map(Number);
  var par = PARIDADE[ds[0]];
  var bits = "101";
  function barras(conta, comecaPreto){
    var s = "", i, c = comecaPreto ? "1" : "0";
    for (i = 0; i < conta.length; i++){
      s += new Array(conta[i] + 1).join(c);
      c = c === "1" ? "0" : "1";
    }
    return s;
  }
  var i;
  for (i = 1; i <= 6; i++){
    var p = DIG[ds[i]];
    if (par[i-1] === "1") p = p.slice().reverse();   /* código G */
    bits += barras(p, false);
  }
  bits += "01010";
  for (i = 7; i <= 12; i++) bits += barras(DIG[ds[i]], true);
  bits += "101";
  return bits;
}

function codigoValido(prefixo){
  var base = prefixo;
  while (base.length < 12) base += Math.floor(Math.random() * 10);
  return base + L.digitoVerificador(base.split("").map(Number));
}

/* desenha o símbolo num quadro cinza, com escala, margem e sujeira */
function quadro(codigo, op){
  op = op || {};
  var bits = modulosEAN13(codigo);
  var esc = op.escala || 3, margem = op.margem == null ? 20 : op.margem;
  var larg = op.largura || (bits.length * esc + margem * 2);
  var alt = op.altura || 60;
  var img = new Uint8Array(larg * alt), x, y;
  var desloc = op.desloc == null ? margem : op.desloc;
  for (y = 0; y < alt; y++){
    for (x = 0; x < larg; x++){
      var i = Math.floor((x - desloc) / esc);
      var preto = i >= 0 && i < bits.length && bits[i] === "1";
      var v = preto ? (op.tintaPreta || 30) : (op.tintaBranca || 225);
      img[y * larg + x] = v;
    }
  }
  if (op.gradiente){                  /* uma lâmpada só de um lado */
    for (y = 0; y < alt; y++) for (x = 0; x < larg; x++){
      var f = 0.45 + 0.55 * (x / larg);
      img[y*larg+x] = Math.max(0, Math.min(255, Math.round(img[y*larg+x] * f)));
    }
  }
  if (op.borrao){                     /* foto fora de foco */
    var r = op.borrao, copia = img.slice();
    for (y = 0; y < alt; y++) for (x = 0; x < larg; x++){
      var s = 0, c = 0, k;
      for (k = -r; k <= r; k++){
        var xx = x + k; if (xx < 0 || xx >= larg) continue;
        s += copia[y*larg+xx]; c++;
      }
      img[y*larg+x] = Math.round(s/c);
    }
  }
  if (op.ruido){
    for (var i2 = 0; i2 < img.length; i2++){
      img[i2] = Math.max(0, Math.min(255, img[i2] + Math.round((Math.random()*2-1)*op.ruido)));
    }
  }
  if (op.inverter){                   /* livro de cabeça para baixo */
    var inv = new Uint8Array(img.length);
    for (y = 0; y < alt; y++) for (x = 0; x < larg; x++) inv[y*larg+x] = img[y*larg + (larg-1-x)];
    img = inv;
  }
  if (op.angulo){                     /* celular torto: gira uns graus */
    var ang = op.angulo * Math.PI / 180, cos = Math.cos(ang), sen = Math.sin(ang);
    var gir = new Uint8Array(img.length), cx = larg/2, cy = alt/2;
    for (y = 0; y < alt; y++) for (x = 0; x < larg; x++){
      var ox = Math.round(cos*(x-cx) + sen*(y-cy) + cx);
      var oy = Math.round(-sen*(x-cx) + cos*(y-cy) + cy);
      gir[y*larg+x] = (ox>=0 && ox<larg && oy>=0 && oy<alt) ? img[oy*larg+ox] : 235;
    }
    img = gir;
  }
  if (op.girar){                      /* celular deitado: gira 90° */
    var g = new Uint8Array(img.length), nl = alt, na = larg;
    for (y = 0; y < alt; y++) for (x = 0; x < larg; x++) g[x*nl + (nl-1-y)] = img[y*larg+x];
    return { img: g, largura: nl, altura: na };
  }
  return { img: img, largura: larg, altura: alt };
}

var casos = [
  ["nítido, escala 3", {escala:3}],
  ["escala 2 (barra fina)", {escala:2}],
  ["escala 5", {escala:5}],
  ["borrão leve", {escala:4, borrao:2}],
  ["borrão forte", {escala:5, borrao:4}],
  ["ruído", {escala:4, ruido:30}],
  ["iluminação torta", {escala:4, gradiente:true}],
  ["iluminação torta + ruído", {escala:4, gradiente:true, ruido:20}],
  ["de cabeça para baixo", {escala:4, inverter:true}],
  ["celular deitado (90°)", {escala:4, girar:true}],
  ["contraste fraco", {escala:4, tintaPreta:95, tintaBranca:175}],
  ["margem curta", {escala:4, margem:6}],
  ["quadro largo (livro pequeno no meio)", {escala:3, largura:1200, desloc:420, altura:200}],
  ["torto 8 graus", {escala:4, altura:160, largura:700, desloc:120, angulo:8}],
  ["torto 20 graus", {escala:4, altura:200, largura:700, desloc:120, angulo:20}],
  ["câmera 640x480, código pequeno", {escala:2, largura:640, altura:480, desloc:200, borrao:1, ruido:10}],
  ["tudo junto", {escala:4, borrao:2, ruido:18, gradiente:true, inverter:true}]
];

var prefixos = ["978850", "978652", "978014", "979123"];
var falhas = 0, total = 0;
/* O caso "tudo junto" empilha borrão maior que um módulo, ruído forte,
   luz torta e o livro de cabeça para baixo — além do que uma câmera de
   celular entrega. Num quadro só ele sai entre metade e um quarto das
   vezes, e é por isso que a câmera lê quadro após quadro, umas onze
   vezes por segundo: o que importa aqui é que nunca leia errado. */
var TOLERANTES = { "tudo junto": 0.25 };
casos.forEach(function(c){
  var nome = c[0], op = c[1], erros = [], trocados = [], n = 25, i;
  for (i = 0; i < n; i++){
    var cod = codigoValido(prefixos[i % prefixos.length]);
    var q = quadro(cod, op);
    var lido = L.lerCinza(q.img, q.largura, q.altura, {});
    total++;
    if (lido !== cod){
      erros.push(cod + " -> " + lido);
      if (lido) trocados.push(cod + " -> " + lido);   /* ler errado é o pecado */
    }
  }
  var minimo = Math.ceil(n * (TOLERANTES[nome] || 1));
  /* no caso extremo, um erro de leitura em cada tantos é conhecido: a soma
     de verificação do EAN deixa passar um em dez, e quem pega isso depois é
     a identificação do livro, que não reconhece um ISBN inventado */
  var trocaAceita = TOLERANTES[nome] ? Math.floor(n * 0.04) : 0;
  var passou = (n - erros.length) >= minimo && trocados.length <= trocaAceita;
  if (!passou) falhas += erros.length;
  console.log((passou ? "ok     " : "FALHOU ") + nome + ": " +
    (n - erros.length) + "/" + n +
    (trocados.length ? "  LEU ERRADO: " + trocados[0] : "") +
    (erros.length && !trocados.length ? "  ex: " + erros[0] : ""));
});

/* nenhum código falso: ruído puro não pode virar ISBN */
var falsos = 0;
for (var t = 0; t < 200; t++){
  var larg = 400, alt = 40, img = new Uint8Array(larg*alt);
  for (var i3 = 0; i3 < img.length; i3++) img[i3] = Math.floor(Math.random()*256);
  if (L.lerCinza(img, larg, alt, {})) falsos++;
}
console.log((falsos ? "FALHOU " : "ok     ") + "ruído puro não vira código: " + falsos + "/200 falsos positivos");

console.log("\n" + (total - falhas) + "/" + total + " leituras dentro do esperado");
if (falhas || falsos) process.exitCode = 1;
