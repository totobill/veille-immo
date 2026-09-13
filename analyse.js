/* Analyse prix — DVF (ventes réelles) + annonces de la veille */
(function () {
  'use strict';

  var nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var euro = function (v) { return nf.format(Math.round(v)) + ' €'; };
  var DOUBLONS = ['Seynod'];   // communes fusionnées, stats portées par Annecy

  var DVF = null, ANNONCES = [];

  function el(id) { return document.getElementById(id); }

  function tableau(entetes, lignes, triParDefaut) {
    var html = '<table><thead><tr>';
    entetes.forEach(function (e, i) {
      html += '<th data-col="' + i + '">' + e + '</th>';
    });
    html += '</tr></thead><tbody>';
    lignes.forEach(function (l) {
      html += '<tr>' + l.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    });
    return html + '</tbody></table>';
  }

  function activerTri(conteneur, indexDefaut) {
    var table = conteneur.querySelector('table');
    if (!table) { return; }
    var sens = {}, corps = table.tBodies[0], lignes = Array.prototype.slice.call(corps.rows);
    table.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        var col = parseInt(th.dataset.col, 10);
        sens[col] = !sens[col];
        lignes.sort(function (a, b) {
          var x = a.cells[col].textContent.replace(/[^\d.,-]/g, '').replace(',', '.');
          var y = b.cells[col].textContent.replace(/[^\d.,-]/g, '').replace(',', '.');
          var nx = parseFloat(x), ny = parseFloat(y);
          if (!isNaN(nx) && !isNaN(ny)) { return sens[col] ? nx - ny : ny - nx; }
          return sens[col] ? a.cells[col].textContent.localeCompare(b.cells[col].textContent)
                           : b.cells[col].textContent.localeCompare(a.cells[col].textContent);
        });
        lignes.forEach(function (r) { corps.appendChild(r); });
      });
    });
  }

  function statsCommune(nom) {
    var c = DVF.communes[nom];
    if (!c) { return null; }
    var cible = (c.cible_12_mois && c.cible_12_mois.n >= 3) ? c.cible_12_mois : c['12_mois'];
    return { ref: cible, cible: c.cible_12_mois, global: c['12_mois'], brut: c };
  }

  function evolution(nom) {
    var c = DVF.communes[nom], out = [];
    DVF.annees.forEach(function (a) {
      var s = c.par_annee[String(a)];
      out.push(s && s.n >= 2 ? s.pm2_median : null);
    });
    return out;
  }

  /* ---------- 1. Tableau communes ---------- */
  function renderCommunes() {
    var noms = Object.keys(DVF.communes).sort();
    var lignes = noms.map(function (n) {
      var c = DVF.communes[n], s = c['12_mois'], cible = c.cible_12_mois;
      var n12 = s ? s.n : 0;
      var ecart = '';
      if (c.par_annee['2025'] && c.par_annee['2024'] && c.par_annee['2025'].n >= 5 && c.par_annee['2024'].n >= 5) {
        var d = (c.par_annee['2025'].pm2_median - c.par_annee['2024'].pm2_median) / c.par_annee['2024'].pm2_median * 100;
        ecart = '<span class="' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' %</span>';
      }
      return [
        n + (c.population ? ' <span style="color:#94a3b8">(' + nf.format(c.population) + ' hab)</span>' : ''),
        s ? nf.format(s.pm2_median) + ' €/m²' : '—',
        cible && cible.n >= 3 ? nf.format(cible.pm2_median) + ' €/m² <span style="color:#94a3b8">(n=' + cible.n + ')</span>' : '—',
        s ? euro(s.prix_median) : '—',
        s ? nf.format(s.surface_mediane) + ' m²' : '—',
        n12,
        c.total_ventes_5ans,
        ecart || '—'
      ];
    });
    var z = el('tblCommunes');
    z.innerHTML = tableau(['Commune', 'Médiane €/m² (12 mois)', 'Maisons 100-200 m²', 'Prix médian', 'Surface médiane',
      'Ventes 12 mois', 'Ventes 5 ans', 'Évol. 2024→2025'], lignes);
    activerTri(z);
  }

  /* ---------- 2. Graphique d'évolution ---------- */
  var graph = null;
  function renderGraphique(selection) {
    var couleurs = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];
    var sets = selection.map(function (n, i) {
      return {
        label: n, data: evolution(n), borderColor: couleurs[i % couleurs.length],
        backgroundColor: couleurs[i % couleurs.length] + '22', tension: .25, spanGaps: true,
        pointRadius: 4, borderWidth: 2
      };
    });
    if (graph) { graph.destroy(); }
    graph = new Chart(el('graphEvolution'), {
      type: 'line',
      data: { labels: DVF.annees.map(String), datasets: sets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: {
          callbacks: { label: function (c) { return c.dataset.label + ' : ' + (c.parsed.y ? nf.format(c.parsed.y) + ' €/m²' : 'n/d'); } } } },
        scales: { y: { title: { display: true, text: '€/m² médian (maisons)' }, ticks: { callback: function (v) { return nf.format(v); } } } }
      }
    });
  }

  function renderCases() {
    var defaut = ['Cervens', 'Orcier', 'Allinges', 'Bons-en-Chablais', 'Annecy', 'Sevrier'];
    var noms = Object.keys(DVF.communes).sort();
    el('casesCommunes').innerHTML = noms.map(function (n) {
      var on = defaut.indexOf(n) >= 0;
      return '<label style="font-weight:400;display:flex;align-items:center;gap:6px;font-size:13px">' +
        '<input type="checkbox" value="' + n + '"' + (on ? ' checked' : '') + ' style="width:auto"> ' + n + '</label>';
    }).join('');
    el('casesCommunes').addEventListener('change', function () {
      var sel = Array.prototype.slice.call(el('casesCommunes').querySelectorAll('input:checked')).map(function (i) { return i.value; });
      renderGraphique(sel);
    });
    renderGraphique(defaut);
  }

  /* ---------- 3. Simulateur ---------- */
  function simulateur() {
    var nom = el('simCommune').value;
    var sc = statsCommune(nom);
    var surf = parseFloat(el('simSurface').value) || 150;
    var etat = parseFloat(el('simEtat').value);
    var dpe = parseFloat(el('simDpe').value);
    var terrain = parseFloat(el('simTerrain').value) || 0;
    if (!sc || !sc.ref) { el('simResultat').textContent = 'Pas assez de ventes récentes sur cette commune.'; return; }

    var m = 1 + etat + dpe;
    var bonusTerrain = terrain >= 1000 ? 0.04 : (terrain >= 600 ? 0.02 : (terrain > 0 && terrain < 200 ? -0.02 : 0));
    m += bonusTerrain;
    var base = sc.ref.pm2_median;
    var px = base * m * surf;

    // comparables DVF proches en surface
    var comp = DVF.ventes_recentes.filter(function (v) {
      return v.commune === nom && Math.abs(v.surface - surf) <= 30;
    }).slice(0, 6);

    var annoncesCommune = ANNONCES.filter(function (a) { return a.properties.commune === nom; });

    var h = '<div>Prix de référence DVF ' + nom + ' : <b>' + nf.format(base) + ' €/m²</b> ' +
      '<span style="color:#64748b">(médiane ' + (sc.ref === sc.cible ? 'segment 100-200 m²' : 'toutes surfaces') +
      ', n=' + sc.ref.n + ')</span></div>';
    h += '<div>Ajustements appliqués : <b>' + ((m - 1) >= 0 ? '+' : '') + ((m - 1) * 100).toFixed(0) + ' %</b> ' +
      '<span style="color:#64748b">(état ' + (etat * 100).toFixed(0) + ' % · DPE ' + (dpe * 100).toFixed(0) +
      ' % · terrain ' + (bonusTerrain * 100).toFixed(0) + ' %)</span></div>';
    h += '<div style="margin-top:8px">Estimation pour ' + surf + ' m² : <b>' + euro(px) + '</b></div>';
    h += '<div>Fourchette d\'offre conseillée : <b>' + euro(px * 0.92) + ' → ' + euro(px * 1.08) + '</b> ' +
      '<span style="color:#64748b">(soit ' + nf.format(base * m) + ' €/m² ajusté)</span></div>';

    if (comp.length) {
      var pm2 = comp.map(function (c) { return c.pm2; }).sort(function (a, b) { return a - b; });
      var med = pm2[Math.floor(pm2.length / 2)];
      h += '<div style="margin-top:8px">Ventes comparables (' + comp.length + ', surface ±30 m²) : ' +
        'médiane <b>' + nf.format(med) + ' €/m²</b> → ' + euro(med * surf) + ' pour ' + surf + ' m²</div>';
      h += '<div style="font-size:13px;color:#475569;margin-top:4px">' + comp.map(function (c) {
        return c.date + ' · ' + euro(c.prix) + ' · ' + c.surface + ' m² · ' + c.pieces + ' p.';
      }).join('<br>') + '</div>';
    } else {
      h += '<div style="margin-top:8px;color:#64748b">Pas de vente comparable récente (±30 m²) sur cette commune.</div>';
    }

    if (annoncesCommune.length) {
      h += '<div style="margin-top:10px"><b>Annonces en cours sur ' + nom + ' :</b><br>' +
        annoncesCommune.map(function (a) {
          var p = a.properties, pm2a = a.pm2annonce;
          var ec = pm2a ? Math.round((pm2a / base - 1) * 100) : null;
          return '• ' + p.titre + ' — ' + p.prix + (pm2a ? ' (' + nf.format(pm2a) + ' €/m²' +
            (ec !== null ? ', <span class="' + (ec > 0 ? 'neg' : 'pos') + '">' + (ec > 0 ? '+' : '') + ec + ' % vs DVF</span>' : '') + ')' : '');
        }).join('<br>') + '</div>';
    }
    el('simResultat').innerHTML = h;
    el('simNote').innerHTML = 'Modèle indicatif : médiane DVF des ventes réelles de la commune ' +
      '(12 derniers mois, segment 100-200 m² quand disponible) + ajustements forfaitaires (état, DPE, terrain). ' +
      'Ne remplace ni une expertise ni une visite. Le DVF ne renseigne ni l\'état intérieur ni le DPE.';
  }

  /* ---------- 4. Annonces vs DVF ---------- */
  function renderAnnonces() {
    var lignes = ANNONCES.map(function (a) {
      var p = a.properties, st = statsCommune(p.commune);
      var base = st && st.ref ? st.ref.pm2_median : null;
      var pm2 = a.pm2annonce;
      var ecart = (base && pm2) ? (pm2 / base - 1) * 100 : null;
      var surf = parseFloat((p.surface_habitable || '').replace(/[^\d.]/g, '')) || null;
      return {
        html: [
          p.titre + (p.hors_budget ? ' <span class="pastille" style="background:#fef3c7;color:#92400e">hors fourchette</span>' : ''),
          p.prix,
          surf ? nf.format(surf) + ' m²' : '—',
          pm2 ? nf.format(pm2) + ' €/m²' : '—',
          base ? nf.format(base) + ' €/m²' : '—',
          ecart === null ? '—' : '<span class="' + (ecart > 0 ? 'neg' : 'pos') + '">' + (ecart > 0 ? '+' : '') + ecart.toFixed(0) + ' %</span>',
          (p.note || '').replace(/<[^>]*>/g, '').slice(0, 90)
        ]
      };
    }).sort(function (a, b) { return (b.html[5] || '').length - (a.html[5] || '').length; }).map(function (o) { return o.html; });

    var z = el('tblAnnonces');
    z.innerHTML = tableau(['Bien', 'Prix affiché', 'Surface', '€/m² annonce', 'Médiane DVF (réf.)', 'Écart', 'Critères / note'], lignes);
    activerTri(z);
  }

  /* ---------- 5. Ventes récentes ---------- */
  function renderVentes(filtre) {
    var v = DVF.ventes_recentes.filter(function (x) { return !filtre || x.commune === filtre; })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 120);
    var lignes = v.map(function (x) {
      return [x.date, x.commune, x.pieces ? x.pieces + ' p.' : '—', x.surface + ' m²',
        x.terrain ? nf.format(x.terrain) + ' m²' : '—', euro(x.prix), nf.format(x.pm2) + ' €/m²'];
    });
    var z = el('tblVentes');
    z.innerHTML = tableau(['Date', 'Commune', 'Pièces', 'Surface', 'Terrain', 'Prix', '€/m²'], lignes);
    activerTri(z);
  }

  function renderFiltreVille() {
    var noms = Object.keys(DVF.communes).filter(function (n) {
      return DVF.ventes_recentes.some(function (v) { return v.commune === n; });
    }).sort();
    noms.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      el('filtreVille').appendChild(o);
    });
    el('filtreVille').addEventListener('change', function () { renderVentes(el('filtreVille').value); });
  }

  /* ---------- chargement ---------- */
  Promise.all([
    fetch('dvf.json').then(function (r) { return r.json(); }),
    fetch('veille_immo.geojson').then(function (r) { return r.json(); })
  ]).then(function (res) {
    DVF = res[0];
    ANNONCES = res[1].features.map(function (f) {
      var p = f.properties;
      // premier nombre trouvé ("130 m²" -> 130, "550 000 €" -> 550000, "prix sur demande" -> NaN)
      var premNombre = function (s) {
        var m = String(s == null ? '' : s).replace(/\s/g, '').match(/\d+(?:[.,]\d+)?/);
        return m ? parseFloat(m[0].replace(',', '.')) : NaN;
      };
      var surf = premNombre(p.surface_habitable);
      var prix = premNombre(p.prix);
      f.pm2annonce = (surf && prix) ? Math.round(prix / surf) : null;
      return f;
    });

    el('maj').textContent = 'DVF : ' + DVF.maj + ' · ' + Object.keys(DVF.communes).length + ' communes';
    var noms = Object.keys(DVF.communes).sort();
    noms.forEach(function (n) {
      var o = document.createElement('option'); o.value = n; o.textContent = n;
      el('simCommune').appendChild(o);
    });
    el('simCommune').value = 'Cervens';
    el('noteSource').textContent = 'Source : ' + DVF.source + ' — mise à jour ' + DVF.maj +
      '. Le DVF recense les mutations immobilières enregistrées chez les notaires ; il exclut les ventes non encore publiées (délai moyen ~6 mois).';

    renderCommunes();
    renderCases();
    renderAnnonces();
    renderFiltreVille();
    renderVentes('');
    simulateur();
    ['simCommune', 'simSurface', 'simEtat', 'simDpe', 'simTerrain'].forEach(function (id) {
      el(id).addEventListener('input', simulateur);
      el(id).addEventListener('change', simulateur);
    });
  }).catch(function (e) {
    document.querySelector('main').insertAdjacentHTML('beforeend',
      '<p class="note">Erreur de chargement des données : ' + e + '</p>');
  });
})();
