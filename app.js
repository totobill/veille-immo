/* Veille immo Haute-Savoie — carte Leaflet (fonds Esri, données GeoJSON externes) */
(function () {
  'use strict';

  var COULEURS = { maison: '#2563eb', terrain: '#22c55e', hors: '#f59e0b' };

  var m = L.map('map').setView([46.20, 6.30], 10);

  // --- Fonds de carte : Esri (sans cle API, sans filigrane) ---
  var streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin &copy; OpenStreetMap'
  });
  var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics'
  });
  var relief = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin'
  });
  var osmfr = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 19, attribution: '&copy; OpenStreetMap France'
  });

  var FONDS = [['Esri Plan', streets], ['Esri Satellite', satellite], ['Esri Relief', relief], ['OSM France', osmfr]];
  var parNom = {};
  FONDS.forEach(function (f) { parNom[f[0]] = f[1]; });
  L.control.layers(parNom, null, { position: 'topright' }).addTo(m);

  // Bascule automatique si un fournisseur de tuiles tombe
  var idx = 0, err = 0;
  function basculer() {
    if (m.hasLayer(FONDS[idx][1])) { m.removeLayer(FONDS[idx][1]); }
    idx = (idx + 1) % FONDS.length;
    FONDS[idx][1].addTo(m);
    console.log('Fond de carte bascule vers : ' + FONDS[idx][0]);
  }
  FONDS.forEach(function (f) {
    f[1].on('tileerror', function () { err++; if (err >= 5) { err = 0; basculer(); } });
  });
  streets.addTo(m);

  var groupes = {
    'Maisons 5 chambres': L.layerGroup().addTo(m),
    'Terrains a batir': L.layerGroup().addTo(m),
    'Hors fourchette': L.layerGroup(),
    'Zones de recherche (20 km)': L.layerGroup().addTo(m)
  };

  function couleur(p) {
    if (p.hors_budget) { return COULEURS.hors; }
    return p.type_bien === 'terrain' ? COULEURS.terrain : COULEURS.maison;
  }

  function popup(p) {
    var l = [];
    l.push('<b>' + p.titre + '</b>');
    l.push('Prix : <b>' + p.prix + '</b>');
    if (p.surface_habitable) { l.push(p.surface_habitable); }
    if (p.surface_terrain) { l.push('terrain : ' + p.surface_terrain); }
    if (p.chambres) { l.push(p.chambres); }
    l.push('<small>' + p.note + '</small>');
    l.push('<a href="' + p.lien + '" target="_blank" rel="noopener">Voir l\'annonce ↗</a>');
    return l.join('<br>');
  }

  function groupePour(p) {
    if (p.type_bien === 'terrain' && !p.hors_budget) { return 'Terrains a batir'; }
    if (p.type_bien === 'maison' && !p.hors_budget) { return 'Maisons 5 chambres'; }
    return 'Hors fourchette';
  }

  fetch('veille_immo.geojson')
    .then(function (r) { return r.json(); })
    .then(function (gj) {
      var n = { maison: 0, terrain: 0, hors: 0 };
      gj.features.forEach(function (f) {
        var c = f.geometry.coordinates, p = f.properties;
        var col = couleur(p);
        if (p.hors_budget) { n.hors++; } else if (p.type_bien === 'terrain') { n.terrain++; } else { n.maison++; }
        var marker = L.circleMarker([c[1], c[0]], {
          radius: 7, color: '#ffffff', weight: 2, fillColor: col, fillOpacity: 1
        }).bindPopup(popup(p));
        marker.addTo(groupes[groupePour(p)]);
      });
      var surcouches = {};
      surcouches['Maisons 5 chambres (' + n.maison + ')'] = groupes['Maisons 5 chambres'];
      surcouches['Terrains a batir (' + n.terrain + ')'] = groupes['Terrains a batir'];
      surcouches['Hors fourchette (' + n.hors + ')'] = groupes['Hors fourchette'];
      surcouches['Zones 20 km'] = groupes['Zones de recherche (20 km)'];
      L.control.layers(null, surcouches, { position: 'topright', collapsed: false }).addTo(m);
      var info = document.getElementById('info');
      if (info) {
        info.textContent = gj.features.length + ' biens suivis (' + n.maison + ' maisons · ' +
          n.terrain + ' terrains · ' + n.hors + ' hors fourchette)';
      }
    })
    .catch(function (e) {
      var info = document.getElementById('info');
      if (info) { info.textContent = 'Erreur de chargement des données : ' + e; }
      console.error(e);
    });

  fetch('zones.json')
    .then(function (r) { return r.json(); })
    .then(function (z) {
      z.zones.forEach(function (zone) {
        L.circle([zone.lat, zone.lon], {
          radius: zone.rayon || 20000, color: '#ef4444', weight: 1.5,
          dashArray: '6 4', fillColor: '#ef4444', fillOpacity: 0.04
        }).bindPopup('<b>' + zone.nom + '</b> — rayon ' + Math.round((zone.rayon || 20000) / 1000) + ' km')
          .addTo(groupes['Zones de recherche (20 km)']);
        L.circleMarker([zone.lat, zone.lon], {
          radius: 6, color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1
        }).bindPopup('<b>' + zone.nom + '</b>').addTo(groupes['Zones de recherche (20 km)']);
      });
    })
    .catch(function (e) { console.error('zones.json : ' + e); });
})();
