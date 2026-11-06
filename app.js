// Interfaccia di Fanta Consigli. Le leghe restano salvate sul telefono di chi usa l'app.
(function () {
  const M = window.Motore;
  const CHIAVE = "fantaconsigli.v1";
  const VERSIONE = 14; // da aumentare insieme a versione.json a ogni pubblicazione del codice
  const MODULI_CLASSICI = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];
  const MODULI_EXTRA = ["3-6-1", "5-2-3", "6-2-2", "6-3-1"];
  const NOMI_RUOLO = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
  const RUOLO_SING = { P: "Portiere", D: "Difensore", C: "Centrocampista", A: "Attaccante" };
  const STATI = {
    titolare: "Titolare", ballottaggio: "In ballottaggio", dubbio: "In dubbio", panchina: "Parte dalla panchina",
    infortunato: "Infortunato", squalificato: "Squalificato", fuori: "Fuori", sconosciuto: "Nessun dato",
  };
  const SQUADRE_RISERVA = [
    "Atalanta", "Bologna", "Cagliari", "Como", "Cremonese", "Fiorentina", "Frosinone", "Genoa", "Inter",
    "Juventus", "Lazio", "Lecce", "Milan", "Monza", "Napoli", "Parma", "Pisa", "Roma", "Sassuolo",
    "Torino", "Udinese", "Venezia", "Verona",
  ];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let stato = carica();
  let dati = { giocatori: [], partite: [], squadre: [] };
  let vista = "formazione";
  let ultimo = null; // ultimo consiglio calcolato, per la scheda giocatore

  function carica() {
    try {
      const s = JSON.parse(localStorage.getItem(CHIAVE));
      if (s && Array.isArray(s.leghe)) return s;
    } catch (e) {}
    return { leghe: [], attiva: null };
  }
  function salva() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) {
      avviso("Non riesco a salvare sul telefono (navigazione privata?)");
    }
  }
  function legaAttiva() {
    return stato.leghe.find((l) => l.id === stato.attiva) || stato.leghe[0] || null;
  }
  function squadre() {
    return dati.squadre && dati.squadre.length ? [...dati.squadre].sort() : SQUADRE_RISERVA;
  }
  function regoleBase() {
    return {
      moduli: [...MODULI_CLASSICI], modDifesa: false, modCentrocampo: false, capitano: false,
      switch: false, switchPlus: false, panchinari: "", timeout: 0,
    };
  }
  function pref(lega) {
    lega.fissi = lega.fissi || [];
    lega.esclusi = lega.esclusi || [];
    const m = lega.moduloScelto;
    return { fissi: lega.fissi, esclusi: lega.esclusi, modulo: m && m.giornata === dati.giornata ? m.modulo : null };
  }

  // Sfida con l'avversario: probabilità di vittoria e modulo migliore per batterlo
  function analisiSfida(lega, mio) {
    const avv = avversarioDiGiornata(lega);
    if (!avv || mio.errore) return null;
    const loro = M.consiglia(avv.rosa, dati, lega.regole);
    if (loro.errore) return null;
    // Porto la media della lega ai punti veri (di solito circa 72 a giornata, o quella scritta nelle regole)
    const classifica = M.classificaLega(lega.rosa, "io", lega.avversari || [], dati, lega.regole);
    const media = classifica.reduce((s, c) => s + c.previsti, 0) / (classifica.length || 1);
    const spostamento = (Number(lega.regole.mediaLega) || 72) - media;
    const moduli = M.antiAvversario(mio, loro, lega.regole, spostamento);
    const attuale = moduli.find((x) => x.modulo === mio.modulo);
    const esito = attuale ? attuale.esito : M.simula(mio.candidati[0], loro.candidati[0], lega.regole, 3000, spostamento);
    const meglio = moduli[0];
    const anti = meglio && attuale && meglio.modulo !== mio.modulo && meglio.esito.puntiAttesi - attuale.esito.puntiAttesi >= 0.03 ? { meglio, attuale } : null;
    return { avv, loro, esito, anti };
  }

  function barraEsito(e) {
    const p = (x) => Math.round(x * 100);
    return `<div class="esito-barra" role="img" aria-label="Vittoria ${p(e.vittoria)}%, pareggio ${p(e.pareggio)}%, sconfitta ${p(e.sconfitta)}%">
        <i class="v" style="width:${e.vittoria * 100}%"></i><i class="n" style="width:${e.pareggio * 100}%"></i><i class="s" style="width:${e.sconfitta * 100}%"></i>
      </div>
      <div class="esito-legenda"><span><i class="v"></i>Vinci <b>${p(e.vittoria)}%</b></span><span><i class="n"></i>Pari <b>${p(e.pareggio)}%</b></span><span><i class="s"></i>Perdi <b>${p(e.sconfitta)}%</b></span></div>`;
  }
  function calcola(lega) {
    ultimo = M.consiglia(lega.rosa, dati, lega.regole, pref(lega));
    return ultimo;
  }

  let timerAvviso;
  function avviso(testo) {
    const el = $("#avviso");
    el.textContent = testo;
    el.classList.add("visibile");
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => el.classList.remove("visibile"), 2600);
  }

  // ---------- Date ----------
  const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const ora = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  function quando(d) {
    if (!d) return "";
    d = new Date(d);
    return `${GIORNI[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${ora(d)}`;
  }
  function mancano(ms) {
    if (ms <= 0) return "La giornata è iniziata";
    const min = Math.floor(ms / 60000);
    const g = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (g) return `${g}g ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m} min`;
  }
  const sigla = (s) => String(s || "").slice(0, 3).toUpperCase();
  const cognome = (n) => String(n).replace(/\s+[A-Z][a-zà-ù]?\.(\s*[A-Z]\.)*$/, "").trim() || n;

  // ---------- Pezzi di interfaccia ----------
  function livello(g) {
    if (M.FUORI.includes(g.stato) || g.escluso) return "out";
    if (g.stato === "sconosciuto") return "ignota";
    return g.prob >= 75 ? "alta" : g.prob >= 50 ? "media" : "bassa";
  }
  function pct(g) {
    if (g.escluso) return `<span class="pct out">escluso</span>`;
    if (M.FUORI.includes(g.stato)) return `<span class="pct out">${esc(g.stato)}</span>`;
    if (g.stato === "sconosciuto") return `<span class="pct ignota">?</span>`;
    return `<span class="pct ${livello(g)}">${g.prob}%</span>`;
  }
  function partitaTesto(g) {
    if (!g.partita) return g.squadra ? esc(g.squadra) : "";
    const p = g.partita;
    return `${esc(g.squadra)} ${p.inCasa ? "vs" : "@"} ${esc(p.avversario)} · ${quando(p.inizio)}`;
  }
  function segni(g, r) {
    let s = "";
    if (r && g === r.capitano) s += `<span class="fascia">C</span>`;
    if (r && g === r.vice) s += `<span class="fascia">VC</span>`;
    if (g.fisso) s += `<span class="segno" title="Sempre titolare">📌</span>`;
    return s;
  }

  function pedina(g, r) {
    const vs = g.partita ? `${g.partita.inCasa ? "" : "@"}${sigla(g.partita.avversario)}` : sigla(g.squadra);
    const rischio = !g.fisso && g.prob < 60 && !M.FUORI.includes(g.stato);
    return `<button class="pedina" data-gioc="${esc(g.chiave)}" aria-label="${esc(g.nome)}, ${g.prob}%">
      <span class="maglia ${g.ruolo} ${livello(g)}"><span>${g.prob}</span>${rischio ? `<i class="rischio">!</i>` : ""}</span>
      <span class="cognome">${esc(cognome(g.nome))}${segni(g, r)}</span>
      <span class="vs">${esc(vs)}</span>
    </button>`;
  }

  function campo(r) {
    let righe = "";
    for (const ruolo of ["A", "C", "D", "P"]) {
      righe += `<div class="linea">${r.perRuolo[ruolo].map((g) => pedina(g, r)).join("")}</div>`;
    }
    return `<div class="campo"><div class="campo-segni" aria-hidden="true"><i class="meta"></i><i class="cerchio"></i><i class="area alto"></i><i class="area basso"></i></div>${righe}</div>`;
  }

  // ---------- Aiuti: istruzioni brevi passo per passo ----------
  const aiuto = (passi, titolo = "Come fare") =>
    `<div class="aiuto"><b>💡 ${titolo}</b><ol>${passi.map((p) => `<li>${p}</li>`).join("")}</ol></div>`;

  function inApp() {
    return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  }
  function cardInstalla() {
    let chiuso = false;
    try { chiuso = localStorage.getItem("fc.installa.chiuso") === "1"; } catch (e) {}
    if (inApp() || chiuso || !/iphone|ipad|android/i.test(navigator.userAgent)) return "";
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    return `<section class="card installa">
      <button class="x" data-azione="chiudi-installa" aria-label="Chiudi">×</button>
      <b>📲 Mettila sul telefono come un'app</b>
      <p class="piccolo">${ios
        ? "Apri questa pagina con <b>Safari</b> → tocca <b>Condividi</b> (il quadrato con la freccia ⬆️) → <b>Aggiungi alla schermata Home</b>."
        : "In <b>Chrome</b> tocca <b>⋮</b> in alto a destra → <b>Aggiungi a schermata Home</b> (o <b>Installa app</b>)."}</p>
    </section>`;
  }

  // Cosa manca per usare tutta l'app, con il tasto per farlo
  function cardPerIniziare(lega) {
    if (lega.guidaChiusa) return "";
    const passi = [
      { fatto: lega.rosa.length >= 11, testo: "La tua rosa", come: "screenshot della rosa → l'app trova i giocatori", tasto: `<button class="btn piccolo" data-azione="modifica-rosa">Aggiungi</button>` },
      { fatto: !!(lega.regoleViste || stato.fonte), testo: "Le regole della lega", come: "moduli, modificatori, soglie gol", tasto: `<button class="btn piccolo" data-vista="regole">Imposta</button>` },
      { fatto: (lega.avversari || []).length > 0, testo: "Le squadre avversarie", come: "per sapere quanto spesso vinci e gli scambi", tasto: `<button class="btn piccolo" data-azione="nuovo-avv">Aggiungi</button>` },
      { fatto: !!lega.calendario, testo: "Il calendario", come: "avversario automatico e come finisce il campionato",
        tasto: (lega.avversari || []).length ? `<button class="btn piccolo" data-vista="lega">Aggiungi</button>` : `<small class="tenue">dopo le squadre</small>` },
    ];
    const fatti = passi.filter((p) => p.fatto).length;
    if (fatti === passi.length) return "";
    return `<section class="card per-iniziare">
      <h2>🚀 Per iniziare <small>${fatti} di ${passi.length} fatti</small></h2>
      ${passi.map((p) => `<div class="passo ${p.fatto ? "fatto" : ""}">
        <span class="spunta" aria-hidden="true">${p.fatto ? "✓" : ""}</span>
        <span><b>${p.testo}</b><small>${p.come}</small></span>
        ${p.fatto ? "" : p.tasto}
      </div>`).join("")}
      <button class="link piccolo" data-azione="chiudi-guida">Nascondi</button>
    </section>`;
  }

  // ---------- Viste ----------
  function vistaBenvenuto() {
    return `${cardInstalla()}<section class="benvenuto">
      <div class="benvenuto-campo" aria-hidden="true">
        <span class="maglia A alta"><span>90</span></span><span class="maglia C alta"><span>85</span></span><span class="maglia D media"><span>60</span></span>
      </div>
      <h1>La formazione giusta,<br>ogni giornata</h1>
      <p>Scegli i tuoi giocatori e le regole della tua lega: l'app ti dice chi schierare, in che ordine mettere la panchina e chi lasciare fuori.</p>
      <button class="btn grande" data-azione="nuova">Aggiungi la tua lega</button>
      <ol class="passi">
        <li><span><b>Aggiungi la lega</b>: nome e screenshot della tua rosa</span></li>
        <li><span><b>Imposta le regole</b>: 2 minuti, le copi da fantacalcio.it</span></li>
        <li><span><b>Ogni giornata apri l'app</b>: la formazione è pronta, la copi su fantacalcio.it</span></li>
      </ol>
      <p class="tenue piccolo">Funziona per qualsiasi lega Classic. I tuoi dati restano su questo telefono.</p>
      <button class="link" data-azione="importa-codice">Hai già le leghe su un altro telefono? Incolla il link</button>
    </section>
    <section class="card diversa">
      <h2>Cosa trovi solo qui</h2>
      <div class="punti-forza">
        <div><span>🎯</span><b>Quanto spesso vinci</b><small>Simulo la sfida col tuo avversario 3.000 volte, con le soglie gol della tua lega</small></div>
        <div><span>🧠</span><b>Formazione anti-avversario</b><small>Il modulo che ti fa vincere più spesso contro quella squadra</small></div>
        <div><span>🔁</span><b>Scambi con la tua lega</b><small>Proposte equilibrate con le rose vere dei tuoi amici</small></div>
        <div><span>🏆</span><b>Come finisce il campionato</b><small>Simulo il resto della stagione 2.000 volte col tuo calendario</small></div>
        <div><span>📷</span><b>Rosa da screenshot</b><small>Carichi la foto della rosa e i giocatori si aggiungono da soli</small></div>
        <div><span>🔍</span><b>Ogni numero spiegato</b><small>Tocchi un giocatore e vedi il calcolo</small></div>
      </div>
      <button class="link" data-azione="guida">Come funziona ›</button>
    </section>`;
  }

  function vistaNuova() {
    return `<section class="card">
      <h2>Nuova lega</h2>
      <label for="n-nome">Nome della lega</label>
      <input id="n-nome" type="text" placeholder="Es. Lega del bar" autocomplete="off">
      ${aiuto(["Scrivi il nome della lega (quello che vuoi).", "Tocca <b>Avanti</b>.", "Nella pagina dopo carichi lo <b>screenshot della tua rosa</b>: i giocatori si aggiungono da soli."])}
      <div class="azioni">
        <button class="btn" data-azione="crea">Avanti: scegli i giocatori</button>
        ${stato.leghe.length ? `<button class="btn secondario" data-azione="annulla">Annulla</button>` : ""}
      </div>
    </section>`;
  }

  function vistaFormazione(lega) {
    if (!lega.rosa.length) {
      return `${cardInstalla()}${cardPerIniziare(lega)}`;
    }
    const r = calcola(lega);
    const sc = M.scadenza(dati, lega.regole.timeout);
    let html = cardInstalla() + cardPerIniziare(lega);

    if (sc) {
      const ms = sc - Date.now();
      const cls = ms <= 0 ? "chiusa" : ms < 6 * 3600e3 ? "urgente" : "";
      html += `<section class="scadenza ${cls}">
        <div class="scad-icona" aria-hidden="true">${ms <= 0 ? "🔒" : "⏱"}</div>
        <div class="scad-testo">
          <div class="piccolo">${ms <= 0 ? "Formazione bloccata" : "Schiera entro " + quando(sc)}</div>
          <div class="manca" data-scadenza="${sc.getTime()}">${mancano(ms)}</div>
        </div>
        ${ms > 0 ? `<button class="btn chiaro piccolo" data-azione="calendario">🔔 Promemoria</button>` : ""}
      </section>`;
    }

    if (r.errore) return html + `<section class="card"><p class="errore">${esc(r.errore)}</p></section>`;

    html += cardNovita(lega);

    html += `<section class="card formazione">
      <div class="modulo-testa">
        <div>
          <div class="etichetta">${r.forzato ? "🎯 Modulo anti-avversario" : "Modulo consigliato"}</div>
          <div class="modulo">${esc(r.modulo)}</div>
        </div>
        <div class="previsti"><span>${r.previsti.toFixed(1)}</span><small>punti previsti</small></div>
      </div>
      ${campo(r)}
      <div class="legenda"><span><i class="pallino alta"></i>sicuro</span><span><i class="pallino media"></i>ballottaggio</span><span><i class="pallino bassa"></i>a rischio</span><span class="tenue">Tocca un giocatore</span></div>
      ${r.alternative.length ? `<div class="alternative"><span class="etichetta">Altri moduli</span>${r.alternative.map((a) => `<span class="alt">${esc(a.modulo)} <b>${a.differenza.toFixed(1)}</b></span>`).join("")}</div>` : ""}
      <div class="azioni" style="margin-top:12px"><button class="btn piena" data-azione="copia">📋 Copia formazione</button></div>
    </section>`;

    const sfida = analisiSfida(lega, r);
    if (sfida) {
      html += `<section class="card sfida-box">
        <div class="sfida-testa"><span>vs <b>${esc(sfida.avv.nome)}</b></span><button class="link" data-vista="lega">Dettagli ›</button></div>
        ${barraEsito(sfida.esito)}
        <p class="tenue piccolo" style="margin:8px 0 0">Gol attesi: tu ${sfida.esito.golMiei.toFixed(1)} · loro ${sfida.esito.golLoro.toFixed(1)}</p>`;
      if (r.forzato) {
        html += `<div class="anti attivo"><span>🎯 Modulo scelto per battere ${esc(sfida.avv.nome)}</span><button class="btn secondario piccolo" data-azione="modulo-auto">Torna al consigliato</button></div>`;
      } else if (sfida.anti) {
        const p = (x) => Math.round(x * 100);
        html += `<div class="anti"><span>🎯 <b>Formazione anti-avversario:</b> col <b>${esc(sfida.anti.meglio.modulo)}</b> vinci il ${p(sfida.anti.meglio.esito.vittoria)}% delle volte invece del ${p(sfida.anti.attuale.esito.vittoria)}%.</span>
          <button class="btn piccolo" data-azione="usa-modulo" data-modulo-scelto="${esc(sfida.anti.meglio.modulo)}">Usa ${esc(sfida.anti.meglio.modulo)}</button></div>`;
      }
      html += `</section>`;
    } else if ((lega.avversari || []).length) {
      html += `<button class="card sfida-mini" data-vista="lega"><span>🎯 Scegli il tuo avversario e scopri quanto spesso lo batti</span><span>›</span></button>`;
    } else {
      html += `<button class="card sfida-mini" data-vista="lega"><span>🎯 Incolla le rose della lega: ti dico quanto spesso batti il tuo avversario</span><span>›</span></button>`;
    }

    html += `<button class="card sfida-mini" data-azione="guida"><span>ℹ️ Come calcolo i punti e tutto il resto</span><span>›</span></button>`;

    if (r.switch.length) {
      html += `<section class="card"><h2>Switch <small>se gioca il panchinaro, entra lui</small></h2>`;
      for (const s of r.switch) {
        html += `<div class="switch-riga">
          <button class="mini" data-gioc="${esc(s.titolare.chiave)}"><span class="ruolo ${s.titolare.ruolo}">${s.titolare.ruolo}</span>${esc(s.titolare.nome)} ${pct(s.titolare)}</button>
          <span class="freccia">⇄</span>
          <button class="mini" data-gioc="${esc(s.panchinaro.chiave)}"><span class="ruolo ${s.panchinaro.ruolo}">${s.panchinaro.ruolo}</span>${esc(s.panchinaro.nome)} ${pct(s.panchinaro)}</button>
        </div>`;
      }
      html += `</section>`;
    }

    html += `<section class="card"><h2>Panchina <small>in quest'ordine</small></h2><ol class="panchina">`;
    for (const g of r.panchina) {
      html += `<li><button class="riga" data-gioc="${esc(g.chiave)}"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>
        <span class="nome">${esc(g.nome)}${segni(g)}<span class="dettaglio">${partitaTesto(g)}</span></span>${pct(g)}</button></li>`;
    }
    html += `</ol></section>`;

    if (r.daNonSchierare.length) {
      html += `<section class="card"><h2>Non schierare</h2><div class="fuori-lista">`;
      for (const g of r.daNonSchierare) html += `<button class="tag" data-gioc="${esc(g.chiave)}">${esc(g.nome)} · ${esc(g.stato)}</button>`;
      html += `</div></section>`;
    }

    html += `<p class="tenue piccolo piede">Dati aggiornati ${quando(dati.aggiornato)}${dati.fonti ? " · " + esc(dati.fonti.join(", ")) : ""}<br>Sono consigli: la formazione la confermi tu su fantacalcio.it.</p>`;
    return html;
  }

  function vistaRosa(lega) {
    const r = calcola(lega);
    const lista = r.giocatori;
    let html = `<section class="card"><h2>${esc(lega.nome)} <small>${lega.rosa.length} giocatori</small></h2>
      <button class="btn piena" data-azione="modifica-rosa">✏️ Aggiungi o togli giocatori</button>`;
    for (const ruolo of M.RUOLI) {
      const delRuolo = lista.map((g, i) => ({ g, i })).filter((x) => x.g.ruolo === ruolo);
      if (!delRuolo.length) continue;
      html += `<div class="reparto-titolo">${NOMI_RUOLO[ruolo]} · ${delRuolo.length}</div>`;
      for (const { g, i } of delRuolo) {
        html += `<div class="riga-rosa">
          <button class="riga" data-gioc="${esc(g.chiave)}"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>
            <span class="nome">${esc(g.nome)}${segni(g)}<span class="dettaglio">${esc(g.squadra || "squadra?")}${g.trovato ? "" : " · non trovato nei dati"}</span></span>${pct(g)}</button>
          <button class="x" data-togli="${i}" aria-label="Togli ${esc(g.nome)}">×</button>
        </div>`;
      }
    }
    html += `</section>
      <details class="card">
        <summary>Hai la rosa scritta da qualche parte? <small class="tenue">Incollala</small></summary>
        <p class="tenue piccolo">Una riga per giocatore, con la squadra: "P Maignan Milan". Sostituisce tutta la rosa.</p>
        <textarea id="r-incolla" placeholder="P Maignan Milan&#10;D Dimarco Inter&#10;..."></textarea>
        <div class="azioni" style="margin-top:8px"><button class="btn secondario" data-azione="sostituisci">Sostituisci la rosa</button></div>
      </details>`;
    return html;
  }

  function vistaMercato(lega) {
    const m = M.mercato(lega.rosa, dati);
    let html = `<section class="card">
      <h2>Da prendere <small>i migliori non in rosa</small></h2>
      <p class="tenue piccolo" style="margin-top:-4px">Titolari sicuri con il voto previsto più alto. Controlla su fantacalcio.it se sono svincolati nella tua lega, altrimenti chiedili in scambio.</p>`;
    for (const ruolo of M.RUOLI) {
      if (!m.prendere[ruolo].length) continue;
      html += `<div class="reparto-titolo">${NOMI_RUOLO[ruolo]}</div>`;
      for (const g of m.prendere[ruolo]) {
        html += `<div class="riga-rosa">
          <div class="riga statica"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>
            <span class="nome">${esc(g.nome)}<span class="dettaglio">${partitaTesto(g)}${g.nota ? " · " + esc(g.nota) : ""}</span></span>
            <span class="fv" title="Voto previsto">${g.fv.toFixed(1)}</span></div>
          <button class="piu" data-prendi="${esc(g.chiave)}" aria-label="Aggiungi ${esc(g.nome)} alla rosa">+</button>
        </div>`;
      }
    }
    html += `</section><section class="card"><h2>Da vendere <small>poco utili adesso</small></h2>`;
    if (!m.vendere.length) {
      html += `<p class="tenue">Nessuno: la rosa è a posto 👍</p>`;
    } else {
      for (const g of m.vendere) {
        html += `<button class="riga" data-gioc="${esc(g.chiave)}"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>
          <span class="nome">${esc(g.nome)}<span class="dettaglio">${esc(g.squadra)}${g.nota ? " · " + esc(g.nota) : ""}</span></span>
          <span class="pct ${g.motivo === "Quasi mai titolare" ? "media" : "out"}">${esc(g.motivo)}</span></button>`;
      }
    }
    html += `</section><p class="tenue piccolo piede">Il numero a destra è il voto previsto se gioca questa giornata.<br>Con + lo aggiungi alla tua rosa quando l'hai preso.</p>`;
    return html;
  }

  // ---------- Lega: avversario, classifica, scambi ----------
  function avversarioDiGiornata(lega) {
    const a = lega.avversario;
    if (a && a.giornata === dati.giornata) return (lega.avversari || []).find((s) => s.nome === a.nome) || null;
    const p = partitaMia(lega, giornataLega(lega));
    return p ? (lega.avversari || []).find((s) => s.nome === p.contro) || null : null;
  }
  // ---------- Calendario ----------
  const giornataLega = (lega) => (lega.calendario ? (dati.giornata || 0) - lega.calendario.offset : 0);
  function partitaMia(lega, g) {
    if (!lega.calendario || !lega.squadra || g < 1) return null;
    const p = M.partiteDi(lega.calendario.giornate, g).find(([x, y]) => x === lega.squadra || y === lega.squadra);
    return p ? { casa: p[0] === lega.squadra, contro: p[0] === lega.squadra ? p[1] : p[0] } : null;
  }
  const fineLega = (lega) => 38 - lega.calendario.offset;

  function formCalendario(lega, aperto) {
    const g = lega.calendario ? giornataLega(lega) : "";
    return `${aiuto([
        "Su fantacalcio.it apri <b>Calendario</b> e fai gli screenshot delle giornate (basta il primo giro).",
        "Se vuoi, fai anche lo screenshot della <b>Classifica</b>.",
        "Qui sotto scrivi il nome della tua squadra e che giornata è per la tua lega.",
        "Tocca <b>📷 Screenshot</b>, scegli le foto e poi <b>Salva il calendario</b>.",
      ])}
      <label for="c-mia">Come si chiama la tua squadra nella lega</label>
      <input id="c-mia" type="text" value="${esc(lega.squadra || "")}" placeholder="Es. Birkenstoke City" autocomplete="off">
      <label for="c-giornata">Questa giornata (${dati.giornata || "?"}ª di Serie A) per la tua lega è la…</label>
      <input id="c-giornata" type="number" min="1" max="38" inputmode="numeric" value="${g}" placeholder="Es. 9">
      <label for="c-testo">Il calendario</label>
      <div class="cerca-riga">
        <p class="tenue piccolo" style="margin:10px 0 0">Carica gli screenshot del calendario (e se vuoi della classifica) oppure incollalo qui sotto.</p>
        <label class="btn secondario foto">📷<span>Screenshot</span><input id="c-foto" type="file" accept="image/*" multiple hidden></label>
      </div>
      <div id="c-stato-foto" class="stato-foto" hidden></div>
      <textarea id="c-testo" placeholder="1ª giornata&#10;Bocanapoli - Diabolikus&#10;Real Forio - Scarsenal&#10;...&#10;&#10;Classifica&#10;1 Bocanapoli 14&#10;..."></textarea>
      <div class="azioni" style="margin-top:8px"><button class="btn" data-azione="salva-calendario">Salva il calendario</button></div>`;
  }

  function cardCalendario(lega) {
    if (!lega.calendario) {
      return `<section class="card"><h2>📅 Calendario</h2>
        <p class="tenue">Con il calendario l'app sa da sola chi affronti ogni giornata, ti dice quanto sono difficili le prossime partite e come può finire il campionato.</p>
        ${formCalendario(lega)}</section>`;
    }
    return `<section class="card"><h2>📅 Prossime sfide <small>${giornataLega(lega)}ª giornata di lega</small></h2>
        <div id="prossime"><p class="tenue">Calcolo le prossime partite…</p></div>
      </section>
      <section class="card"><h2>🏆 Come può finire <small>2.000 campionati simulati</small></h2>
        <div id="proiezione"><p class="tenue">Simulo il resto del campionato…</p></div>
      </section>
      <details class="card"><summary>Cambia il calendario o la classifica</summary>${formCalendario(lega)}</details>`;
  }

  // Forza "di stagione" di ogni squadra: chi ha un infortunio breve torna presto
  function forzeStagione(lega) {
    const dS = M.datiPerScambi(dati);
    const squadre = [{ nome: lega.squadra, rosa: lega.rosa, mia: true }, ...(lega.avversari || [])];
    const form = squadre.map((s) => ({ ...s, f: M.consiglia(s.rosa, dS, lega.regole) }));
    const ok = form.filter((s) => !s.f.errore);
    const media = ok.reduce((t, s) => t + s.f.previsti, 0) / (ok.length || 1);
    const spostamento = (Number(lega.regole.mediaLega) || 72) - media;
    return { form, spostamento };
  }

  function riempiCalendario(lega) {
    if (!lega.calendario || !$("#prossime")) return;
    setTimeout(() => {
      const { form, spostamento } = forzeStagione(lega);
      const per = new Map(form.map((s) => [s.nome, s]));
      const mia = per.get(lega.squadra);
      const g0 = giornataLega(lega);
      let html = "";
      for (let g = g0; g < g0 + 5 && g <= fineLega(lega); g++) {
        const p = partitaMia(lega, g);
        if (!p) continue;
        const loro = per.get(p.contro);
        let esito = null;
        // Questa giornata: stessa % della sfida (dati di oggi); le prossime: con le rose "di stagione"
        if (g === g0) { const a = analisiSfida(lega, calcola(lega)); if (a && a.avv.nome === p.contro) esito = a.esito; }
        if (!esito && mia && !mia.f.errore && loro && !loro.f.errore) esito = M.simula(mia.f.candidati[0], loro.f.candidati[0], lega.regole, 1500, spostamento);
        const v = esito ? Math.round(esito.vittoria * 100) : null;
        const livello = v == null ? "" : v >= 50 ? "facile" : v >= 35 ? "media" : "dura";
        html += `<div class="sfida-riga ${livello}">
          <span class="g">${g}ª<small>${g + lega.calendario.offset}ª A</small></span>
          <span class="contro"><b>${esc(p.contro)}</b><small>${p.casa ? "in casa" : "in trasferta"}${loro ? "" : " · rosa mancante"}</small></span>
          ${esito ? `<span class="vinci"><b>${v}%</b><small>vinci</small></span>` : `<span></span>`}
        </div>`;
      }
      $("#prossime").innerHTML = html || `<p class="tenue">Nel calendario non trovo le tue prossime partite: controlla il nome della tua squadra.</p>`;

      // Proiezione della classifica
      const squadre = form.filter((s) => !s.f.errore).map((s) => ({
        nome: s.nome, mia: !!s.mia, media: s.f.previsti + spostamento, punti: (lega.punti || {})[s.nome] || 0,
      }));
      if (squadre.length < 2 || !$("#proiezione")) return;
      const r = M.simulaStagione({ squadre, calendario: lega.calendario.giornate, da: g0, a: fineLega(lega), regole: lega.regole });
      const haPunti = Object.keys(lega.punti || {}).length > 0;
      const pc = (x) => (x >= 0.995 ? "99%" : x > 0 && x < 0.01 ? "<1%" : Math.round(x * 100) + "%");
      $("#proiezione").innerHTML = `<div class="proiezione">
          <div class="pr-testa"><span>#</span><span>Squadra</span><span>Ora</span><span>Fine</span><span>1°</span></div>
          ${r.map((x, i) => `<div class="pr-riga ${x.mia ? "mia" : ""}"><span>${i + 1}</span><span class="pr-nome">${esc(x.nome)}</span>
            <input type="number" inputmode="numeric" min="0" data-punti="${esc(x.nome)}" value="${haPunti ? x.punti : ""}" placeholder="0" aria-label="Punti di ${esc(x.nome)} adesso">
            <b>${Math.round(x.puntiFinali)}</b><span class="pr-primo">${pc(x.primo)}</span></div>`).join("")}
        </div>
        ${(() => { const m = r.find((x) => x.mia); return m ? `<p class="piccolo">La tua squadra: <b>${pc(m.primo)}</b> di vincere, <b>${pc(m.podio)}</b> di arrivare nei primi 3, posizione media <b>${m.posizione.toFixed(1)}ª</b>.</p>` : ""; })()}
        <p class="tenue piccolo">${haPunti ? "" : "Scrivi i punti in classifica di adesso nella colonna \"Ora\" per una previsione giusta. "}Fine = punti attesi a fine campionato, 1° = quante volte vince il campionato.</p>
        <button class="btn secondario piccolo" data-azione="salva-punti">Aggiorna con questi punti</button>`;
    }, 30);
  }

  function chipGiocatore(g) {
    return `<span class="chip-gioc"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>${esc(g.nome)}${g.quot ? `<small>${g.quot}</small>` : ""}</span>`;
  }

  function cardSfida(lega, mio, avv) {
    const loro = M.consiglia(avv.rosa, dati, lega.regole);
    if (loro.errore) return `<section class="card"><p class="errore">Non riesco a calcolare la formazione di ${esc(avv.nome)}.</p></section>`;
    const diff = mio.previsti - loro.previsti;
    const esito = Math.abs(diff) < 1.5 ? "Partita equilibrata" : diff > 0 ? "Sei favorito" : `${esc(avv.nome)} è favorito`;
    let html = `<section class="card sfida">
      <div class="etichetta">${dati.giornata}ª giornata</div>
      <div class="sfida-punti">
        <div><b>${mio.previsti.toFixed(1)}</b><span>${esc(lega.squadra || "Tu")}</span></div>
        <div class="contro">vs</div>
        <div><b>${loro.previsti.toFixed(1)}</b><span>${esc(avv.nome)}</span></div>
      </div>
      <p class="esito ${Math.abs(diff) < 1.5 ? "" : diff > 0 ? "su" : "giu"}">${esito} (${diff > 0 ? "+" : ""}${diff.toFixed(1)})</p>`;
    const sfida = analisiSfida(lega, mio);
    if (sfida) {
      html += `${barraEsito(sfida.esito)}
        <p class="tenue piccolo">Ho simulato la partita 3.000 volte con le soglie gol della tua lega (primo gol a ${Number(lega.regole.sogliaGol) || 66}, poi ogni ${Number(lega.regole.passoGol) || 6} punti). Gol attesi: tu ${sfida.esito.golMiei.toFixed(1)}, loro ${sfida.esito.golLoro.toFixed(1)}.</p>`;
    }
    html += `<div class="etichetta" style="margin-top:12px">Loro probabile formazione · ${esc(loro.modulo)}</div>`;
    for (const r of M.RUOLI) {
      html += `<div class="loro-riga"><span class="ruolo ${r}">${r}</span><span>${loro.perRuolo[r].map((g) => `${esc(g.nome)} <small class="${livello(g)}">${g.prob}%</small>`).join(", ")}</span></div>`;
    }
    if (loro.daNonSchierare.length) {
      html += `<p class="tenue piccolo"><b>Senza:</b> ${loro.daNonSchierare.map((g) => `${esc(g.nome)} (${esc(g.stato)})`).join(", ")}</p>`;
    }
    if (lega.regole.modCentrocampo) {
      const somma = (r) => r.perRuolo.C.reduce((s, g) => s + (g.prob / 100) * 6, 0);
      const d = somma(mio) - somma(loro);
      html += `<p class="tenue piccolo"><b>Modificatore centrocampo:</b> tu ${mio.perRuolo.C.length} centrocampisti, loro ${loro.perRuolo.C.length}. ${d >= 1.5 ? "Dovresti vincerlo tu." : d <= -1.5 ? "Rischi di perderlo: valuta un centrocampista in più." : "In bilico."}</p>`;
    }
    html += `</section>`;
    return html;
  }

  function vistaLega(lega) {
    const avversari = lega.avversari || [];
    if (!avversari.length) {
      return `<section class="card">
        <h2>Le squadre della tua lega</h2>
        <p class="tenue">Aggiungi le squadre dei tuoi amici: l'app studia il tuo avversario di ogni giornata, ti dice chi è più forte e ti consiglia gli scambi.</p>
        ${aiuto([
          "Su fantacalcio.it apri <b>Lega → Rose</b> e fai lo screenshot della rosa di un avversario.",
          "Qui tocca <b>+ Aggiungi una squadra</b>, scrivi il nome e carica lo screenshot.",
          "Tocca <b>Salva</b> e ripeti per ogni squadra (circa 1 minuto l'una).",
        ])}
        <button class="btn piena" data-azione="nuovo-avv">+ Aggiungi una squadra</button>
      </section>
      ${boxIncollaLega("Hai già le rose scritte? Incollale")}`;
    }

    const mio = calcola(lega);
    const avv = avversarioDiGiornata(lega);
    let html = `<section class="card">
      <label for="l-avv" style="margin-top:0">Il tuo avversario in questa giornata${(() => { const p = partitaMia(lega, giornataLega(lega)); return p && !(lega.avversario && lega.avversario.giornata === dati.giornata) ? ` <small class="tenue">· dal calendario, ${p.casa ? "in casa" : "in trasferta"}</small>` : ""; })()}</label>
      <select id="l-avv" data-cambia="avversario">
        <option value="">Scegli…</option>
        ${avversari.map((s) => `<option ${avv && avv.nome === s.nome ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}
      </select>
    </section>`;
    if (avv && !mio.errore) html += cardSfida(lega, mio, avv);

    html += cardCalendario(lega);
    html += `<section class="card"><h2>Scambi consigliati <small>in base alle rose</small></h2>
      <div id="scambi"><p class="tenue">Sto cercando gli scambi migliori…</p></div></section>`;

    const classifica = M.classificaLega(lega.rosa, lega.squadra || "La tua squadra", avversari, dati, lega.regole);
    const max = Math.max(...classifica.map((c) => c.previsti), 1);
    html += `<section class="card"><h2>Forza delle rose <small>punti previsti questa giornata</small></h2>`;
    classifica.forEach((c, i) => {
      html += `<div class="forza ${c.mia ? "mia" : ""}"><span class="pos">${i + 1}</span><span class="forza-nome">${esc(c.nome)}</span>
        <span class="forza-barra"><i style="width:${Math.max(4, (c.previsti / max) * 100)}%"></i></span><b>${c.previsti.toFixed(1)}</b></div>`;
    });
    html += `</section>
      <section class="card"><h2>Le squadre <small>${avversari.length === 1 ? "1 avversario" : avversari.length + " avversari"}</small></h2>
        ${avversari.map((s, i) => `<div class="riga-rosa">
          <button class="riga" data-modifica-avv="${i}"><span class="nome">${esc(s.nome)}<span class="dettaglio">${s.rosa.length} giocatori · tocca per modificare</span></span><span class="tenue">✏️</span></button>
          <button class="x" data-togli-avv="${i}" aria-label="Togli ${esc(s.nome)}">×</button>
        </div>`).join("")}
        <button class="btn secondario piena" data-azione="nuovo-avv" style="margin-top:10px">+ Aggiungi una squadra</button>
      </section>
      ${boxIncollaLega("Incolla tutte le rose insieme")}`;
    return html;
  }

  function boxIncollaLega(titolo) {
    return `<details class="card">
        <summary>${titolo}</summary>
        <p class="tenue piccolo">Il nome di ogni squadra su una riga da solo, sotto i suoi giocatori con la squadra di Serie A. Sostituisce tutte le squadre.</p>
        <textarea id="l-rose" placeholder="Bocanapoli&#10;P Carnesecchi Atalanta&#10;D Di Lorenzo Napoli&#10;...&#10;&#10;Diabolikus&#10;P Skorupski Bologna&#10;..."></textarea>
        <div class="azioni" style="margin-top:8px"><button class="btn secondario" data-azione="salva-rose">Salva le rose</button></div>
      </details>`;
  }

  function riempiScambi(lega) {
    const box = $("#scambi");
    if (!box) return;
    setTimeout(() => {
      let lista;
      try {
        lista = M.scambi(lega.rosa, lega.avversari || [], dati, lega.regole);
      } catch (e) {
        box.innerHTML = `<p class="errore">Errore nel calcolo degli scambi.</p>`;
        return;
      }
      if (!lista.length) {
        box.innerHTML = `<p class="tenue">Non ho trovato scambi che ti migliorano senza far perdere troppo all'altra squadra. Riprova dopo il prossimo aggiornamento dei dati.</p>`;
        return;
      }
      box.innerHTML = lista.map((p) => `<div class="scambio">
          <div class="scambio-testa"><b>${esc(p.squadra)}</b><span class="cambio su">+${p.guadagno.toFixed(1)} punti per te</span></div>
          <div class="scambio-righe">
            <div><span class="etichetta">Dai</span>${p.dai.map(chipGiocatore).join("")}</div>
            <div><span class="etichetta">Ricevi</span>${p.ricevi.map(chipGiocatore).join("")}</div>
          </div>
          <p class="tenue piccolo">Perché accettano: ${p.guadagnoLoro >= 0.2 ? `anche loro guadagnano ${p.guadagnoLoro.toFixed(1)} punti` : p.guadagnoLoro >= -0.2 ? "per loro cambia poco in campo" : `perdono solo ${Math.abs(p.guadagnoLoro).toFixed(1)} punti`}${p.diffQuot == null ? "" : p.diffQuot > 0 ? ` e ricevono ${p.diffQuot} ${p.diffQuot === 1 ? "credito" : "crediti"} di quotazione in più` : p.diffQuot === 0 ? " e le quotazioni sono pari" : ` e le quotazioni sono quasi pari (${p.diffQuot})`}.</p>
        </div>`).join("");
    }, 30);
  }

  // Confronta i dati nuovi con quelli dell'ultima volta e salva cosa è cambiato
  function aggiornaNovita(lega) {
    if (!dati.aggiornato || lega.fotoData === dati.aggiornato) return;
    lega.novita = lega.foto
      ? M.novita(lega.rosa, dati, lega.foto).map((g) => ({
          nome: g.nome, ruolo: g.ruolo, chiave: g.chiave, prob: g.prob, stato: g.stato,
          primaProb: g.prima.prob, primaStato: g.prima.stato, nota: g.nota,
        }))
      : [];
    lega.foto = M.fotografa(lega.rosa, dati);
    lega.fotoData = dati.aggiornato;
    salva();
  }

  function cardNovita(lega) {
    if (!lega.novita || !lega.novita.length) return "";
    const testo = (s, p) => (M.FUORI.includes(s) ? s : p + "%");
    let html = `<section class="card novita"><h2>🆕 Novità <small>dall'ultimo aggiornamento</small></h2>`;
    for (const n of lega.novita) {
      const giu = n.prob < n.primaProb;
      html += `<button class="riga" data-gioc="${esc(n.chiave)}"><span class="ruolo ${n.ruolo}">${n.ruolo}</span>
        <span class="nome">${esc(n.nome)}${n.nota ? `<span class="dettaglio">${esc(n.nota)}</span>` : ""}</span>
        <span class="cambio ${giu ? "giu" : "su"}">${esc(testo(n.primaStato, n.primaProb))} <b>${giu ? "↓" : "↑"}</b> ${esc(testo(n.stato, n.prob))}</span></button>`;
    }
    html += `<button class="btn secondario piccolo" data-azione="visto" style="margin-top:8px">Ok, visto</button></section>`;
    return html;
  }

  function vistaRegole(lega) {
    const r = lega.regole;
    const casella = (m) => `<label class="opzione-modulo"><input type="checkbox" data-modulo="${m}" ${r.moduli.includes(m) ? "checked" : ""}><span>${m}</span></label>`;
    const opz = (k, titolo, spiega) => `<label class="interruttore"><span>${titolo}<small>${spiega}</small></span><input type="checkbox" role="switch" data-regola="${k}" ${r[k] ? "checked" : ""}></label>`;
    return `${lega.regoleViste ? "" : `<section class="card">${aiuto([
        "Su fantacalcio.it apri la tua lega → <b>Impostazioni</b> o <b>Regolamento</b>.",
        "Qui sotto attiva gli stessi moduli e modificatori.",
        "Se non sai qualcosa lascialo com'è: va bene lo stesso.",
        "Tocca <b>Salva regole</b> in fondo.",
      ], "Le regole in 2 minuti")}</section>`}
    <section class="card">
      <h2>Lega</h2>
      <label for="g-nome">Nome della lega</label>
      <input id="g-nome" type="text" value="${esc(lega.nome)}">
      <label for="g-squadra">Nome della tua squadra</label>
      <input id="g-squadra" type="text" value="${esc(lega.squadra || "")}" placeholder="Es. Birkenstoke City">
    </section>
    <section class="card">
      <h2>Moduli ammessi <small>tocca per attivare</small></h2>
      <div class="moduli">${MODULI_CLASSICI.map(casella).join("")}</div>
      <div class="reparto-titolo">Moduli extra</div>
      <div class="moduli">${MODULI_EXTRA.map(casella).join("")}</div>
    </section>
    <section class="card">
      <h2>Modificatori e opzioni</h2>
      ${opz("modDifesa", "Modificatore difesa", "Premia chi schiera almeno 4 difensori")}
      ${opz("modCentrocampo", "Modificatore centrocampo", "Premia chi schiera più centrocampisti")}
      ${opz("capitano", "Capitano e vice", "Il capitano prende bonus e malus doppi")}
      ${opz("switch", "Switch", "Colleghi un titolare a un panchinaro per i ballottaggi")}
      ${opz("switchPlus", "Switch Plus", "Lo switch vale anche tra ruoli diversi")}
      <div class="due-colonne">
        <div><label for="g-panca">Panchinari</label>
        <input id="g-panca" type="number" min="0" max="20" inputmode="numeric" placeholder="tutti" value="${esc(r.panchinari)}"></div>
        <div><label for="g-timeout">Anticipo (minuti)</label>
        <input id="g-timeout" type="number" min="0" max="120" inputmode="numeric" value="${esc(r.timeout)}"></div>
      </div>
      <p class="tenue piccolo">L'anticipo è il "timeout" della lega: quanti minuti prima della prima partita si chiude la formazione.</p>
      <div class="due-colonne">
        <div><label for="g-soglia">Primo gol a</label>
        <input id="g-soglia" type="number" min="50" max="80" step="0.5" inputmode="decimal" value="${esc(r.sogliaGol || 66)}"></div>
        <div><label for="g-passo">Un gol ogni</label>
        <input id="g-passo" type="number" min="1" max="10" step="0.5" inputmode="decimal" value="${esc(r.passoGol || 6)}"></div>
      </div>
      <p class="tenue piccolo">Le soglie gol della lega: di solito 66, poi un gol ogni 6 punti (72, 78…). Servono per calcolare quanto spesso vinci.</p>
      <label for="g-media">Punti medi di una squadra a giornata</label>
      <input id="g-media" type="number" min="55" max="90" step="0.5" inputmode="decimal" value="${esc(r.mediaLega || 72)}">
      <p class="tenue piccolo">Lo trovi in classifica: punti totali ÷ giornate giocate. Se non lo sai lascia 72.</p>
    </section>
    <div class="azioni" style="margin-bottom:12px">
      <button class="btn" data-azione="salva-regole">Salva regole</button>
      <button class="btn pericolo" data-azione="elimina">Elimina lega</button>
    </div>
    ${stato.fonte ? `<section class="card collegata">
      <h2>🔗 Leghe collegate</h2>
      <p class="tenue piccolo">Rose, calendario e classifica si aggiornano da sole ogni volta che apri l'app. Le tue scelte (sempre titolare, mai titolare) restano.</p>
      <div class="azioni"><button class="btn secondario piccolo" data-azione="sincronizza">Controlla adesso</button><button class="btn secondario piccolo" data-azione="scollega">Scollega</button></div>
    </section>` : ""}
    <section class="card">
      <h2>📲 Su un altro telefono</h2>
      <p class="tenue piccolo">Copia un link con tutte le tue leghe (rose, regole, avversari) e mandatelo su WhatsApp o Messaggi. Aprilo sull'altro telefono e le ritrovi tutte.</p>
      <div class="azioni"><button class="btn secondario" data-azione="esporta">Copia il link con le mie leghe</button>
      <button class="btn secondario" data-azione="importa-codice">Incolla un link</button></div>
    </section>`;
  }

  // ---------- Scheda giocatore ----------
  function apriScheda(k) {
    const lega = legaAttiva();
    if (!lega) return;
    const r = ultimo || calcola(lega);
    const g = r.giocatori.find((x) => x.chiave === k);
    if (!g) return;
    const titolare = r.titolari && r.titolari.includes(g);
    const posPanca = r.panchina ? r.panchina.indexOf(g) : -1;
    const ruoloAttuale = titolare ? "Titolare consigliato" : posPanca >= 0 ? `${posPanca + 1}° in panchina` : "Fuori";
    const barra = M.FUORI.includes(g.stato) ? 0 : g.prob;
    const scelta = g.fisso ? "fisso" : g.escluso ? "escluso" : "auto";
    const pannello = $(".foglio-pannello");
    pannello.innerHTML = `
      <div class="maniglia" aria-hidden="true"></div>
      <div class="scheda-testa">
        <span class="maglia grande ${g.ruolo} ${livello(g)}"><span>${g.ruolo}</span></span>
        <div>
          <h3 id="foglio-titolo">${esc(g.nome)}</h3>
          <div class="tenue">${RUOLO_SING[g.ruolo]} · ${esc(g.squadra)}</div>
        </div>
      </div>
      <div class="scheda-griglia">
        <div><small>Partita</small><b>${g.partita ? `${g.partita.inCasa ? "vs" : "@"} ${esc(g.partita.avversario)}` : "—"}</b><span>${g.partita ? quando(g.partita.inizio) : ""}</span></div>
        <div><small>Situazione</small><b>${STATI[g.stato] || esc(g.stato)}</b><span>${ruoloAttuale}</span></div>
        <div><small>Titolare</small><b>${M.FUORI.includes(g.stato) ? "—" : g.prob + "%"}</b><span class="barra"><i class="${livello(g)}" style="width:${barra}%"></i></span></div>
        <div><small>Voto previsto</small><b>${g.fv.toFixed(1)}</b><span>se gioca</span></div>
      </div>
      ${g.nota ? `<p class="scheda-nota">${esc(g.nota)}</p>` : ""}
      <p class="calcolo"><span>Punti previsti</span> ${g.prob}% × ${g.fv.toFixed(1)} = <b>${g.valore.toFixed(1)}</b></p>
      <div class="etichetta">Le tue scelte</div>
      <div class="scelte" role="radiogroup" aria-label="Scelta per ${esc(g.nome)}">
        <button role="radio" aria-checked="${scelta === "auto"}" data-pref="auto" data-k="${esc(k)}">🤖<span>Decide l'app</span></button>
        <button role="radio" aria-checked="${scelta === "fisso"}" data-pref="fisso" data-k="${esc(k)}">📌<span>Sempre titolare</span></button>
        <button role="radio" aria-checked="${scelta === "escluso"}" data-pref="escluso" data-k="${esc(k)}">🚫<span>Mai titolare</span></button>
      </div>
      <button class="btn secondario piena" data-chiudi>Chiudi</button>`;
    const f = $("#foglio");
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add("aperto"));
  }
  // ---------- Trasferire le leghe su un altro telefono ----------
  // Le leghe viaggiano dentro il link, dopo il "#": quella parte non arriva mai al server.
  const compattaRosa = (rosa) => (rosa || []).map((g) => [g.nome, g.squadra, g.ruolo, g.quot || 0]);
  const espandiRosa = (righe) => (righe || []).map(([nome, squadra, ruolo, quot]) => (quot ? { nome, squadra, ruolo, quot } : { nome, squadra, ruolo }));

  function pacchetto(leghe) {
    return leghe.map((l) => ({
      n: l.nome, s: l.squadra || "", g: l.regole, r: compattaRosa(l.rosa),
      a: (l.avversari || []).map((x) => [x.nome, compattaRosa(x.rosa)]),
      v: l.avversario || null, f: l.fissi || [], e: l.esclusi || [], c: l.calendario || null, p: l.punti || null,
    }));
  }
  function spacchetta(p) {
    return p.map((l, i) => ({
      id: "l" + Date.now().toString(36) + i, nome: l.n, squadra: l.s, regole: { ...regoleBase(), ...l.g },
      rosa: espandiRosa(l.r), avversari: (l.a || []).map(([nome, rosa]) => ({ nome, rosa: espandiRosa(rosa) })),
      avversario: l.v, fissi: l.f || [], esclusi: l.e || [], calendario: l.c || null, punti: l.p || null,
    }));
  }
  const daBase64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  async function codiceLeghe(leghe) {
    const testo = new TextEncoder().encode(JSON.stringify(pacchetto(leghe)));
    if (window.CompressionStream) {
      const compressi = new Uint8Array(await new Response(new Blob([testo]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
      let s = "";
      for (let i = 0; i < compressi.length; i += 8000) s += String.fromCharCode(...compressi.subarray(i, i + 8000));
      return "z" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    let s = "";
    for (let i = 0; i < testo.length; i += 8000) s += String.fromCharCode(...testo.subarray(i, i + 8000));
    return "j" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function leggiCodice(codice) {
    const tipo = codice[0];
    const bytes = daBase64(codice.slice(1));
    const testo = tipo === "z"
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text()
      : new TextDecoder().decode(bytes);
    return spacchetta(JSON.parse(testo));
  }
  function indirizzoApp() {
    return location.hostname === "localhost" || location.hostname.startsWith("192.168.")
      ? "https://alessandroamato555.github.io/fanta-consigli/"
      : location.origin + location.pathname;
  }
  async function importa(codice) {
    let nuove;
    try { nuove = await leggiCodice(codice.trim().replace(/^.*#importa=/, "")); } catch (e) {
      return avviso("Codice non valido: copialo di nuovo per intero");
    }
    if (!nuove.length) return;
    const nomi = nuove.map((l) => l.nome).join(", ");
    if (!confirm(`Aggiungere su questo telefono: ${nomi}?\nSe hai già una lega con lo stesso nome viene sostituita.`)) return;
    for (const l of nuove) {
      stato.leghe = stato.leghe.filter((x) => x.nome !== l.nome);
      stato.leghe.push(l);
    }
    stato.attiva = nuove[0].id;
    salva();
    vista = "formazione";
    disegna();
    avviso(`Aggiunte: ${nomi}`);
  }

  // ---------- Guida ----------
  const GUIDA = [
    ["⭐", "Cosa la rende diversa", `<ul>
      <li><b>Quanto spesso vinci</b>: simulo la tua partita contro l'avversario 3.000 volte, con le soglie gol della tua lega, e ti dico vittoria, pari e sconfitta in %.</li>
      <li><b>Formazione anti-avversario</b>: non solo il modulo che fa più punti, ma quello che ti fa vincere più spesso contro quella squadra.</li>
      <li><b>Fatta sulla tua lega</b>: moduli, modificatori, switch, timeout e soglie gol sono i tuoi, non quelli standard.</li>
      <li><b>Scambi con le squadre vere</b>: legge le rose della tua lega e propone scambi equilibrati, che gli altri possono accettare.</li>
      <li><b>Ogni numero è spiegato</b>: tocchi un giocatore e vedi il calcolo.</li>
      <li><b>Gratis, senza login e senza pubblicità</b>: le tue rose restano sul tuo telefono.</li></ul>`],
    ["📊", "Come calcolo i punti", `<p><b>Punti di un giocatore = % che giochi × voto previsto.</b> Es. 90% × 6.8 = 6.1.</p><ul>
      <li><b>%</b>: dalle probabili formazioni (fantacalcio.it, fantamaster e altri), aggiornate alle 9 e alle 18.</li>
      <li><b>Voto previsto</b>: media fantavoto recente (anche coppe), corretta per avversario, casa o trasferta, rigori e bonus possibili.</li>
      <li>Se un titolare non gioca conto il primo panchinaro dello stesso ruolo.</li>
      <li>Aggiungo una stima dei modificatori e provo tutti i tuoi moduli.</li></ul>`],
    ["🪑", "Panchina e switch", `<ul>
      <li>Panchina ordinata per ruolo (P, D, C, A) e, dentro il ruolo, dal più utile: entra il primo dello stesso ruolo.</li>
      <li>Switch: collego un titolare incerto al suo rivale nel ballottaggio. Chi parte titolare entra in formazione.</li>
      <li>📌 Sempre titolare / 🚫 Mai titolare: tocchi un giocatore e decidi tu.</li></ul>`],
    ["🎯", "Probabilità di vittoria", `<ul>
      <li>In ogni simulazione ogni giocatore gioca o no secondo la sua %, e il voto cambia un po' (gli attaccanti di più, per i gol).</li>
      <li>Porto la media ai punti veri della tua lega (li metti in Regole): così conto anche bonus come il gol vittoria.</li>
      <li>Trasformo i punti in gol con le soglie della tua lega e conto vittorie, pareggi e sconfitte.</li>
      <li>È una stima: 60% vuol dire che su 10 partite così ne vinci circa 6.</li></ul>`],
    ["📅", "Calendario e campionato", `<ul>
      <li>Carichi il calendario (screenshot o testo): l'app sa da sola chi affronti ogni giornata, anche se il girone si ripete.</li>
      <li><b>Prossime sfide</b>: la % di vittoria delle prossime 5 partite, con le rose di oggi (gli infortuni brevi contano a metà).</li>
      <li><b>Come può finire</b>: gioco il resto del campionato 2.000 volte partendo dalla classifica di adesso. Vedi i punti attesi a fine stagione e quante volte ognuno vince.</li></ul>`],
    ["🔁", "Scambi", `<ul>
      <li>Provo tutti gli scambi 1 contro 1 e 2 contro 2 con gli stessi ruoli.</li>
      <li>Tengo quelli che ti fanno guadagnare punti e sono equilibrati come quotazione (al massimo 2 crediti di differenza), così l'altro può accettare.</li>
      <li>Conta tutta la stagione, non solo questa giornata: chi ha un problema breve non lo svendo.</li></ul>`],
    ["🛒", "Mercato e novità", `<ul>
      <li><b>Da prendere</b>: i titolari sicuri non in rosa con il voto previsto più alto. Controlla tu se sono liberi.</li>
      <li><b>Da vendere</b>: infortunati lunghi e chi non gioca quasi mai.</li>
      <li><b>Novità</b>: quando i dati cambiano ti dico chi è salito o sceso.</li></ul>`],
    ["⚠️", "Limiti", `<ul>
      <li>Sono stime: un gol al 90' cambia tutto.</li>
      <li>La formazione non la inserisco io: la copi tu su fantacalcio.it.</li>
      <li>Ricontrolla poco prima della scadenza: le probabili cambiano fino all'ultimo.</li></ul>`],
  ];

  function apriGuida() {
    const pannello = $(".foglio-pannello");
    pannello.innerHTML = `<div class="maniglia" aria-hidden="true"></div>
      <h3 id="foglio-titolo" class="guida-titolo">Come funziona Fanta Consigli</h3>
      ${GUIDA.map(([icona, titolo, testo], i) => `<details class="guida" ${i === 0 ? "open" : ""}><summary><span>${icona}</span>${titolo}</summary><div>${testo}</div></details>`).join("")}
      <p class="tenue piccolo centro" style="margin-top:12px">Versione ${VERSIONE}</p>
      <button class="btn secondario piena" data-chiudi>Chiudi</button>`;
    const f = $("#foglio");
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add("aperto"));
  }

  function chiudiScheda() {
    const f = $("#foglio");
    f.classList.remove("aperto");
    setTimeout(() => { f.hidden = true; }, 200);
  }

  // ---------- Scegli i giocatori (tocca per aggiungere) ----------
  // Lista di tutti i giocatori di Serie A: cerchi, tocchi, fatto. Vale per la tua rosa e per quelle degli avversari.
  const LIMITI = { P: 3, D: 8, C: 8, A: 6 };
  const CORTO_RUOLO = { P: "Portieri", D: "Difensori", C: "Centroc.", A: "Attaccanti" };
  let listone = [];
  let scelta = null; // { chi: "mia" | numero avversario | "nuovo", nome, sel: [], ruolo, cerca, nuovaLega }

  function giocatoriTutti() {
    return listone.length ? listone : (dati.giocatori || []).map((g) => ({ nome: g.nome, squadra: g.squadra, ruolo: g.ruolo, quot: 0 }));
  }

  // Chi è già in un'altra squadra della stessa lega
  function giaPresi(lega, chi) {
    const presi = new Map();
    if (chi !== "mia") lega.rosa.forEach((g) => presi.set(M.chiave(g), "")); // "" = nella tua rosa
    (lega.avversari || []).forEach((s, i) => { if (i !== chi) s.rosa.forEach((g) => presi.set(M.chiave(g), s.nome)); });
    return presi;
  }

  function apriScegli(lega, chi, nuovaLega) {
    const rosa = chi === "mia" ? lega.rosa : chi === "nuovo" ? [] : lega.avversari[chi].rosa;
    const sel = rosa.map((g) => ({ ...g }));
    const ruolo = M.RUOLI.find((r) => sel.filter((g) => g.ruolo === r).length < LIMITI[r]) || "P";
    scelta = { chi, nome: chi === "mia" || chi === "nuovo" ? "" : lega.avversari[chi].nome, sel, ruolo, cerca: "", nuovaLega: !!nuovaLega };
    vista = "scegli";
    disegna();
    window.scrollTo(0, 0);
  }

  function vistaScegli(lega) {
    const avv = scelta.chi !== "mia";
    const titolo = avv ? (scelta.chi === "nuovo" ? "Nuova squadra avversaria" : "Rosa di " + esc(scelta.nome)) : "La tua rosa";
    return `<section class="card scegli-testa">
        <h2>${titolo} <small id="s-totale"></small></h2>
        ${avv ? `<input id="s-nome" type="text" placeholder="Nome della squadra (es. Bocanapoli)" value="${esc(scelta.nome)}" autocomplete="off">` : ""}
        <div class="ruoli-tab" id="s-ruoli" role="tablist"></div>
        <div class="cerca-riga">
          <input id="s-cerca" type="search" placeholder="Cerca giocatore…" autocomplete="off" enterkeyhint="search" value="${esc(scelta.cerca)}">
          <label class="btn secondario foto" title="Leggi i giocatori da uno screenshot">📷<span>Screenshot</span>
            <input id="s-foto" type="file" accept="image/*" multiple hidden></label>
        </div>
        <div id="s-stato-foto" class="stato-foto" hidden></div>
        <div id="s-scelti" class="scelti"></div>
      </section>
      <section class="card lista-scegli" id="s-lista"></section>
      <div class="scegli-fondo">
        <button class="btn secondario" data-azione="scegli-annulla">Annulla</button>
        <button class="btn" data-azione="scegli-fatto" id="s-fatto">Salva</button>
      </div>`;
  }

  function aggiornaScegli() {
    const lega = legaAttiva();
    if (!scelta || !lega || !$("#s-lista")) return;
    const conta = (r) => scelta.sel.filter((g) => g.ruolo === r).length;
    const totale = scelta.sel.length;
    const pieno = Object.values(LIMITI).reduce((a, b) => a + b, 0);
    $("#s-totale").textContent = `${totale}/${pieno}`;
    $("#s-fatto").textContent = `Salva · ${totale} giocatori`;
    $("#s-ruoli").innerHTML = M.RUOLI.map((r) => {
      const c = conta(r);
      const stato = c === LIMITI[r] ? "completo" : c > LIMITI[r] ? "troppi" : "";
      return `<button role="tab" class="tab-ruolo ${r} ${stato}" data-scegli-ruolo="${r}" aria-selected="${!scelta.cerca && scelta.ruolo === r}">
        <span>${CORTO_RUOLO[r]}</span><b>${c}/${LIMITI[r]}</b></button>`;
    }).join("");

    // I giocatori già scelti del ruolo che stai guardando: li tocchi per toglierli
    const visti = scelta.cerca ? scelta.sel : scelta.sel.filter((g) => g.ruolo === scelta.ruolo);
    $("#s-scelti").innerHTML = visti.length
      ? visti.map((g) => `<button class="chip-gioc togli" data-togli-scelto="${esc(M.chiave(g))}" aria-label="Togli ${esc(g.nome)}"><span class="ruolo ${g.ruolo}">${g.ruolo}</span>${esc(g.nome)} <small>×</small></button>`).join("")
      : scelta.sel.length ? `<p class="tenue piccolo">Tocca i giocatori qui sotto per aggiungerli.</p>` : "";
    const guida = scelta.sel.length || scelta.cerca ? "" : aiuto([
          ...(scelta.chi !== "mia" ? ["Scrivi in alto il <b>nome della squadra</b>."] : []),
          "Su fantacalcio.it apri la rosa e fai lo <b>screenshot</b> (due se è lunga).",
          "Tocca <b>📷 Screenshot</b> e scegli le foto: i giocatori si aggiungono da soli.",
          "Chi manca: scrivi il nome nella ricerca e toccalo. Chi è sbagliato: tocca la ×.",
          "Tocca <b>Salva</b> in basso.",
        ]);

    const presi = giaPresi(lega, scelta.chi);
    const scelti = new Set(scelta.sel.map(M.chiave));
    const q = M.norm(scelta.cerca);
    let lista = giocatoriTutti();
    lista = q
      ? lista.filter((g) => M.norm(g.nome + " " + g.squadra).includes(q) || M.norm(g.squadra).startsWith(q))
      : lista.filter((g) => g.ruolo === scelta.ruolo);
    // Prima i liberi, poi quelli già in un'altra rosa (non si possono scegliere)
    lista = [...lista.filter((g) => !presi.has(M.chiave(g)) || scelti.has(M.chiave(g))), ...lista.filter((g) => presi.has(M.chiave(g)) && !scelti.has(M.chiave(g)))];
    const mostra = lista.slice(0, q ? 60 : 400);
    $("#s-lista").innerHTML = guida + (mostra.length
      ? mostra.map((g) => {
          const k = M.chiave(g);
          const preso = presi.get(k);
          const si = scelti.has(k);
          return `<button class="riga-scegli ${si ? "scelto" : ""}" data-tocca="${esc(k)}" ${preso !== undefined && !si ? "disabled" : ""} aria-pressed="${si}">
            <span class="ruolo ${g.ruolo}">${g.ruolo}</span>
            <span class="nome">${esc(g.nome)}<span class="dettaglio">${esc(g.squadra)}${preso !== undefined && !si ? (preso ? " · già di " + esc(preso) : " · è nella tua rosa") : ""}</span></span>
            ${g.quot ? `<span class="quot">${g.quot}</span>` : ""}<span class="spunta" aria-hidden="true">${si ? "✓" : "+"}</span></button>`;
        }).join("") + (lista.length > mostra.length ? `<p class="tenue piccolo centro">Scrivi qualche lettera per trovare gli altri</p>` : "")
      : `<p class="tenue centro">Nessun giocatore trovato.<br><button class="link" data-azione="scegli-a-mano">Aggiungi "${esc(scelta.cerca)}" a mano</button></p>`);
  }


  // ---------- Leggere la rosa da uno screenshot ----------
  // Il riconoscimento del testo gira nel telefono (Tesseract): le immagini non vanno da nessuna parte.
  let lettore = null;
  function caricaScript(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = ko;
      document.head.appendChild(s);
    });
  }
  async function testoDaImmagini(files, scrivi) {
    scrivi(`<span class="gira"></span> Preparo la lettura… (la prima volta ci mette un po')`);
    if (!window.Tesseract) await caricaScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    if (!lettore) lettore = await Tesseract.createWorker("ita");
    let testo = "";
    for (let i = 0; i < files.length; i++) {
      scrivi(`<span class="gira"></span> Leggo lo screenshot ${files.length > 1 ? `${i + 1} di ${files.length}` : ""}…`);
      const r = await lettore.recognize(files[i]);
      testo += "\n" + r.data.text;
    }
    return testo;
  }

  async function calendarioDaScreenshot(files) {
    const box = $("#c-stato-foto");
    const scrivi = (t) => { if (box) { box.hidden = false; box.innerHTML = t; } };
    try {
      const testo = await testoDaImmagini(files, scrivi);
      const area = $("#c-testo");
      if (area) area.value = (area.value ? area.value + "\n" : "") + testo.trim();
      scrivi("✅ Letto. Controlla i due campi sopra e tocca <b>Salva il calendario</b>.");
    } catch (e) {
      scrivi("Non riesco a leggere lo screenshot: controlla la connessione e riprova.");
    }
  }

  async function leggiScreenshot(files) {
    const box = $("#s-stato-foto");
    const scrivi = (t) => { if (box) { box.hidden = false; box.innerHTML = t; } };
    try {
      const testo = await testoDaImmagini(files, scrivi);
      if (!scelta) return;
      const lega = legaAttiva();
      const presi = giaPresi(lega, scelta.chi);
      const giaScelti = new Set(scelta.sel.map(M.chiave));
      const liberi = giocatoriTutti().filter((g) => !presi.has(M.chiave(g)));
      const { trovati, dubbi } = M.trovaNelTesto(testo, liberi);
      const nuovi = trovati.filter((g) => !giaScelti.has(M.chiave(g)));
      nuovi.forEach((g) => scelta.sel.push({ nome: g.nome, squadra: g.squadra, ruolo: g.ruolo, ...(g.quot ? { quot: g.quot } : {}) }));
      scelta.ruolo = M.RUOLI.find((r) => scelta.sel.filter((g) => g.ruolo === r).length < LIMITI[r]) || scelta.ruolo;
      scelta.cerca = "";
      aggiornaScegli();
      const manca = Object.values(LIMITI).reduce((a, b) => a + b, 0) - scelta.sel.length;
      scrivi(nuovi.length
        ? `✅ Ho aggiunto <b>${nuovi.length}</b> giocatori.${manca > 0 ? ` Ne mancano ${manca}: cercali qui sopra o carica un altro screenshot.` : " Controlla e tocca Salva."}${dubbi.length ? `<br><small>Non sono sicuro di: ${dubbi.map(esc).join(", ")}. Cercali a mano.</small>` : ""}`
        : `Non ho riconosciuto giocatori. Prova uno screenshot più nitido, con i nomi ben visibili.`);
    } catch (e) {
      scrivi("Non riesco a leggere lo screenshot: controlla la connessione e riprova.");
    }
  }

  function toccaGiocatore(k) {
    const g = giocatoriTutti().find((x) => M.chiave(x) === k) || scelta.sel.find((x) => M.chiave(x) === k);
    if (!g) return;
    const i = scelta.sel.findIndex((x) => M.chiave(x) === k);
    if (i >= 0) {
      scelta.sel.splice(i, 1);
    } else {
      scelta.sel.push({ nome: g.nome, squadra: g.squadra, ruolo: g.ruolo, ...(g.quot ? { quot: g.quot } : {}) });
      const n = scelta.sel.filter((x) => x.ruolo === g.ruolo).length;
      if (scelta.cerca) {
        // Dopo una ricerca torno alla lista del ruolo, pronta per il prossimo nome
        scelta.cerca = "";
        $("#s-cerca").value = "";
        scelta.ruolo = g.ruolo;
      }
      if (n === LIMITI[g.ruolo]) {
        const prossimo = M.RUOLI.find((r) => scelta.sel.filter((x) => x.ruolo === r).length < LIMITI[r]);
        if (prossimo && prossimo !== g.ruolo) {
          scelta.ruolo = prossimo;
          avviso(`${NOMI_RUOLO[g.ruolo]} completi · ora i ${NOMI_RUOLO[prossimo].toLowerCase()}`);
          $("#s-lista").scrollIntoView({ block: "start" });
          window.scrollTo(0, 0);
        } else if (!prossimo) avviso("Rosa completa: tocca Salva");
      }
    }
    aggiornaScegli();
  }

  function salvaScelta() {
    const lega = legaAttiva();
    if (!scelta.sel.length) return avviso("Scegli almeno un giocatore");
    if (scelta.chi === "mia") {
      lega.rosa = scelta.sel;
    } else {
      const nome = ($("#s-nome").value || "").trim();
      if (!nome) { $("#s-nome").focus(); return avviso("Scrivi il nome della squadra"); }
      lega.avversari = lega.avversari || [];
      if (scelta.chi === "nuovo") lega.avversari.push({ nome, rosa: scelta.sel });
      else {
        const vecchio = lega.avversari[scelta.chi].nome;
        lega.avversari[scelta.chi] = { nome, rosa: scelta.sel };
        if (lega.avversario && lega.avversario.nome === vecchio) lega.avversario.nome = nome;
      }
    }
    const nuova = scelta.nuovaLega;
    const quanti = scelta.sel.length;
    const eraAvv = scelta.chi !== "mia";
    scelta = null;
    salva();
    vista = nuova ? "regole" : eraAvv ? "lega" : "rosa";
    disegna();
    window.scrollTo(0, 0);
    avviso(nuova ? `Rosa salvata (${quanti}). Ora imposta le regole` : `Salvata: ${quanti} giocatori`);
  }

  // ---------- Disegno ----------
  function disegna() {
    const lega = legaAttiva();
    if (lega) stato.attiva = lega.id;

    $("#giornata").innerHTML = dati.giornata ? `<b>${dati.giornata}ª</b> giornata` : "";

    $("#leghe").innerHTML = stato.leghe.length
      ? stato.leghe.map((l) => `<button class="chip" data-lega="${l.id}" aria-pressed="${!!(lega && l.id === lega.id && vista !== "nuova")}">${esc(l.nome)}</button>`).join("") +
        `<button class="chip aggiungi" data-azione="nuova" aria-pressed="${vista === "nuova"}">+ Lega</button>`
      : "";

    const schede = [["formazione", "⚽", "Formazione"], ["rosa", "👥", "Rosa"], ["mercato", "🔄", "Mercato"], ["lega", "🏆", "Lega"], ["regole", "⚙️", "Regole"]];
    $("#schede").innerHTML = lega && vista !== "nuova" && vista !== "scegli"
      ? schede.map(([v, i, t]) => `<button class="scheda" data-vista="${v}" ${vista === v ? 'aria-current="page"' : ""}><span>${i}</span><span>${t}</span></button>`).join("")
      : "";

    let html;
    if (vista === "nuova") html = vistaNuova();
    else if (vista === "scegli" && lega && scelta) html = vistaScegli(lega);
    else if (!lega) html = vistaBenvenuto();
    else if (vista === "rosa") html = vistaRosa(lega);
    else if (vista === "regole") html = vistaRegole(lega);
    else if (vista === "mercato") html = vistaMercato(lega);
    else if (vista === "lega") html = vistaLega(lega);
    else { aggiornaNovita(lega); html = vistaFormazione(lega); }
    $("#contenuto").innerHTML = html;
    if (vista === "lega" && lega) { riempiScambi(lega); riempiCalendario(lega); }
    if (vista === "scegli") aggiornaScegli();
    document.body.classList.toggle("scegliendo", vista === "scegli");
  }

  function riempiSuggerimenti() {
    $("#lista-giocatori").innerHTML = (dati.giocatori || [])
      .map((g) => `<option value="${esc(g.nome)} · ${esc(g.squadra)} · ${esc(g.ruolo)}"></option>`)
      .join("");
  }

  // ---------- Azioni ----------
  function testoFormazione(lega) {
    const r = calcola(lega);
    if (r.errore) return r.errore;
    const righe = [`${lega.nome} · ${dati.giornata || ""}ª giornata`, `Modulo ${r.modulo}`];
    for (const ruolo of M.RUOLI) {
      righe.push(`${ruolo}: ` + r.perRuolo[ruolo].map((g) => g.nome + (g === r.capitano ? " (C)" : g === r.vice ? " (VC)" : "")).join(", "));
    }
    righe.push("Panchina: " + r.panchina.map((g, i) => `${i + 1}. ${g.nome}`).join(", "));
    if (r.switch.length) righe.push("Switch: " + r.switch.map((s) => `${s.titolare.nome} ⇄ ${s.panchinaro.nome}`).join(", "));
    return righe.join("\n");
  }

  function scaricaCalendario(lega) {
    const sc = M.scadenza(dati, lega.regole.timeout);
    if (!sc) return;
    const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const inizio = new Date(sc.getTime() - 2 * 3600e3);
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fanta Consigli//IT", "BEGIN:VEVENT",
      `UID:${lega.id}-${dati.giornata}@fantaconsigli`, `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(inizio)}`, `DTEND:${f(sc)}`,
      `SUMMARY:Schiera la formazione - ${lega.nome}`,
      `DESCRIPTION:Scadenza ${quando(sc)}. Apri Fanta Consigli e poi fantacalcio.it.`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Schiera la formazione", "TRIGGER:-PT0M", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Schiera la formazione", "TRIGGER:PT90M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `formazione-${dati.giornata || ""}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Quando scegli un nome dai suggerimenti, compila squadra e ruolo
  document.addEventListener("input", (e) => {
    if (e.target.id === "s-cerca" && scelta) { scelta.cerca = e.target.value; return aggiornaScegli(); }
    if (e.target.id === "s-nome" && scelta) { scelta.nome = e.target.value; return; }
    if (e.target.id !== "a-nome") return;
    const parti = e.target.value.split(" · ");
    if (parti.length === 3) {
      e.target.value = parti[0];
      const sel = $("#a-squadra");
      if (![...sel.options].some((o) => o.value === parti[1])) sel.add(new Option(parti[1]));
      sel.value = parti[1];
      $("#a-ruolo").value = parti[2];
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "s-foto" && e.target.files.length) { leggiScreenshot([...e.target.files]); e.target.value = ""; return; }
    if (e.target.id === "c-foto" && e.target.files.length) { calendarioDaScreenshot([...e.target.files]); e.target.value = ""; return; }
    if (e.target.dataset.cambia !== "avversario") return;
    const lega = legaAttiva();
    lega.avversario = e.target.value ? { giornata: dati.giornata, nome: e.target.value } : null;
    salva(); disegna();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#foglio").hidden) chiudiScheda();
  });

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-chiudi]")) return chiudiScheda();
    const t = e.target.closest("button");
    if (!t) return;
    const lega = legaAttiva();

    if (t.dataset.gioc) return apriScheda(t.dataset.gioc);
    if (t.dataset.tocca && scelta) return toccaGiocatore(t.dataset.tocca);
    if (t.dataset.togliScelto && scelta) return toccaGiocatore(t.dataset.togliScelto);
    if (t.dataset.scegliRuolo && scelta) {
      scelta.ruolo = t.dataset.scegliRuolo; scelta.cerca = ""; $("#s-cerca").value = "";
      return aggiornaScegli();
    }
    if (t.dataset.modificaAvv && lega) return apriScegli(lega, Number(t.dataset.modificaAvv));
    if (t.dataset.togliAvv && lega) {
      const s = lega.avversari[Number(t.dataset.togliAvv)];
      if (!confirm(`Togliere la squadra "${s.nome}"?`)) return;
      lega.avversari.splice(Number(t.dataset.togliAvv), 1);
      if (lega.avversario && lega.avversario.nome === s.nome) lega.avversario = null;
      salva(); disegna(); return avviso(`${s.nome} tolta`);
    }
    if (t.dataset.pref && lega) {
      const k = t.dataset.k;
      pref(lega);
      lega.fissi = lega.fissi.filter((x) => x !== k);
      lega.esclusi = lega.esclusi.filter((x) => x !== k);
      if (t.dataset.pref === "fisso") lega.fissi.push(k);
      if (t.dataset.pref === "escluso") lega.esclusi.push(k);
      salva();
      disegna();
      apriScheda(k);
      return avviso(t.dataset.pref === "auto" ? "Decide l'app" : t.dataset.pref === "fisso" ? "Lo schiero sempre" : "Non lo schiero");
    }
    if (t.dataset.prendi && lega) {
      const g = (dati.giocatori || []).find((x) => M.chiave(x) === t.dataset.prendi);
      if (!g) return;
      lega.rosa.push({ nome: g.nome, squadra: g.squadra, ruolo: g.ruolo });
      salva(); disegna(); return avviso(`${g.nome} aggiunto alla rosa`);
    }
    if (t.dataset.lega) { stato.attiva = t.dataset.lega; if (vista === "nuova") vista = "formazione"; salva(); return disegna(); }
    if (t.dataset.vista) { vista = t.dataset.vista; window.scrollTo(0, 0); return disegna(); }
    if (t.dataset.togli != null && lega) {
      const [via] = lega.rosa.splice(Number(t.dataset.togli), 1);
      salva(); disegna(); return avviso(`${via.nome} tolto`);
    }

    switch (t.dataset.azione) {
      case "visto": lega.novita = []; salva(); return disegna();
      case "usa-modulo":
        lega.moduloScelto = { giornata: dati.giornata, modulo: t.dataset.moduloScelto };
        salva(); disegna(); return avviso(`Modulo ${t.dataset.moduloScelto} per battere l'avversario`);
      case "modulo-auto":
        lega.moduloScelto = null;
        salva(); disegna(); return avviso("Torno al modulo consigliato");
      case "guida": return apriGuida();
      case "esporta": {
        const link = indirizzoApp() + "#importa=" + (await codiceLeghe(stato.leghe));
        try {
          await navigator.clipboard.writeText(link);
          avviso("Link copiato: mandatelo e aprilo sull'altro telefono");
        } catch (err) {
          prompt("Copia questo link e aprilo sull'altro telefono:", link);
        }
        return;
      }
      case "importa-codice": {
        const c = prompt("Incolla il link con le tue leghe:");
        if (!c) return;
        const m = c.match(/#collega=([a-z0-9/_-]+)/i);
        if (m) { stato.fonte = { id: m[1], ultimo: "" }; salva(); return sincronizza(true); }
        await importa(c);
        return;
      }
      case "salva-rose": {
        const lette = M.leggiLega($("#l-rose").value, squadre(), false, dati);
        if (!lette.length) return avviso("Non ho trovato squadre: metti il nome di ogni squadra su una riga da solo");
        const mie = new Set(lega.rosa.map(M.chiave));
        const avversari = [];
        for (const s of lette) {
          const inComune = s.rosa.filter((g) => mie.has(M.chiave(g))).length;
          if (inComune >= Math.min(12, lega.rosa.length * 0.6)) {
            lega.squadra = s.nome;
            // aggiorno le quotazioni della mia rosa se le ho trovate
            const quot = new Map(s.rosa.filter((g) => g.quot).map((g) => [M.chiave(g), g.quot]));
            lega.rosa.forEach((g) => { if (quot.has(M.chiave(g))) g.quot = quot.get(M.chiave(g)); });
          } else {
            avversari.push(s);
          }
        }
        lega.avversari = avversari;
        salva(); disegna();
        return avviso(`Salvate ${avversari.length} squadre avversarie${lega.squadra ? " · la tua è " + lega.squadra : ""}`);
      }
      case "nuova": vista = "nuova"; return disegna();
      case "chiudi-guida": lega.guidaChiusa = true; salva(); return disegna();
      case "chiudi-installa": try { localStorage.setItem("fc.installa.chiuso", "1"); } catch (err) {} return disegna();
      case "ricarica": return ricarica();
      case "sincronizza": return sincronizza(true);
      case "scollega":
        if (!confirm("Scollegare? Le leghe restano sul telefono ma non si aggiornano più da sole.")) return;
        stato.fonte = null; salva(); disegna(); return avviso("Scollegato");
      case "salva-calendario": {
        const mia = $("#c-mia").value.trim();
        const g = Number($("#c-giornata").value);
        if (!mia) { $("#c-mia").focus(); return avviso("Scrivi il nome della tua squadra"); }
        if (!g) { $("#c-giornata").focus(); return avviso("Scrivi che giornata è per la tua lega"); }
        const nomi = [mia, ...(lega.avversari || []).map((s) => s.nome)];
        const testo = $("#c-testo").value;
        const offset = (dati.giornata || g) - g;
        if (!testo.trim()) {
          if (!lega.calendario) return avviso("Incolla il calendario o carica uno screenshot");
          lega.squadra = mia; lega.calendario.offset = offset;
          salva(); disegna(); return avviso("Salvato");
        }
        const giornate = M.leggiCalendario(testo, nomi, mia);
        const mie = Object.values(giornate).filter((l) => l.some(([x, y]) => x === mia || y === mia)).length;
        const punti = M.leggiClassifica(testo, nomi);
        if (!Object.keys(giornate).length && !Object.keys(punti).length) {
          return avviso((lega.avversari || []).length < 2 ? "Prima aggiungi le squadre della lega, poi il calendario" : "Non trovo partite: i nomi delle squadre devono essere come nella lega");
        }
        lega.squadra = mia;
        if (Object.keys(giornate).length) lega.calendario = { offset, giornate };
        else if (lega.calendario) lega.calendario.offset = offset;
        else return avviso("Ho letto la classifica ma non il calendario");
        if (Object.keys(punti).length) lega.punti = { ...(lega.punti || {}), ...punti };
        if (lega.avversario && lega.avversario.giornata === dati.giornata) lega.avversario = null;
        salva(); disegna();
        return avviso(`Calendario salvato: ${Object.keys(giornate).length} giornate, ${mie} con la tua squadra${Object.keys(punti).length ? ` · classifica di ${Object.keys(punti).length} squadre` : ""}`);
      }
      case "salva-punti": {
        lega.punti = {};
        document.querySelectorAll("[data-punti]").forEach((i) => { if (i.value !== "") lega.punti[i.dataset.punti] = Number(i.value) || 0; });
        salva(); disegna(); return avviso("Classifica aggiornata");
      }
      case "modifica-rosa": return apriScegli(lega, "mia");
      case "nuovo-avv": return apriScegli(lega, "nuovo");
      case "scegli-fatto": return salvaScelta();
      case "scegli-annulla": {
        const nuova = scelta && scelta.nuovaLega;
        const eraAvv = scelta && scelta.chi !== "mia";
        scelta = null;
        vista = nuova ? "regole" : eraAvv ? "lega" : "rosa";
        return disegna();
      }
      case "scegli-a-mano": {
        const nome = scelta.cerca.trim();
        const g = { nome, squadra: "", ruolo: scelta.ruolo };
        scelta.sel.push(g);
        scelta.cerca = ""; $("#s-cerca").value = "";
        avviso(`${nome} aggiunto come ${RUOLO_SING[g.ruolo].toLowerCase()}`);
        return aggiornaScegli();
      }
      case "annulla": vista = "formazione"; return disegna();
      case "crea": {
        const nome = $("#n-nome").value.trim() || "La mia lega";
        const nuova = { id: "l" + Date.now().toString(36), nome, rosa: [], regole: regoleBase(), fissi: [], esclusi: [] };
        stato.leghe.push(nuova);
        stato.attiva = nuova.id;
        salva();
        return apriScegli(nuova, "mia", true);
      }
      case "aggiungi": {
        const nome = $("#a-nome").value.trim();
        if (!nome) return avviso("Scrivi il nome");
        lega.rosa.push({ nome, squadra: $("#a-squadra").value, ruolo: $("#a-ruolo").value });
        salva(); disegna(); return avviso(`${nome} aggiunto`);
      }
      case "sostituisci": {
        const rosa = M.leggiRosa($("#r-incolla").value, squadre(), dati);
        if (!rosa.length) return avviso("Non ho trovato giocatori");
        lega.rosa = rosa;
        salva(); disegna(); return avviso(`Rosa aggiornata: ${rosa.length} giocatori`);
      }
      case "salva-regole": {
        const r = lega.regole;
        const moduli = [...document.querySelectorAll("[data-modulo]")].filter((c) => c.checked).map((c) => c.dataset.modulo);
        if (!moduli.length) return avviso("Scegli almeno un modulo");
        lega.nome = $("#g-nome").value.trim() || lega.nome;
        lega.squadra = $("#g-squadra").value.trim();
        r.moduli = moduli;
        for (const c of document.querySelectorAll("[data-regola]")) r[c.dataset.regola] = c.checked;
        if (r.switchPlus) r.switch = true;
        r.panchinari = $("#g-panca").value;
        r.timeout = Number($("#g-timeout").value) || 0;
        r.sogliaGol = Number($("#g-soglia").value) || 66;
        r.passoGol = Number($("#g-passo").value) || 6;
        r.mediaLega = Number($("#g-media").value) || 72;
        lega.regoleViste = true;
        salva(); vista = "formazione"; disegna(); window.scrollTo(0, 0); return avviso("Regole salvate");
      }
      case "elimina":
        if (!confirm(`Eliminare la lega "${lega.nome}" da questo telefono?`)) return;
        stato.leghe = stato.leghe.filter((l) => l.id !== lega.id);
        stato.attiva = stato.leghe[0] ? stato.leghe[0].id : null;
        salva(); vista = "formazione"; return disegna();
      case "copia":
        try {
          await navigator.clipboard.writeText(testoFormazione(lega));
          avviso("Formazione copiata");
        } catch (err) {
          prompt("Copia la formazione:", testoFormazione(lega));
        }
        return;
      case "calendario":
        scaricaCalendario(lega);
        return avviso("Apri il file per aggiungerlo al calendario");
    }
  });

  // Aggiorna il conto alla rovescia
  setInterval(() => {
    const el = document.querySelector("[data-scadenza]");
    if (el) el.textContent = mancano(Number(el.dataset.scadenza) - Date.now());
  }, 30000);

  // Se online c'è una versione più nuova, lo dico e la carico con un tocco
  // Se online c'è una versione più nuova la carico da sola; se stai scrivendo qualcosa aspetto e mostro il tasto
  function staiScrivendo() {
    const a = document.activeElement;
    return vista === "scegli" || vista === "nuova" || !$("#foglio").hidden ||
      (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) ||
      [...document.querySelectorAll("textarea")].some((t) => t.value.trim());
  }
  async function ricarica() {
    try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; await Promise.all(regs.map((x) => x.update())); } catch (err) {}
    location.reload();
  }
  async function controllaVersione() {
    try {
      const r = await fetch("versione.json", { cache: "no-store" });
      const v = (await r.json()).versione;
      // Ricarico una volta sola per versione: se il telefono avesse ancora i file vecchi non entro in un giro infinito
      let gia = null;
      try { gia = sessionStorage.getItem("ricaricato"); } catch (e) {}
      if (v > VERSIONE && !staiScrivendo() && gia !== String(v)) {
        try { sessionStorage.setItem("ricaricato", String(v)); } catch (e) {}
        return ricarica();
      }
      if (v > VERSIONE && !$("#nuova-versione")) {
        const b = document.createElement("button");
        b.id = "nuova-versione"; b.className = "nuova-versione"; b.dataset.azione = "ricarica";
        b.innerHTML = "✨ C'è una nuova versione dell'app · <b>Aggiorna</b>";
        document.body.appendChild(b);
      }
    } catch (e) {}
  }

  // ---------- Leghe collegate al Mac ----------
  // Le leghe arrivano da un file segreto su GitHub (gist): a ogni apertura controllo se c'è una versione nuova.
  async function sincronizza(mostra) {
    const f = stato.fonte;
    if (!f || !f.id) return;
    try {
      // Il file "raw" non ha limiti di richieste (l'API di GitHub ne permette solo 60 l'ora per rete)
      const [utente, id] = f.id.includes("/") ? f.id.split("/") : ["alessandroamato555", f.id];
      const r = await fetch(`https://gist.githubusercontent.com/${encodeURIComponent(utente)}/${encodeURIComponent(id)}/raw/fanta-leghe.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const fonte = await r.json();
      if (!fonte.aggiornato || (f.ultimo && fonte.aggiornato <= f.ultimo)) return mostra && avviso("Le leghe sono già aggiornate");
      if (staiScrivendo()) return; // riprovo la prossima volta, per non cancellare quello che stai facendo
      for (const n of fonte.leghe || []) {
        const vecchia = stato.leghe.find((l) => l.nome.toLowerCase() === n.nome.toLowerCase());
        const nuovi = {
          nome: n.nome, squadra: n.squadra, regole: { ...regoleBase(), ...n.regole }, rosa: n.rosa, avversari: n.avversari || [],
          calendario: n.calendario || null, punti: n.punti || null,
        };
        // Tengo le tue scelte fatte sul telefono (sempre titolare, mai titolare, avversario scelto a mano)
        if (vecchia) Object.assign(vecchia, nuovi);
        else stato.leghe.push({ id: "l" + Date.now().toString(36) + stato.leghe.length, fissi: [], esclusi: [], ...nuovi });
      }
      f.ultimo = fonte.aggiornato;
      salva();
      disegna();
      avviso("🔄 Leghe aggiornate");
    } catch (e) {
      if (mostra) avviso("Non riesco a scaricare le leghe: riprova tra poco");
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { controllaVersione(); sincronizza(); }
  });

  async function avvia() {
    controllaVersione();
    disegna();
    try {
      const r = await fetch("data/giornata.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      dati = await r.json();
      riempiSuggerimenti();
      // Lista di tutti i giocatori di Serie A per sceglierli toccando
      fetch("data/listone.json", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).then((l) => {
        if (!l) return;
        listone = l.giocatori.map(([nome, squadra, ruolo, quot]) => ({ nome, squadra, ruolo, quot }));
        if (vista === "scegli") aggiornaScegli();
      }).catch(() => {});
    } catch (e) {
      avviso("Non riesco a caricare i dati della giornata");
    }
    disegna();
    // Link che collega il telefono alle leghe del Mac (basta aprirlo una volta)
    if (location.hash.startsWith("#collega=")) {
      const id = location.hash.slice("#collega=".length).replace(/[^a-z0-9/_-]/gi, "");
      history.replaceState(null, "", location.pathname + location.search);
      stato.fonte = { id, ultimo: "" };
      salva();
      await sincronizza(true);
      return;
    }
    sincronizza();
    // Link con le leghe da un altro telefono
    if (location.hash.startsWith("#importa=")) {
      const codice = location.hash.slice("#importa=".length);
      history.replaceState(null, "", location.pathname + location.search);
      await importa(codice);
    }
  }
  avvia();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
