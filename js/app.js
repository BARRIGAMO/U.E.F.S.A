// =========================
// MAPA BASE
// =========================
const map = L.map('map').setView([-9.2, -75.0], 6);

// --- Basemap Topográfico (OpenTopoMap)
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: '© OpenTopoMap'
});

// --- Basemap Imagery (ESRI)
const imagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Tiles © Esri' }
);

// Topo por defecto
topo.addTo(map);

// Control de cambio (lado derecho)
L.control.layers(
  { "Topográfico": topo, "Imagery": imagery },
  null,
  { position: 'topright' }
).addTo(map);

// =========================
// UTILIDADES
// =========================
const msgEl = document.getElementById('msg');
function setMsg(t){ if (msgEl) msgEl.textContent = t || ''; }

function norm(s){
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// =========================
// REGISTRO DE CAPAS (lazy load)
// =========================
const registry = {
  region:     { url: 'data/data_region.geojson',     loaded:false, layer:null },
  provincia:  { url: 'data/data_provincia.geojson',  loaded:false, layer:null },
  distritos:  { url: 'data/data_distritos.geojson',  loaded:false, layer:null },
  anp: { url: 'data/data_anp.geojson', loaded:false, layer:null },
  za:  { url: 'data/data_za.geojson',  loaded:false, layer:null }
};

// Capa de resaltado
let highlightLayer = null;
function clearHighlight(){
  if (highlightLayer){
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }
}

// =========================
// CARGA GEOJSON
// =========================
async function loadLayer(key){
  const cfg = registry[key];
  if (!cfg) throw new Error(`No existe capa registrada: ${key}`);
  if (cfg.loaded) return cfg.layer;

  const res = await fetch(cfg.url);
  if (!res.ok) throw new Error(`No se pudo cargar: ${cfg.url}`);
  const geojson = await res.json();

  let layer;

  if (key === 'anp'){
    layer = L.geoJSON(geojson, {
      style: () => ({ weight: 2, color: '#1f2937', fillOpacity: 0.06 }),
      onEachFeature: (f, lyr) => {
        const p = f.properties || {};
        lyr.bindPopup(`
          <div style="font-size:13px">
            <div style="font-weight:900;margin-bottom:6px">${p.anp_nomb ?? 'ANP'}</div>
            <div><b>Código:</b> ${p.anp_codi ?? '-'}</div>
            <div><b>Categoría:</b> ${p.anp_cate ?? '-'}</div>
          </div>
        `);
      }
    });
  } else if (key === 'za'){
    layer = L.geoJSON(geojson, {
      style: () => ({ weight: 2, color: '#7c2d12', fillOpacity: 0.03 })
    });
  } else {
    layer = L.geoJSON(geojson, {
      style: () => ({ weight: 1.5, color: '#334155', fillOpacity: 0.03 })
    });
  }

  cfg.layer = layer;
  cfg.loaded = true;
  return layer;
}

// =========================
// ACTIVAR CAPAS MARCADAS (FTA)
// =========================
async function syncCapasMarcadas(){
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"][data-layer]'));

  for (const c of checks){
    const k = c.getAttribute('data-layer');
    const lyr = await loadLayer(k);

    if (c.checked){
      if (!map.hasLayer(lyr)) lyr.addTo(map);
    } else {
      if (map.hasLayer(lyr)) map.removeLayer(lyr);
    }
  }
}
// =========================
// BUSCAR DISTRITO
// =========================
async function buscarZoomDistrito(){
  const regionTxt = norm(document.getElementById('txtRegion').value);
  const provTxt   = norm(document.getElementById('txtProvincia').value);
  const distTxt   = norm(document.getElementById('txtDistrito').value);

  if (!distTxt){
    setMsg('Escribe al menos el Distrito.');
    return;
  }

  const distLayer = await loadLayer('distritos');
  let found = null;

  // 1) BUSCAR el distrito
  distLayer.eachLayer(lyr => {
    if (found) return;

    const p = lyr.feature?.properties || {};
    const d  = norm(p.DISTRITO);

    // si existen campos extra, los usa; si no existen, NO bloquea
    const hasReg  = Object.prototype.hasOwnProperty.call(p, 'NOMDEP');
    const hasProv = Object.prototype.hasOwnProperty.call(p, 'PROVINCIA');

    const r  = norm(hasReg  ? p.NOMBDEP    : '');
    const pr = norm(hasProv ? p.PROVINCIA : '');

    const okDist = d && d.includes(distTxt);
    const okReg  = regionTxt ? (hasReg  ? r.includes(regionTxt)  : true) : true;
    const okProv = provTxt   ? (hasProv ? pr.includes(provTxt)   : true) : true;

    if (okDist && okReg && okProv) found = lyr;
  });

  if (!found){
    setMsg('No encontré el distrito. Prueba SOLO con el nombre del distrito (sin región/provincia) o revisa tildes.');
    return;
  }

  // 2) LIMPIAR resaltado anterior
  clearHighlight();

  // 3) RESALTAR + ETIQUETA
  highlightLayer = L.geoJSON(found.feature, {
    style: { weight: 4, color: '#ff6b00', fillOpacity: 0.10 },
    onEachFeature: (f, lyr) => {
      const nombre = f.properties?.DISTRITO ?? 'Distrito';
      lyr.bindTooltip(nombre, {
        permanent: true,
        direction: 'center',
        className: 'admin-label'
      }).openTooltip();
    }
  }).addTo(map);

  // 4) ZOOM SIEMPRE
  map.fitBounds(highlightLayer.getBounds(), { padding: [30, 30] });

  setMsg(`✅ Distrito: ${found.feature?.properties?.DISTRITO ?? ''}`);
}


// Tooltip style
const style = document.createElement('style');
style.innerHTML = `
  .admin-label{
    background: rgba(255,255,255,.92);
    border: 1px solid rgba(0,0,0,.15);
    border-radius: 10px;
    padding: 4px 8px;
    font-weight: 900;
    color: #111827;
    box-shadow: 0 8px 18px rgba(0,0,0,.12);
  }
`;
document.head.appendChild(style);

// =========================
// AUTOCOMPLETE
// =========================
async function cargarAutocomplete(){
  try{
    setMsg('Cargando autocompletar...');

    const regLayer = await loadLayer('region');
    const dlReg = document.getElementById('listaRegiones');
    const regiones = new Set();
    regLayer.eachLayer(l => {
      const n = l.feature?.properties?.NOMBDEP;
      if (n) regiones.add(n);
    });
    if (dlReg){
      dlReg.innerHTML = '';
      [...regiones].sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        dlReg.appendChild(opt);
      });
    }

    const provLayer = await loadLayer('provincia');
    const dlProv = document.getElementById('listaProvincias');
    const provincias = new Set();
    provLayer.eachLayer(l => {
      const n = l.feature?.properties?.PROVINCIA;
      if (n) provincias.add(n);
    });
    if (dlProv){
      dlProv.innerHTML = '';
      [...provincias].sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        dlProv.appendChild(opt);
      });
    }

    const distLayer = await loadLayer('distritos');
    const dlDist = document.getElementById('listaDistritos');
    const distritos = new Set();
    distLayer.eachLayer(l => {
      const n = l.feature?.properties?.DISTRITO;
      if (n) distritos.add(n);
    });
    if (dlDist){
      dlDist.innerHTML = '';
      [...distritos].sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        dlDist.appendChild(opt);
      });
    }

    setMsg('✅ Autocomplete listo. Escribe y elige de la lista.');
  }catch(err){
    console.error(err);
    setMsg(`❌ Autocomplete error: ${err.message}`);
  }
}

// =========================
// EVENTOS
// =========================
document.getElementById('btnBuscar').addEventListener('click', async () => {
  try{
    setMsg('Buscando distrito y cargando capas...');
    await buscarZoomDistrito();
    await syncCapasMarcadas();
  }catch(err){
    console.error(err);
    setMsg(`Error: ${err.message}`);
  }
});

window.addEventListener('load', () => {
  cargarAutocomplete();
});
document.querySelectorAll('input[type="checkbox"][data-layer]').forEach(chk => {
  chk.addEventListener('change', () => {
    syncCapasMarcadas().catch(err => setMsg(`Error capas: ${err.message}`));
  });
});


