// Motore dei consigli: legge la rosa, i dati della giornata e le regole della lega
// e sceglie modulo, titolari, panchina, capitano e switch.
(function () {
  const RUOLI = ["P", "D", "C", "A"];
  const FV_BASE = { P: 5.8, D: 6.0, C: 6.2, A: 6.5 };
  const FUORI = ["infortunato", "squalificato", "fuori"];

  function norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Indice dei giocatori dei dati per trovare velocemente quelli della rosa
  const cacheIndici = new WeakMap();
  function indicizza(dati) {
    if (cacheIndici.has(dati)) return cacheIndici.get(dati);
    const indice = creaIndice(dati);
    cacheIndici.set(dati, indice);
    return indice;
  }
  function creaIndice(dati) {
    const perChiave = new Map();
    const perNome = new Map();
    for (const g of dati.giocatori || []) {
      perChiave.set(norm(g.nome) + "|" + norm(g.squadra), g);
      const n = norm(g.nome);
      if (!perNome.has(n)) perNome.set(n, []);
      perNome.get(n).push(g);
    }
    const squadreConDati = new Set((dati.giocatori || []).map((g) => norm(g.squadra)));
    return { perChiave, perNome, squadreConDati };
  }

  function trova(indice, nome, squadra) {
    const n = norm(nome);
    const s = norm(squadra);
    if (indice.perChiave.has(n + "|" + s)) return indice.perChiave.get(n + "|" + s);
    const stessoNome = indice.perNome.get(n) || [];
    if (stessoNome.length === 1 && (!s || norm(stessoNome[0].squadra) === s)) return stessoNome[0];
    // Cognome uguale e stessa squadra ("Martinez" ↔ "Martinez Jo.")
    const cognome = n.split(" ")[0];
    if (cognome.length >= 3 && s) {
      for (const [chiave, g] of indice.perChiave) {
        const [gn, gs] = chiave.split("|");
        if (gs === s && gn.split(" ")[0] === cognome) return g;
      }
      // Una parola lunga in comune nella stessa squadra ("Nico Paz" ↔ "Paz N.", "Mora C." ↔ "Mora")
      const parole = n.split(" ").filter((p) => p.length >= 3);
      const simili = [];
      for (const [chiave, g] of indice.perChiave) {
        const [gn, gs] = chiave.split("|");
        if (gs === s && gn.split(" ").some((p) => parole.includes(p))) simili.push(g);
      }
      if (simili.length === 1) return simili[0];
    }
    return null;
  }

  function partitaDi(dati, squadra) {
    const s = norm(squadra);
    for (const p of dati.partite || []) {
      if (norm(p.casa) === s) return { ...p, inCasa: true, avversario: p.trasferta };
      if (norm(p.trasferta) === s) return { ...p, inCasa: false, avversario: p.casa };
    }
    return null;
  }

  // Unisce ogni giocatore della rosa con i dati della giornata
  function arricchisci(rosa, dati) {
    const indice = indicizza(dati);
    return rosa.map((r) => {
      const d = trova(indice, r.nome, r.squadra);
      const squadra = r.squadra || (d && d.squadra) || "";
      const partita = partitaDi(dati, squadra);
      let stato, prob, fv, nota;
      if (d) {
        stato = d.stato || "titolare";
        prob = FUORI.includes(stato) ? 0 : Number(d.prob ?? 50);
        fv = Number(d.fv) || FV_BASE[r.ruolo];
        nota = d.nota || "";
      } else if (indice.squadreConDati.has(norm(squadra))) {
        stato = "panchina";
        prob = 10;
        fv = FV_BASE[r.ruolo];
        nota = "Non è tra i probabili titolari";
      } else {
        stato = "sconosciuto";
        prob = 50;
        fv = FV_BASE[r.ruolo];
        nota = "Nessun dato per questo giocatore";
      }
      // Per gli scambi conta anche il valore della stagione: la quotazione dice quanto gioca e rende di solito
      if (dati.perScambi && r.quot > 0 && !FUORI.includes(stato)) {
        prob = Math.max(prob, Math.min(90, r.quot * 5));
      }
      if (!partita && stato !== "sconosciuto" && !FUORI.includes(stato)) {
        nota = nota || "Partita non trovata";
      }
      const valore = (prob / 100) * fv;
      return { ...r, squadra, stato, prob, fv, nota, partita, valore, trovato: !!d };
    });
  }

  function parseModulo(m) {
    const [d, c, a] = m.split("-").map(Number);
    return { P: 1, D: d, C: c, A: a };
  }

  // Stima grezza di quanto vale un modulo per i modificatori
  function bonusModificatori(modulo, scelti, regole) {
    let extra = 0;
    if (regole.modDifesa && modulo.D >= 4) {
      const reparto = [...scelti.P, ...scelti.D.slice(0, 3)];
      const probMedia = reparto.reduce((s, g) => s + g.prob, 0) / (reparto.length || 1) / 100;
      extra += 0.4 * probMedia;
    }
    if (regole.modCentrocampo) {
      const probMedia = scelti.C.reduce((s, g) => s + g.prob, 0) / (scelti.C.length || 1) / 100;
      extra += (modulo.C - 4) * 1.0 * probMedia;
    }
    return extra;
  }

  function chiave(g) {
    return norm(g.nome) + "|" + norm(g.squadra);
  }

  // Punti attesi: se un titolare non gioca entra il primo panchinaro dello stesso ruolo
  function puntiPrevisti(perRuoloTitolari, panchina) {
    let tot = 0;
    for (const r of RUOLI) {
      const riserve = panchina.filter((g) => g.ruolo === r && !FUORI.includes(g.stato) && !g.escluso);
      let i = 0;
      for (const t of perRuoloTitolari[r]) {
        const p = t.prob / 100;
        let sub = 0;
        if (riserve[i]) { sub = (riserve[i].prob / 100) * riserve[i].fv; i++; }
        tot += p * t.fv + (1 - p) * sub;
      }
    }
    return tot;
  }

  function consiglia(rosa, dati, regole, pref) {
    const fissi = new Set((pref && pref.fissi) || []);
    const esclusi = new Set((pref && pref.esclusi) || []);
    const giocatori = arricchisci(rosa, dati).map((g) => {
      const k = chiave(g);
      const fisso = fissi.has(k);
      const escluso = esclusi.has(k);
      return { ...g, chiave: k, fisso, escluso, peso: g.valore + (fisso ? 100 : 0) - (escluso ? 100 : 0) };
    });
    const perRuolo = {};
    for (const r of RUOLI) {
      perRuolo[r] = giocatori
        .filter((g) => g.ruolo === r)
        .sort((a, b) => b.peso - a.peso || b.prob - a.prob);
    }

    const classifica = [];
    for (const m of regole.moduli || []) {
      const modulo = parseModulo(m);
      if (RUOLI.some((r) => perRuolo[r].length < modulo[r])) continue;
      const scelti = {};
      for (const r of RUOLI) scelti[r] = perRuolo[r].slice(0, modulo[r]);
      const base = RUOLI.reduce((s, r) => s + scelti[r].reduce((t, g) => t + g.peso, 0), 0);
      const extra = bonusModificatori(modulo, scelti, regole);
      classifica.push({ modulo: m, scelti, punteggio: base + extra, extra });
    }
    // Il punteggio di ogni modulo conta anche i panchinari che entrano se un titolare non gioca
    // (lo stesso calcolo dei "punti previsti" che mostro). I 📌 e i 🚫 pesano tantissimo.
    const ordinaPanca = (lista) =>
      lista.sort((a, b) => {
        const af = FUORI.includes(a.stato) || a.escluso ? 1 : 0;
        const bf = FUORI.includes(b.stato) || b.escluso ? 1 : 0;
        return af - bf || RUOLI.indexOf(a.ruolo) - RUOLI.indexOf(b.ruolo) || b.peso - a.peso;
      });
    for (const c of classifica) {
      const titolari = RUOLI.flatMap((r) => c.scelti[r]);
      const set = new Set(titolari);
      const preferenze = titolari.reduce((s, g) => s + (g.fisso ? 100 : 0) - (g.escluso ? 100 : 0), 0);
      c.punteggio = puntiPrevisti(c.scelti, ordinaPanca(giocatori.filter((g) => !set.has(g)))) + c.extra + preferenze;
    }
    classifica.sort((a, b) => b.punteggio - a.punteggio);
    // Modulo scelto a mano (es. "formazione anti-avversario")
    const forzato = pref && pref.modulo && classifica.find((c) => c.modulo === pref.modulo);
    if (forzato) classifica.splice(classifica.indexOf(forzato), 1), classifica.unshift(forzato);
    const migliore = classifica[0];
    if (!migliore) {
      return { errore: "Con questa rosa non riesco a fare nessuno dei moduli ammessi. Controlla rosa e regole.", giocatori };
    }

    const titolariSet = new Set(RUOLI.flatMap((r) => migliore.scelti[r]));
    const daNonSchierare = giocatori.filter((g) => FUORI.includes(g.stato));

    // Panchina: per ogni ruolo in ordine di valore, chi è fuori o escluso va in fondo
    const ordinaPanchina = (lista) =>
      lista.sort((a, b) => {
        const af = FUORI.includes(a.stato) || a.escluso ? 1 : 0;
        const bf = FUORI.includes(b.stato) || b.escluso ? 1 : 0;
        return af - bf || RUOLI.indexOf(a.ruolo) - RUOLI.indexOf(b.ruolo) || b.peso - a.peso;
      });
    let panchina = ordinaPanchina(giocatori.filter((g) => !titolariSet.has(g)));

    // Confronto con gli altri moduli, in punti previsti
    const previsti = puntiPrevisti(migliore.scelti, panchina) + migliore.extra;
    const maxPanchina = Number(regole.panchinari) || panchina.length;
    // Le formazioni migliori per ogni modulo: servono per la formazione anti-avversario
    const candidati = classifica.slice(0, 6).map((c) => {
      const set = new Set(RUOLI.flatMap((r) => c.scelti[r]));
      const panca = ordinaPanchina(giocatori.filter((g) => !set.has(g)));
      return { modulo: c.modulo, perRuolo: c.scelti, panchina: panca.slice(0, maxPanchina), extra: c.extra, previsti: puntiPrevisti(c.scelti, panca) + c.extra };
    });
    const alternative = candidati.slice(1, 4).map((c) => ({ modulo: c.modulo, differenza: c.previsti - previsti }));
    panchina = panchina.slice(0, maxPanchina);

    const titolari = RUOLI.flatMap((r) => migliore.scelti[r]);

    let capitano = null, vice = null;
    if (regole.capitano) {
      const ordinati = [...titolari].sort((a, b) => b.valore - a.valore);
      capitano = ordinati[0] || null;
      vice = ordinati[1] || null;
    }

    // Switch: titolari incerti collegati al panchinaro più adatto
    const switchConsigliati = [];
    if (regole.switch) {
      const usati = new Set();
      const incerti = titolari.filter((g) => g.prob <= 70).sort((a, b) => a.prob - b.prob);
      for (const t of incerti) {
        const candidati = panchina.filter(
          (p) => !usati.has(p) && !FUORI.includes(p.stato) && !p.escluso && p.prob >= 25 && (regole.switchPlus || p.ruolo === t.ruolo)
        );
        const stessaSquadra = candidati.filter((p) => norm(p.squadra) === norm(t.squadra) && p.ruolo === t.ruolo);
        const scelta = stessaSquadra[0] || candidati.filter((p) => p.ruolo === t.ruolo).sort((a, b) => b.prob - a.prob)[0];
        if (scelta) {
          usati.add(scelta);
          switchConsigliati.push({ titolare: t, panchinaro: scelta, ballottaggio: norm(scelta.squadra) === norm(t.squadra) });
        }
      }
    }

    return {
      modulo: migliore.modulo,
      forzato: !!forzato,
      previsti,
      extra: migliore.extra,
      candidati,
      alternative,
      titolari,
      perRuolo: migliore.scelti,
      panchina,
      capitano,
      vice,
      switch: switchConsigliati,
      daNonSchierare,
      giocatori,
    };
  }

  function scadenza(dati, timeoutMinuti) {
    const inizi = (dati.partite || []).map((p) => new Date(p.inizio).getTime()).filter((t) => !isNaN(t));
    if (!inizi.length) return null;
    return new Date(Math.min(...inizi) - (Number(timeoutMinuti) || 0) * 60000);
  }

  // ---------- Lettura delle rose incollate ----------
  // Va bene: copia da fantacalcio.it, tabelle ed Excel, elenchi "Nome (Squadra) 13/48/16",
  // squadre scritte per intero o in sigla (ATA, NAP…), righe con più giocatori separati da " · ",
  // e anche giocatori senza squadra se li riconosco dal nome.
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function preparaLettore(squadre, dati) {
    const nomiSquadre = [...(squadre || [])].sort((a, b) => b.length - a.length);
    const reSquadra = nomiSquadre.length
      ? new RegExp("(^|[^A-Za-zÀ-ÿ])(" + nomiSquadre.map(escRe).join("|") + ")(?![A-Za-zÀ-ÿ])", "i")
      : null;
    // Sigle a 3 lettere maiuscole: ATA, BOL, NAP… (solo maiuscole, così non prendo "Romano" per Roma)
    const sigle = new Map();
    for (const s of nomiSquadre) sigle.set(norm(s).replace(/\s/g, "").slice(0, 3).toUpperCase(), s);
    if (sigle.has("HEL")) sigle.set("VER", sigle.get("HEL"));
    const reSigla = sigle.size ? new RegExp("(^|[^A-Za-zÀ-ÿ])(" + [...sigle.keys()].join("|") + ")(?![A-Za-zÀ-ÿ])") : null;
    const indice = dati && dati.giocatori ? indicizza(dati) : null;
    return { nomiSquadre, reSquadra, sigle, reSigla, indice };
  }
  const SEZIONI = [[/portier/i, "P"], [/difensor/i, "D"], [/centrocamp/i, "C"], [/attacc/i, "A"]];
  const RE_RUOLO = /^\s*(?:[-*•]\s*)?(?:\*\*)?(P|D|C|A|Por|Dif|Cen|Att)(?:\*\*)?(?:[\s\t.:\-|]+)/i;
  const RE_CELLA_RUOLO = /^(P|D|C|A|Por|Dif|Cen|Att|Portiere|Difensore|Centrocampista|Attaccante)$/i;
  const MAPPA_RUOLO = { p: "P", por: "P", portiere: "P", d: "D", dif: "D", difensore: "D", c: "C", cen: "C", centrocampista: "C", a: "A", att: "A", attaccante: "A" };
  const NON_SQUADRA = /^(note|totale|formato|aggiornat|colonne|rose\b|rosa\b|crediti|ruolo|calciatore|giocatore|squadra\b|costo|quotaz|prezzo|allenatore|presidente|lega\b|classifica|nome\b)/i;

  function pulisciRiga(riga) {
    if (/\|/.test(riga)) {
      const celle = riga.split("|").map((c) => c.trim()).filter(Boolean);
      if (celle.some((c) => /^(giocatore|calciatore)$/i.test(c))) return "";
      return celle.join("\t");
    }
    // Celle di Excel/tabella: se il ruolo non è nella prima cella lo porto davanti
    if (/\t/.test(riga)) {
      const celle = riga.split("\t").map((c) => c.trim()).filter(Boolean);
      if (celle.some((c) => /^(calciatore|giocatore|nome)$/i.test(c))) return "";
      const i = celle.findIndex((c) => RE_CELLA_RUOLO.test(c));
      if (i > 0) celle.unshift(celle.splice(i, 1)[0]);
      return celle.join("\t");
    }
    return riga;
  }

  function pulisciNome(s) {
    return s
      .replace(/[#*_`]/g, "")
      .replace(/^[\s\-•\d.]+/, "")
      .replace(/[\s(\t,–—\-\d./]+$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Un pezzo di riga con un solo giocatore → {nome, squadra, ruolo, quot} o null
  function leggiPezzo(pezzo, ruoloAttuale, lettore) {
    let ruolo = ruoloAttuale;
    let resto = pezzo;
    const mRuolo = pezzo.match(RE_RUOLO);
    if (mRuolo) {
      ruolo = MAPPA_RUOLO[mRuolo[1].toLowerCase()];
      resto = pezzo.slice(mRuolo[0].length);
    } else {
      const prima = pezzo.split("\t")[0].trim();
      if (RE_CELLA_RUOLO.test(prima)) { ruolo = MAPPA_RUOLO[prima.toLowerCase()]; resto = pezzo.slice(pezzo.indexOf(prima) + prima.length); }
    }

    // 1) squadra scritta per intero, 2) in sigla
    let squadra = null;
    let m = lettore.reSquadra ? resto.match(lettore.reSquadra) : null;
    if (m) squadra = lettore.nomiSquadre.find((s) => s.toLowerCase() === m[2].toLowerCase()) || m[2];
    else if (lettore.reSigla && (m = resto.match(lettore.reSigla))) squadra = lettore.sigle.get(m[2]);

    if (squadra) {
      const inizio = m.index + m[1].length;
      let nome = pulisciNome(resto.slice(0, inizio));
      const dopo = resto.slice(inizio + m[2].length);
      if (!nome) nome = pulisciNome(dopo.replace(/^[\s)\t|]*/, "").replace(/\t.*$/, ""));
      const mq = dopo.match(/^[\s)\t|]*(\d{1,3})(?!\d)/);
      if (nome && nome.length <= 40 && /[a-zà-ÿ]/i.test(nome)) {
        if (!ruolo && lettore.indice) ruolo = trova(lettore.indice, nome, squadra)?.ruolo || null;
        if (ruolo) {
          const g = { nome, squadra, ruolo };
          if (mq) g.quot = Number(mq[1]);
          return { ruolo, giocatore: g };
        }
      }
      return { ruolo: ruoloAttuale, giocatore: null };
    }

    // 3) Nessuna squadra: lo cerco per nome nei dati della giornata
    const numeri = resto.match(/(\d{1,3})\s*$/);
    const nome = pulisciNome(resto.replace(/\t/g, " "));
    if (!nome || nome.length > 40) return { ruolo: ruoloAttuale, giocatore: null };
    if (lettore.indice) {
      const trovati = lettore.indice.perNome.get(norm(nome)) || [];
      const giusti = trovati.filter((g) => !ruolo || g.ruolo === ruolo);
      if (giusti.length === 1) {
        const g = { nome: giusti[0].nome, squadra: giusti[0].squadra, ruolo: giusti[0].ruolo };
        if (numeri) g.quot = Number(numeri[1]);
        return { ruolo: g.ruolo, giocatore: g };
      }
    }
    // 4) Ruolo davanti e un numero in fondo ("P Turati 3"): è un giocatore anche se non so la squadra
    if (mRuolo && numeri && ruolo) {
      return { ruolo, giocatore: { nome, squadra: "", ruolo, quot: Number(numeri[1]) } };
    }
    return { ruolo: ruoloAttuale, giocatore: null };
  }

  function senzaDoppioni(lista) {
    const visti = new Set();
    return lista.filter((g) => {
      const k = norm(g.nome) + "|" + norm(g.squadra);
      if (visti.has(k)) return false;
      visti.add(k);
      return true;
    });
  }

  function leggiRosa(testo, squadre, dati) {
    return leggiLega(testo, squadre, true, dati)[0]?.rosa || [];
  }

  // Legge più squadre: una riga senza giocatori (es. "## Bocanapoli — Diego") apre una nuova squadra.
  // Se una squadra non ha ancora giocatori tengo il primo nome (il secondo di solito è l'allenatore).
  function leggiLega(testo, squadre, unaSola, dati) {
    const lettore = preparaLettore(squadre, dati);
    const squadreLette = [];
    let attuale = null;
    let ruolo = null;
    for (let riga of String(testo).split(/\r?\n/)) {
      if (!riga.trim() || /^\s*\|?\s*-{3,}/.test(riga)) continue;
      riga = pulisciRiga(riga);
      if (!riga) continue;
      const trovati = [];
      let r = ruolo;
      for (const pezzo of riga.split(/\s·\s|;/)) {
        const x = leggiPezzo(pezzo, r, lettore);
        r = x.ruolo;
        if (x.giocatore) trovati.push(x.giocatore);
      }
      if (trovati.length) {
        ruolo = r;
        if (!attuale) { attuale = { nome: "Squadra", rosa: [] }; squadreLette.push(attuale); }
        attuale.rosa.push(...trovati);
        continue;
      }
      const sez = SEZIONI.find(([re]) => re.test(riga));
      if (sez && riga.length < 40) { ruolo = sez[1]; continue; }
      if (unaSola) continue;
      const pulita = riga.replace(/[#*_`\t]/g, " ").trim();
      if (pulita.length >= 80 || NON_SQUADRA.test(pulita) || /^[\d\s.,€:/-]+$/.test(pulita)) continue;
      const nome = pulita.split(/\s[—–-]\s|\s·\s|\(/)[0].replace(/\s+/g, " ").trim();
      if (!nome || /^[PDCA]$/i.test(nome)) continue;
      if (attuale && !attuale.rosa.length) {
        // Un titolo "## Nome" vince sulla riga prima (es. il titolo della pagina)
        if (/^\s*#/.test(riga)) attuale.nome = nome;
        continue;
      }
      attuale = { nome, rosa: [] };
      squadreLette.push(attuale);
      ruolo = null;
    }
    return squadreLette
      .map((s) => ({ ...s, rosa: senzaDoppioni(s.rosa) }))
      .filter((s) => s.rosa.length);
  }

  // Mercato: chi prendere (titolari sicuri non in rosa) e chi vendere (rosa poco utile)
  function mercato(rosa, dati) {
    const miei = arricchisci(rosa, dati);
    const inRosa = new Set(miei.map(chiave));
    const prendere = {};
    for (const r of RUOLI) {
      prendere[r] = (dati.giocatori || [])
        .filter((g) => g.ruolo === r && !inRosa.has(chiave(g)) && !FUORI.includes(g.stato) && Number(g.prob) >= 75)
        .map((g) => ({ ...g, prob: Number(g.prob), fv: Number(g.fv) || FV_BASE[r], partita: partitaDi(dati, g.squadra) }))
        .map((g) => ({ ...g, chiave: chiave(g), valore: (g.prob / 100) * g.fv }))
        .sort((a, b) => b.valore - a.valore)
        .slice(0, 4);
    }
    const lungo = /mes|gennaio|febbraio|marzo|stagione|lungo|crociato|operat/i;
    const vendere = miei
      .map((g) => {
        let motivo = "";
        if (g.stato === "infortunato" && lungo.test(g.nota)) motivo = "Fuori a lungo";
        else if (g.stato === "infortunato") motivo = "Infortunato";
        else if (g.stato === "squalificato") motivo = null; // salta una giornata, non è un motivo per venderlo
        else if (g.prob <= 20 && g.ruolo !== "P") motivo = "Quasi mai titolare";
        return { ...g, chiave: chiave(g), motivo };
      })
      .filter((g) => g.motivo)
      .sort((a, b) => (b.motivo === "Fuori a lungo") - (a.motivo === "Fuori a lungo") || a.valore - b.valore);
    return { prendere, vendere };
  }

  // Cosa è cambiato per i giocatori della rosa rispetto all'ultima volta
  function novita(rosa, dati, foto) {
    const out = [];
    if (!foto) return out;
    for (const g of arricchisci(rosa, dati)) {
      const prima = foto[chiave(g)];
      if (!prima) continue;
      const cambioStato = prima.stato !== g.stato && (FUORI.includes(prima.stato) || FUORI.includes(g.stato));
      if (cambioStato || Math.abs(prima.prob - g.prob) >= 15) {
        out.push({ ...g, chiave: chiave(g), prima, delta: g.prob - prima.prob });
      }
    }
    return out.sort((a, b) => a.delta - b.delta);
  }

  function fotografa(rosa, dati) {
    const foto = {};
    for (const g of arricchisci(rosa, dati)) foto[chiave(g)] = { prob: g.prob, stato: g.stato };
    return foto;
  }

  // ---------- Simulazione della partita ----------
  // Gioco la giornata migliaia di volte: ogni giocatore gioca o no secondo la sua %,
  // il voto varia intorno a quello previsto (gli attaccanti variano di più per i gol),
  // se un titolare non gioca entra il primo panchinaro dello stesso ruolo.
  // Poi trasformo i punti in gol con le soglie della lega e conto vittorie, pareggi e sconfitte.
  // Scarti tipici del fantavoto: con questi una squadra varia di circa ±7 punti a giornata, come nella realtà
  const VARIAZIONE = { P: 1.5, D: 1.6, C: 1.9, A: 2.6 };

  function casuale(seme) {
    let a = seme >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normale(rnd) {
    const u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function giocaUnaVolta(f, rnd) {
    let tot = f.extra || 0;
    for (const r of RUOLI) {
      const riserve = f.panchina.filter((g) => g.ruolo === r && !FUORI.includes(g.stato) && !g.escluso);
      let i = 0;
      for (const t of f.perRuolo[r]) {
        let chi = null;
        if (rnd() < t.prob / 100) chi = t;
        else {
          while (i < riserve.length && !chi) {
            const s = riserve[i++];
            if (rnd() < s.prob / 100) chi = s;
          }
        }
        if (chi) tot += chi.fv + normale(rnd) * VARIAZIONE[chi.ruolo];
      }
    }
    return tot;
  }

  function gol(punti, regole) {
    const soglia = Number(regole.sogliaGol) || 66;
    const passo = Number(regole.passoGol) || 6;
    return punti < soglia ? 0 : 1 + Math.floor((punti - soglia) / passo);
  }

  // spostamento: correzione uguale per tutte e due le squadre, così la media torna ai punti veri
  // della lega (bonus come gol vittoria e modificatori pieni non sono nei voti previsti)
  function simula(mia, loro, regole, volte = 3000, spostamento = 0) {
    const rnd = casuale(12345);
    let v = 0, n = 0, p = 0, golMiei = 0, golLoro = 0;
    for (let k = 0; k < volte; k++) {
      const a = gol(giocaUnaVolta(mia, rnd) + spostamento, regole);
      const b = gol(giocaUnaVolta(loro, rnd) + spostamento, regole);
      golMiei += a; golLoro += b;
      if (a > b) v++; else if (a === b) n++; else p++;
    }
    return {
      vittoria: v / volte, pareggio: n / volte, sconfitta: p / volte,
      golMiei: golMiei / volte, golLoro: golLoro / volte,
      puntiAttesi: (3 * v + n) / volte,
    };
  }

  // Tra i moduli migliori sceglie quello che fa vincere più spesso contro questo avversario
  function antiAvversario(mio, loro, regole, spostamento = 0) {
    const loroForm = loro.candidati[0];
    return mio.candidati
      .map((c) => ({ modulo: c.modulo, previsti: c.previsti, esito: simula(c, loroForm, regole, 3000, spostamento) }))
      .sort((a, b) => b.esito.puntiAttesi - a.esito.puntiAttesi);
  }

  // ---------- Scambi ----------
  const LUNGO = /mes|gennaio|febbraio|marzo|stagione|lungo|crociato|operat/i;

  // Per gli scambi non conta solo questa giornata: chi ha un infortunio breve o una squalifica
  // tornerà presto, quindi lo valuto come un giocatore in ballottaggio.
  function datiPerScambi(dati) {
    return {
      ...dati,
      perScambi: true,
      giocatori: (dati.giocatori || []).map((g) => {
        if (g.stato === "squalificato") return { ...g, stato: "titolare", prob: 75 };
        if (g.stato === "infortunato" && !LUNGO.test(g.nota || "")) return { ...g, stato: "ballottaggio", prob: 50 };
        return g;
      }),
    };
  }

  function forza(rosa, dati, regole) {
    const r = consiglia(rosa, dati, regole);
    return r.errore ? 0 : r.previsti;
  }

  function sommaQuot(lista) {
    if (lista.some((g) => !(g.quot > 0))) return null;
    return lista.reduce((s, g) => s + g.quot, 0);
  }

  function coppie(lista) {
    const out = [];
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) out.push([lista[i], lista[j]]);
    return out;
  }

  function stessiRuoli(a, b) {
    return a.map((g) => g.ruolo).sort().join() === b.map((g) => g.ruolo).sort().join();
  }

  // Cerca scambi 1x1 e 2x2 (stessi ruoli) che alzano i tuoi punti previsti
  // senza far perdere troppo all'altra squadra (così è più facile che accetti).
  function scambi(miaRosa, avversari, dati, regole) {
    const d = datiPerScambi(dati);
    const base = forza(miaRosa, d, regole);
    const mieiArr = arricchisci(miaRosa, d);
    const proposte = [];

    for (const avv of avversari) {
      const baseLoro = forza(avv.rosa, d, regole);
      const loroArr = arricchisci(avv.rosa, d);
      const prova = (dai, ricevi) => {
        const kDai = new Set(dai.map(chiave));
        const kRicevi = new Set(ricevi.map(chiave));
        const nuovaMia = [...miaRosa.filter((g) => !kDai.has(chiave(g))), ...ricevi];
        const nuovaLoro = [...avv.rosa.filter((g) => !kRicevi.has(chiave(g))), ...dai];
        const guadagno = forza(nuovaMia, d, regole) - base;
        if (guadagno < 0.4) return;
        const guadagnoLoro = forza(nuovaLoro, d, regole) - baseLoro;
        const qDai = sommaQuot(dai), qRicevi = sommaQuot(ricevi);
        const diffQuot = qDai != null && qRicevi != null ? qDai - qRicevi : null;
        // Fattibile se è equilibrato come valore (quotazioni: al massimo 2 crediti a nostro favore)
        // e in campo non li indebolisce troppo. Senza quotazioni: solo se migliorano anche loro.
        const fattibile = diffQuot != null
          ? diffQuot >= -2 && guadagnoLoro >= (diffQuot >= 2 ? -1.5 : -0.8)
          : guadagnoLoro >= 0;
        if (!fattibile) return;
        proposte.push({
          squadra: avv.nome, dai, ricevi, guadagno, guadagnoLoro, diffQuot,
          punteggio: guadagno + 0.3 * Math.min(guadagnoLoro, 2) + (diffQuot != null ? 0.03 * Math.min(diffQuot, 10) : 0),
        });
      };

      // 1x1
      for (const g of mieiArr) for (const h of loroArr) if (g.ruolo === h.ruolo) prova([g], [h]);

      // 2x2: i miei meno utili contro i loro più utili
      const mieiPoco = [...mieiArr].sort((a, b) => a.valore - b.valore).slice(0, 9);
      const loroBuoni = [...loroArr].filter((g) => g.prob >= 50).sort((a, b) => b.valore - a.valore).slice(0, 8);
      for (const dai of coppie(mieiPoco)) for (const ricevi of coppie(loroBuoni)) if (stessiRuoli(dai, ricevi)) prova(dai, ricevi);
    }

    // Le migliori, senza ripetere troppo gli stessi giocatori
    proposte.sort((a, b) => b.punteggio - a.punteggio);
    const scelte = [];
    const usati = new Map();
    const perSquadra = new Map();
    for (const p of proposte) {
      const nomi = [...p.dai, ...p.ricevi].map(chiave);
      if (nomi.some((k) => (usati.get(k) || 0) >= 1)) continue;
      if ((perSquadra.get(p.squadra) || 0) >= 2) continue;
      scelte.push(p);
      nomi.forEach((k) => usati.set(k, (usati.get(k) || 0) + 1));
      perSquadra.set(p.squadra, (perSquadra.get(p.squadra) || 0) + 1);
      if (scelte.length >= 6) break;
    }
    return scelte.map((p) => ({
      ...p,
      dai: p.dai.map((g) => arricchisci([g], dati)[0]),
      ricevi: p.ricevi.map((g) => arricchisci([g], dati)[0]),
    }));
  }

  // Classifica delle rose della lega per punti previsti in questa giornata
  function classificaLega(miaRosa, nomeMio, avversari, dati, regole) {
    return [{ nome: nomeMio, rosa: miaRosa, mia: true }, ...avversari]
      .map((s) => ({ nome: s.nome, mia: !!s.mia, previsti: forza(s.rosa, dati, regole) }))
      .sort((a, b) => b.previsti - a.previsti);
  }


  // ---------- Giocatori letti da uno screenshot ----------
  // Il testo letto dall'immagine ha errori: cerco riga per riga i cognomi dei giocatori della lista
  // (anche con una lettera sbagliata) e, se due giocatori hanno lo stesso cognome, uso squadra e iniziale.
  function quasiUguali(a, b) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }
  function trovaNelTesto(testo, lista) {
    const prep = lista.map((g) => {
      const parti = norm(g.nome).split(" ");
      return {
        g, cognome: parti.filter((p) => p.length >= 3), iniziali: parti.filter((p) => p.length < 3),
        squadra: norm(g.squadra), sigla: norm(g.squadra).replace(/\s/g, "").slice(0, 3),
      };
    }).filter((x) => x.cognome.length);
    const presi = new Map();
    const dubbi = [];
    for (const riga of String(testo).split(/\r?\n/)) {
      const parole = norm(riga).split(" ").filter(Boolean);
      if (!parole.length) continue;
      const c = (p) => parole.some((w) => w === p || (p.length >= 5 && quasiUguali(w, p)));
      let candidati = prep.filter((x) => x.cognome.every(c));
      // Se sulla riga c'è un cognome scritto giusto, ignoro quelli simili ("Ramon" non è "Ramos")
      const esatti = candidati.filter((x) => x.cognome.every((p) => parole.includes(p)));
      if (esatti.length) candidati = esatti;
      // Raggruppo per cognome: "Esposito F.P." e "Esposito Se." sono lo stesso gruppo
      const gruppi = new Map();
      for (const x of candidati) {
        const k = x.cognome.join(" ");
        if (!gruppi.has(k)) gruppi.set(k, []);
        gruppi.get(k).push(x);
      }
      // Un cognome contenuto in uno più lungo trovato sulla stessa riga non conta ("Martinez" dentro "Lautaro Martinez")
      const chiavi = [...gruppi.keys()];
      for (const k of chiavi) {
        if (chiavi.some((k2) => k2 !== k && k2.split(" ").length > k.split(" ").length && k.split(" ").every((p) => k2.split(" ").includes(p)))) gruppi.delete(k);
      }
      for (const [k, gruppo] of gruppi) {
        let scelti = gruppo;
        if (scelti.length > 1) {
          const perSquadra = scelti.filter((x) => parole.includes(x.sigla) || norm(riga).includes(x.squadra));
          if (perSquadra.length) scelti = perSquadra;
        }
        if (scelti.length > 1) {
          const perIniziale = scelti.filter((x) => x.iniziali.length && x.iniziali.every((i) => parole.includes(i)));
          if (perIniziale.length) scelti = perIniziale;
        }
        if (scelti.length === 1) presi.set(chiave(scelti[0].g), scelti[0].g);
        else dubbi.push(k);
      }
    }
    return { trovati: [...presi.values()], dubbi: [...new Set(dubbi)] };
  }

  window.Motore = { trovaNelTesto, simula, antiAvversario, mercato, novita, fotografa, leggiLega, scambi, classificaLega, consiglia, scadenza, leggiRosa, arricchisci, norm, chiave, RUOLI, FUORI };
})();
