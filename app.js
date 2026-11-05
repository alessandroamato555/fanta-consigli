// Interfaccia di Fanta Consigli. Le leghe restano salvate sul telefono di chi usa l'app.
(function () {
  const M = window.Motore;
  const CHIAVE = "fantaconsigli.v1";
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

  // ---------- Viste ----------
  function vistaBenvenuto() {
    return `<section class="benvenuto">
      <div class="benvenuto-campo" aria-hidden="true">
        <span class="maglia A alta"><span>90</span></span><span class="maglia C alta"><span>85</span></span><span class="maglia D media"><span>60</span></span>
      </div>
      <h1>La formazione giusta,<br>ogni giornata</h1>
      <p>Incolla la tua rosa e le regole della tua lega: l'app ti dice chi schierare, in che ordine mettere la panchina e chi lasciare fuori.</p>
      <ol class="passi">
        <li><span><b>Aggiungi la lega</b> e incolla la rosa</span></li>
        <li><span><b>Imposta le regole</b>: moduli e modificatori</span></li>
        <li><span><b>Guarda la formazione</b> e mettila su fantacalcio.it</span></li>
      </ol>
      <button class="btn grande" data-azione="nuova">Aggiungi la tua lega</button>
      <p class="tenue piccolo">Funziona per qualsiasi lega Classic. I tuoi dati restano su questo telefono.</p>
      <button class="link" data-azione="importa-codice">Hai già le leghe su un altro telefono? Incolla il link</button>
    </section>
    <section class="card diversa">
      <h2>Cosa trovi solo qui</h2>
      <div class="punti-forza">
        <div><span>🎯</span><b>Quanto spesso vinci</b><small>Simulo la sfida col tuo avversario 3.000 volte, con le soglie gol della tua lega</small></div>
        <div><span>🧠</span><b>Formazione anti-avversario</b><small>Il modulo che ti fa vincere più spesso contro quella squadra</small></div>
        <div><span>🔁</span><b>Scambi con la tua lega</b><small>Proposte equilibrate con le rose vere dei tuoi amici</small></div>
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
      <label for="n-rosa">La tua rosa</label>
      <textarea id="n-rosa" placeholder="Una riga per giocatore: ruolo, nome, squadra&#10;P Maignan Milan&#10;D Dimarco Inter&#10;C Barella Inter&#10;A Krstovic Atalanta"></textarea>
      <p class="tenue piccolo">Puoi copiarla dalla pagina della rosa su fantacalcio.it o scriverla a mano. Se ti dimentichi qualcuno lo aggiungi dopo.</p>
      <div class="azioni">
        <button class="btn" data-azione="crea">Avanti</button>
        ${stato.leghe.length ? `<button class="btn secondario" data-azione="annulla">Annulla</button>` : ""}
      </div>
    </section>`;
  }

  function vistaFormazione(lega) {
    if (!lega.rosa.length) {
      return `<section class="card vuoto"><p>La rosa è vuota.</p><button class="btn" data-vista="rosa">Aggiungi i giocatori</button></section>`;
    }
    const r = calcola(lega);
    const sc = M.scadenza(dati, lega.regole.timeout);
    let html = "";

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
      <div class="aggiungi-box">
        <label for="a-nome">Aggiungi un giocatore</label>
        <input id="a-nome" type="text" list="lista-giocatori" placeholder="Scrivi il nome…" autocomplete="off">
        <div class="aggiungi-riga">
          <select id="a-squadra" aria-label="Squadra">${squadre().map((s) => `<option>${esc(s)}</option>`).join("")}</select>
          <select id="a-ruolo" aria-label="Ruolo"><option value="P">P</option><option value="D">D</option><option value="C" selected>C</option><option value="A">A</option></select>
          <button class="btn piccolo" data-azione="aggiungi">Aggiungi</button>
        </div>
      </div>`;
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
      <section class="card">
        <h2>Incolla di nuovo la rosa</h2>
        <p class="tenue piccolo">Dopo il mercato o uno scambio: sostituisce tutta la rosa.</p>
        <textarea id="r-incolla" placeholder="P Maignan Milan&#10;D Dimarco Inter&#10;..."></textarea>
        <div class="azioni" style="margin-top:8px"><button class="btn secondario" data-azione="sostituisci">Sostituisci la rosa</button></div>
      </section>`;
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
    if (!a || a.giornata !== dati.giornata) return null;
    return (lega.avversari || []).find((s) => s.nome === a.nome) || null;
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
        <h2>Le rose della tua lega</h2>
        <p class="tenue">Incolla le rose di tutte le squadre: così l'app studia il tuo avversario di ogni giornata, ti dice chi è più forte e ti consiglia gli scambi.</p>
        <p class="tenue piccolo">Su fantacalcio.it vai in <b>Lega → Rose</b>, seleziona tutto e copia. Il nome di ogni squadra deve stare su una riga da solo, sopra i suoi giocatori. La tua squadra la riconosco e la salto.</p>
        <textarea id="l-rose" placeholder="Bocanapoli&#10;P Carnesecchi Atalanta 12&#10;D Di Lorenzo Napoli 12&#10;...&#10;&#10;Diabolikus&#10;P Skorupski Bologna 10&#10;..."></textarea>
        <div class="azioni" style="margin-top:8px"><button class="btn" data-azione="salva-rose">Salva le rose</button></div>
      </section>`;
    }

    const mio = calcola(lega);
    const avv = avversarioDiGiornata(lega);
    let html = `<section class="card">
      <label for="l-avv" style="margin-top:0">Il tuo avversario in questa giornata</label>
      <select id="l-avv" data-cambia="avversario">
        <option value="">Scegli…</option>
        ${avversari.map((s) => `<option ${avv && avv.nome === s.nome ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}
      </select>
    </section>`;
    if (avv && !mio.errore) html += cardSfida(lega, mio, avv);

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
      <details class="card">
        <summary>Aggiorna le rose della lega <small class="tenue">(${avversari.length} squadre)</small></summary>
        <p class="tenue piccolo">Dopo il mercato o uno scambio incolla di nuovo tutte le rose.</p>
        <textarea id="l-rose"></textarea>
        <div class="azioni" style="margin-top:8px"><button class="btn secondario" data-azione="salva-rose">Sostituisci le rose</button></div>
      </details>`;
    return html;
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
    return `<section class="card">
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
    <section class="card">
      <h2>📲 Su un altro telefono</h2>
      <p class="tenue piccolo">Copia un link con tutte le tue leghe (rose, regole, avversari) e mandatelo su WhatsApp o Messaggi. Aprilo sull'altro telefono e le ritrovi tutte.</p>
      <button class="btn secondario" data-azione="esporta">Copia il link con le mie leghe</button>
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
      v: l.avversario || null, f: l.fissi || [], e: l.esclusi || [],
    }));
  }
  function spacchetta(p) {
    return p.map((l, i) => ({
      id: "l" + Date.now().toString(36) + i, nome: l.n, squadra: l.s, regole: { ...regoleBase(), ...l.g },
      rosa: espandiRosa(l.r), avversari: (l.a || []).map(([nome, rosa]) => ({ nome, rosa: espandiRosa(rosa) })),
      avversario: l.v, fissi: l.f || [], esclusi: l.e || [],
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
      <button class="btn secondario piena" data-chiudi style="margin-top:12px">Chiudi</button>`;
    const f = $("#foglio");
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add("aperto"));
  }

  function chiudiScheda() {
    const f = $("#foglio");
    f.classList.remove("aperto");
    setTimeout(() => { f.hidden = true; }, 200);
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
    $("#schede").innerHTML = lega && vista !== "nuova"
      ? schede.map(([v, i, t]) => `<button class="scheda" data-vista="${v}" ${vista === v ? 'aria-current="page"' : ""}><span>${i}</span><span>${t}</span></button>`).join("")
      : "";

    let html;
    if (vista === "nuova") html = vistaNuova();
    else if (!lega) html = vistaBenvenuto();
    else if (vista === "rosa") html = vistaRosa(lega);
    else if (vista === "regole") html = vistaRegole(lega);
    else if (vista === "mercato") html = vistaMercato(lega);
    else if (vista === "lega") html = vistaLega(lega);
    else { aggiornaNovita(lega); html = vistaFormazione(lega); }
    $("#contenuto").innerHTML = html;
    if (vista === "lega" && lega) riempiScambi(lega);
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
        const c = prompt("Incolla il link (o il codice) con le tue leghe:");
        if (c) await importa(c);
        return;
      }
      case "salva-rose": {
        const lette = M.leggiLega($("#l-rose").value, squadre());
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
      case "annulla": vista = "formazione"; return disegna();
      case "crea": {
        const nome = $("#n-nome").value.trim() || "La mia lega";
        const rosa = M.leggiRosa($("#n-rosa").value, squadre());
        if (!rosa.length) return avviso("Non ho trovato giocatori: controlla ruolo, nome e squadra");
        const nuova = { id: "l" + Date.now().toString(36), nome, rosa, regole: regoleBase(), fissi: [], esclusi: [] };
        stato.leghe.push(nuova);
        stato.attiva = nuova.id;
        salva();
        vista = "regole";
        disegna();
        return avviso(`Trovati ${rosa.length} giocatori. Ora imposta le regole`);
      }
      case "aggiungi": {
        const nome = $("#a-nome").value.trim();
        if (!nome) return avviso("Scrivi il nome");
        lega.rosa.push({ nome, squadra: $("#a-squadra").value, ruolo: $("#a-ruolo").value });
        salva(); disegna(); return avviso(`${nome} aggiunto`);
      }
      case "sostituisci": {
        const rosa = M.leggiRosa($("#r-incolla").value, squadre());
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
        salva(); vista = "formazione"; disegna(); return avviso("Regole salvate");
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

  async function avvia() {
    disegna();
    try {
      const r = await fetch("data/giornata.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      dati = await r.json();
      riempiSuggerimenti();
    } catch (e) {
      avviso("Non riesco a caricare i dati della giornata");
    }
    disegna();
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
