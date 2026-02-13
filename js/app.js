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
async function activarCapasMarcadas(){
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"][data-layer]'));
  const keys = checks.filter(c => c.checked).map(c => c.getAttribute('data-layer'));
  for (const k of keys){
    const lyr = await loadLayer(k);
    if (!map.hasLayer(lyr)) lyr.addTo(map);
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

  distLayer.eachLayer(lyr => {
    if (found) return;
    const p = lyr.feature?.properties || {};

    const d = norm(p.DISTRITO);
    const r = norm(p.NOMDEP);
    const pr = norm(p.PROVINCIA);

    const okDist = d && d.includes(distTxt);
    const okReg  = regionTxt ? (r && r.includes(regionTxt)) : true;
    const okProv = provTxt   ? (pr && pr.includes(provTxt)) : true;

    if (okDist && okReg && okProv) found = lyr;
  });

  if (!found){
    setMsg('No encontré el distrito con esos filtros.');
    return;
  }

  clearHighlight();

  highlightLayer = L.geoJSON(found.feature, {
    style: { weight: 4, color: '#ff6b00', fillOpacity: 0.08 },
    onEachFeature: (f, lyr) => {
      const nombre = f.properties?.DISTRITO ?? 'Distrito';
      lyr.bindTooltip(nombre, { permanent:true, direction:'center', className:'admin-label' }).openTooltip();
    }
  }).addTo(map);

  map.fitBounds(highlightLayer.getBounds(), { padding: [30, 30] });
  setMsg(`✅ Distrito resaltado: ${found.feature.properties?.DISTRITO ?? ''}`);
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
      const n = l.feature?.properties?.NOMDEP;
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
    await activarCapasMarcadas();
  }catch(err){
    console.error(err);
    setMsg(`Error: ${err.message}`);
  }
});

window.addEventListener('load', () => {
  cargarAutocomplete();
});
