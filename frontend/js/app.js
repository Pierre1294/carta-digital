(() => {
  "use strict";

  const AGGREGATOR_META = {
    RAPPI: { label: "Rappi", color: "#ff441f" },
    DIDI: { label: "DiDi Food", color: "#ff6400" },
    PEDIDOSYA: { label: "PedidosYa", color: "#eb0045" },
    LLAMAFOOD: { label: "Llamafood", color: "#7c3aed" },
  };

  // Flujo de atención del producto: progreso lineal (nunca retrocede solo)
  // + alertas superpuestas que avisan de algo a revisar sin bajar de estado.
  const PROGRESO_META = {
    NUEVO: { label: "Nuevo", cls: "nuevo" },
    PENDIENTE_DATOS: { label: "Pendiente", cls: "pendiente" },
    DATOS_COMPLETOS: { label: "Completo", cls: "completo" },
    ORDENADO_EN_CARTA: { label: "En carta", cls: "en-carta" },
    INTEGRADO: { label: "Integrado", cls: "integrado" },
  };
  const PROGRESO_RANK = { NUEVO: 0, PENDIENTE_DATOS: 1, DATOS_COMPLETOS: 2, ORDENADO_EN_CARTA: 3, INTEGRADO: 4 };
  const ALERTA_META = {
    CAMBIO_STS: { label: "Oracle STS reportó un cambio en este producto" },
    PENDIENTE_REPUBLICAR: { label: "Hay cambios sin publicar en el agregador" },
  };

  // Estado (progreso + alertas) de cada producto para el agregador de la
  // pestaña activa del catálogo; se recarga con cada fetchMenu().
  function estadoDe(code) {
    return state.estadoCodes[String(code)] || { progreso: "PENDIENTE_DATOS", alertas: [] };
  }

  // Badges de campo: PedidosYa se separa en "Productos" y "Opciones" tal
  // como en la matriz "Campos por agregador".
  const FIELD_AGG_META = {
    RAPPI: { label: "Rappi", color: "#ff441f" },
    DIDI: { label: "Didi", color: "#ff6400" },
    PEYA_PRODUCTOS: { label: "PeYa Productos", color: "#eb0045" },
    PEYA_OPCIONES: { label: "PeYa Opciones", color: "#a3123a" },
    LLAMAFOOD: { label: "Llamafood", color: "#7c3aed" },
  };

  // Campos a nivel "producto padre" según Campos por agregador.png (filas 1-18).
  // "tab" ubica el campo dentro del modal de edición (Información general / Precios / Imágenes).
  // "section" agrupa esos mismos campos dentro del formulario único de Vista previa 2.
  const PRODUCT_FIELDS = [
    { key: "Menu", label: "Menu", section: "Menú y categoría", tab: "general", type: "readonly", aggregators: ["RAPPI", "DIDI", "LLAMAFOOD"], nota: "Se completa automáticamente con el nombre de la marca." },
    { key: "CodigoCategoria", label: "Código Categoría", section: "Menú y categoría", tab: "general", type: "text", aggregators: ["RAPPI", "DIDI"] },
    { key: "Collection", label: "Collection", section: "Menú y categoría", tab: "general", type: "categoria", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS"], hiddenRow: ["PEYA_PRODUCTOS"], ordenSets: "OrderPos" },
    { key: "Seccion", label: "Sección", section: "Menú y categoría", tab: "general", type: "categoria", aggregators: ["PEYA_PRODUCTOS", "PEYA_OPCIONES", "LLAMAFOOD"], alsoSets: ["Collection", "SKUSeccion", "SKUNameSeccion"], ordenSets: "OrderPos", nota: "Didi no maneja este campo por separado" },
    { key: "SKUSeccion", label: "SKU Sección", section: "Menú y categoría", tab: "general", type: "text", hiddenRow: true, aggregators: ["PEYA_PRODUCTOS"], nota: "Exclusivo de PeYa Productos" },
    { key: "SKUNameSeccion", label: "SKU Name Sección", section: "Menú y categoría", tab: "general", type: "text", hiddenRow: true, aggregators: ["PEYA_PRODUCTOS"], nota: "Exclusivo de PeYa Productos" },
    { key: "OrderPos", label: "Orden (OrderPos)", section: "Menú y categoría", tab: "general", type: "number", hiddenRow: true, aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "PEYA_OPCIONES", "LLAMAFOOD"], nota: "Se completa con el código (posición) de la categoría elegida en Collection/Sección." },
    { key: "ProdPos", label: "Posición producto (ProdPos)", section: "Menú y categoría", tab: "general", type: "number", hiddenRow: true, aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "PEYA_OPCIONES", "LLAMAFOOD"], nota: "Se completa con el orden del producto dentro de su categoría en Previsualizar carta." },

    { key: "CodigoPadre", label: "Código Padre", section: "Producto padre", tab: "precios", type: "readonly", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "PEYA_OPCIONES", "LLAMAFOOD"] },
    { key: "ProductoPadre", label: "Producto Padre", section: "Producto padre", tab: "precios", type: "readonly", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "PEYA_OPCIONES", "LLAMAFOOD"] },
    { key: "PrecioPadre", label: "Precio Padre", section: "Producto padre", tab: "precios", type: "number", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "LLAMAFOOD"], nota: "PeYa Opciones no trae precio de producto padre. El precio puede ser distinto para cada agregador." },
    { key: "PrecioPadreFull", label: "Precio Padre Full", section: "Producto padre", tab: "precios", type: "number", aggregators: ["RAPPI", "DIDI"] },
    { key: "VigenciaFechaInicio", label: "Vigencia — Fecha inicio", section: "Producto padre", tab: "precios", type: "date", aggregators: ["RAPPI", "DIDI"] },
    { key: "VigenciaFechaFin", label: "Vigencia — Fecha fin", section: "Producto padre", tab: "precios", type: "date", aggregators: ["RAPPI", "DIDI"] },

    { key: "DescripcionProductoPadre", label: "Descripción corta", section: "Descripción", tab: "general", type: "textarea", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS"], nota: "En Rappi se envía como 'DescripcionProductoPadreRappi'; LlamaFood también trae esta misma columna duplicada." },
    { key: "SuperCollection", label: "Super Collection", section: "Descripción", tab: "general", type: "text", aggregators: ["LLAMAFOOD"], nota: "Exclusivo de LlamaFood" },
    { key: "DescripcionProductoPadreLlamaFood", label: "Descripción Producto Padre (LlamaFood)", section: "Descripción", tab: "general", type: "textarea", aggregators: ["LLAMAFOOD"], nota: "Exclusivo de LlamaFood; distinta de la descripción general" },
    { key: "Imagen", label: "Imagen (URL)", section: "Imagen", tab: "imagenes", type: "text", aggregators: ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "LLAMAFOOD"], nota: "En LlamaFood se envía como 'ImagenLlamaFood'" },
  ];

  // hiddenRow puede ser `true` (oculto para todos los agregadores del campo) o un
  // array de códigos de agregador (oculto solo para esos, ej. Collection en PeYa
  // Productos se completa desde el combo de Sección y no muestra fila propia).
  function isFieldRowHidden(field, agg) {
    if (!field.hiddenRow) return false;
    return field.hiddenRow === true || field.hiddenRow.includes(agg);
  }

  // Orden en el que se muestran las secciones dentro del formulario único de Vista previa 2.
  const SECTION_ORDER = ["Menú y categoría", "Producto padre", "Descripción", "Imagen"];

  // Pestañas del modal de edición de producto (Vista previa).
  const MODAL_TABS = [
    { key: "general", label: "Información general" },
    { key: "precios", label: "Precios y disponibilidad" },
    { key: "opciones", label: "Opciones / Preguntas" },
    { key: "agregadores", label: "Agregadores" },
    { key: "imagenes", label: "Imágenes" },
  ];

  // Mapea la pestaña de agregador activa (Catálogo) al código usado en la matriz de campos.
  const TAB_TO_FIELD_AGG = {
    RAPPI: "RAPPI",
    DIDI: "DIDI",
    PEDIDOSYA: "PEYA_PRODUCTOS",
    LLAMAFOOD: "LLAMAFOOD",
  };

  // Agregadores editables dentro del modal (excluye la variante "PeYa Opciones").
  const FIELD_AGGREGATORS = ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "LLAMAFOOD"];

  // Inverso de TAB_TO_FIELD_AGG: de código de la matriz de campos al código
  // canónico usado para leer el canal NGR_Carta (canalIncludesAggregator).
  const FIELD_AGG_TO_CANONICAL = {
    RAPPI: "RAPPI",
    DIDI: "DIDI",
    PEYA_PRODUCTOS: "PEDIDOSYA",
    LLAMAFOOD: "LLAMAFOOD",
  };

  // Solo se editan los agregadores en los que el producto realmente se publica
  // según su canal NGR_Carta en Oracle Simphony (evita mostrar pestañas de
  // agregadores donde el producto no existe).
  function availableFieldAggregators(canal) {
    return FIELD_AGGREGATORS.filter((agg) => canalIncludesAggregator(canal, FIELD_AGG_TO_CANONICAL[agg]));
  }

  const els = {
    sidebar: document.getElementById("sidebar"),
    collapseBtn: document.getElementById("collapse-btn"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    btnMenuToggle: document.getElementById("btn-menu-toggle"),
    navAggregators: document.getElementById("nav-aggregators"),
    navViewButtons: document.querySelectorAll(".nav-item[data-view]"),

    topbarEyebrow: document.getElementById("topbar-eyebrow"),
    topbarTitle: document.getElementById("topbar-title"),
    topbarSub: document.getElementById("topbar-sub"),

    viewResumen: document.getElementById("view-resumen"),
    resumenKpiGrid: document.getElementById("resumen-kpi-grid"),
    queueNote: document.getElementById("queue-note"),
    queueEmpty: document.getElementById("queue-empty"),
    queueWrap: document.getElementById("queue-wrap"),
    queueTbody: document.getElementById("queue-tbody"),
    tplQueueRow: document.getElementById("tpl-queue-row"),

    catalogMarcaSelect: document.getElementById("catalog-marca-select"),
    catalogMarcaHint: document.getElementById("catalog-marca-hint"),
    catalogMarcaEmpty: document.getElementById("catalog-marca-empty"),
    catalogContent: document.getElementById("catalog-content"),

    catalogSubviewTabs: document.getElementById("catalog-subview-tabs"),
    catalogSubviewProductos: document.getElementById("catalog-subview-productos"),
    catalogSubviewCarta: document.getElementById("catalog-subview-carta"),
    cartaSinCategorias: document.getElementById("carta-sin-categorias"),
    cartaSinCategoriasAgg: document.getElementById("carta-sin-categorias-agg"),
    cartaPreview: document.getElementById("carta-preview"),
    cartaPreviewScroll: document.getElementById("carta-preview-scroll"),
    cartaSections: document.getElementById("carta-sections"),
    cartaNavList: document.getElementById("carta-nav-list"),
    cartaPreviewBadge: document.getElementById("carta-preview-badge"),
    cartaPreviewMarca: document.getElementById("carta-preview-marca"),
    cartaPreviewAgg: document.getElementById("carta-preview-agg"),
    cartaStatCategorias: document.getElementById("carta-stat-categorias"),
    cartaStatProductos: document.getElementById("carta-stat-productos"),
    cartaStatPendientes: document.getElementById("carta-stat-pendientes"),

    grid: document.getElementById("grid"),
    loading: document.getElementById("loading"),
    empty: document.getElementById("empty"),
    search: document.getElementById("search"),
    resultCount: document.getElementById("result-count"),
    lastUpdated: document.getElementById("last-updated"),
    statusTabs: document.getElementById("status-tabs"),
    bannerError: document.getElementById("banner-error"),
    connDot: document.getElementById("conn-dot"),
    connText: document.getElementById("conn-text"),
    connStatus: document.getElementById("conn-status"),
    btnRefresh: document.getElementById("btn-refresh"),
    refreshIcon: document.getElementById("refresh-icon"),
    btnSettings: document.getElementById("btn-settings"),
    configOverlay: document.getElementById("config-overlay"),
    configForm: document.getElementById("config-form"),
    configFeedback: document.getElementById("config-feedback"),
    btnCloseConfig: document.getElementById("btn-close-config"),
    btnCancelConfig: document.getElementById("btn-cancel-config"),
    tplCard: document.getElementById("tpl-card"),

    viewCatalog: document.getElementById("view-catalog"),
    viewPreguntas: document.getElementById("view-preguntas"),
    viewCategorias: document.getElementById("view-categorias"),
    viewCartas: document.getElementById("view-cartas"),

    preguntasMarcaSelect: document.getElementById("preguntas-marca-select"),
    preguntasMarcaHint: document.getElementById("preguntas-marca-hint"),
    preguntasMarcaEmpty: document.getElementById("preguntas-marca-empty"),
    preguntasContent: document.getElementById("preguntas-content"),
    preguntasSearch: document.getElementById("preguntas-search"),
    preguntasCount: document.getElementById("preguntas-count"),
    preguntasLoading: document.getElementById("preguntas-loading"),
    preguntasEmpty: document.getElementById("preguntas-empty"),
    preguntasError: document.getElementById("preguntas-error"),
    preguntasTbody: document.getElementById("preguntas-tbody"),
    tplPreguntaRow: document.getElementById("tpl-pregunta-row"),

    btnNuevaCategoria: document.getElementById("btn-nueva-categoria"),
    formCategoria: document.getElementById("form-categoria"),
    btnCancelarCategoria: document.getElementById("btn-cancelar-categoria"),
    filtroMarca: document.getElementById("filtro-marca"),
    filtroAgregador: document.getElementById("filtro-agregador"),
    marcasDatalist: document.getElementById("marcas-datalist"),
    categoriasError: document.getElementById("categorias-error"),
    categoriasEmpty: document.getElementById("categorias-empty"),
    categoriasList: document.getElementById("categorias-list"),
    tplCategoriaCard: document.getElementById("tpl-categoria-card"),
    tplSubcategoriaRow: document.getElementById("tpl-subcategoria-row"),

    btnNuevaCarta: document.getElementById("btn-nueva-carta"),
    formCarta: document.getElementById("form-carta"),
    btnCancelarCarta: document.getElementById("btn-cancelar-carta"),
    filtroCartaBusqueda: document.getElementById("filtro-carta-busqueda"),
    filtroCartaAgregador: document.getElementById("filtro-carta-agregador"),
    cartasError: document.getElementById("cartas-error"),
    cartasEmpty: document.getElementById("cartas-empty"),
    cartasList: document.getElementById("cartas-list"),
    tplCartaCard: document.getElementById("tpl-carta-card"),
    tplCartaCatalogoRow: document.getElementById("tpl-carta-catalogo-row"),

    cartasMarcaSelect: document.getElementById("cartas-marca-select"),
    cartasMarcaHint: document.getElementById("cartas-marca-hint"),
    cartasMarcaEmpty: document.getElementById("cartas-marca-empty"),
    cartasContent: document.getElementById("cartas-content"),

    cartasSubviewTabs: document.getElementById("cartas-subview-tabs"),
    cartasSubviewMaestros: document.getElementById("cartas-subview-maestros"),
    cartasSubviewAsociar: document.getElementById("cartas-subview-asociar"),
    cartasSubviewPrevisualizar: document.getElementById("cartas-subview-previsualizar"),

    asociarCartaSelect: document.getElementById("asociar-carta-select"),
    asociarSinCarta: document.getElementById("asociar-sin-carta"),
    asociarPanel: document.getElementById("asociar-panel"),
    asociarSubtitle: document.getElementById("asociar-subtitle"),
    asociarSearch: document.getElementById("asociar-search"),
    asociarTabs: document.querySelectorAll("#cartas-subview-asociar .carta-catalogo-tab"),
    asociarCount: document.getElementById("asociar-count"),
    asociarError: document.getElementById("asociar-error"),
    asociarLoading: document.getElementById("asociar-loading"),
    asociarEmpty: document.getElementById("asociar-empty"),
    asociarList: document.getElementById("asociar-list"),

    preview2CartaSelect: document.getElementById("preview2-carta-select"),
    preview2SinCarta: document.getElementById("preview2-sin-carta"),
    preview2SinProductos: document.getElementById("preview2-sin-productos"),
    preview2: document.getElementById("preview2"),
    preview2Badge: document.getElementById("preview2-badge"),
    preview2Nombre: document.getElementById("preview2-nombre"),
    preview2Agg: document.getElementById("preview2-agg"),
    preview2StatCategorias: document.getElementById("preview2-stat-categorias"),
    preview2StatProductos: document.getElementById("preview2-stat-productos"),
    preview2StatPendientes: document.getElementById("preview2-stat-pendientes"),
    preview2NavList: document.getElementById("preview2-nav-list"),
    preview2Scroll: document.getElementById("preview2-scroll"),
    preview2Sections: document.getElementById("preview2-sections"),

    previewOverlay: document.getElementById("preview-overlay"),
    previewTypeBadge: document.getElementById("preview-type-badge"),
    previewTitle: document.getElementById("preview-title"),
    previewCode: document.getElementById("preview-code"),
    btnClosePreview: document.getElementById("btn-close-preview"),
    previewError: document.getElementById("preview-error"),
    previewLoading: document.getElementById("preview-loading"),
    previewBody: document.getElementById("preview-body"),
    previewModalTabs: document.getElementById("preview-modal-tabs"),
    previewTabPanels: document.getElementById("preview-tab-panels"),
    previewMockupTitle: document.getElementById("preview-mockup-title"),
    previewDeviceToggle: document.getElementById("preview-device-toggle"),
    previewMockupCard: document.getElementById("preview-mockup-card"),
    previewMockupImage: document.getElementById("preview-mockup-image"),
    previewMockupName: document.getElementById("preview-mockup-name"),
    previewMockupDesc: document.getElementById("preview-mockup-desc"),
    previewMockupPrice: document.getElementById("preview-mockup-price"),
    previewMockupIncludesWrap: document.getElementById("preview-mockup-includes-wrap"),
    previewMockupIncludesTitle: document.getElementById("preview-mockup-includes-title"),
    previewMockupIncludes: document.getElementById("preview-mockup-includes"),
    previewMockupCta: document.getElementById("preview-mockup-cta"),
    previewSaveMessage: document.getElementById("preview-save-message"),
    previewFooterHelp: document.getElementById("preview-footer-help"),
    btnCancelPreview: document.getElementById("btn-cancel-preview"),
    btnSavePreview: document.getElementById("btn-save-preview"),

    previewEstadoPanel: document.getElementById("preview-estado-panel"),
    previewEstadoPill: document.getElementById("preview-estado-pill"),
    previewEstadoAlertaSts: document.getElementById("preview-estado-alerta-sts"),
    btnConfirmarSts: document.getElementById("preview-btn-confirmar-sts"),
    previewEstadoAlertaRepublicar: document.getElementById("preview-estado-alerta-republicar"),
    btnIntegrar: document.getElementById("preview-btn-integrar"),
    btnDesintegrar: document.getElementById("preview-btn-desintegrar"),
    cartasPanel: document.getElementById("preview-cartas-panel"),
  };

  // Vista previa 2 (en prueba): editor de producto a pantalla completa, un solo
  // formulario. Usa los mismos nombres de propiedad que "els" para los elementos
  // que comparten lógica (mockup, guardar, cerrar), así las funciones que operan
  // sobre "previewTarget" sirven para ambas pantallas sin duplicar código.
  const els2 = {
    previewOverlay: document.getElementById("preview-overlay-v2"),
    previewTypeBadge: document.getElementById("v2-type-badge"),
    previewTitle: document.getElementById("v2-title"),
    previewCode: document.getElementById("v2-code"),
    btnClosePreview: document.getElementById("v2-btn-close"),
    previewError: document.getElementById("v2-error"),
    previewLoading: document.getElementById("v2-loading"),
    previewBody: document.getElementById("v2-body"),
    previewAggSelector: document.getElementById("v2-agg-selector"),
    previewFormSections: document.getElementById("v2-form-sections"),
    previewAgregadoresPanel: document.getElementById("v2-agregadores-panel"),
    previewAggCount: document.getElementById("v2-agg-count"),
    previewOpcionesPanel: document.getElementById("v2-opciones-panel"),
    previewOpcionesCountBadge: document.getElementById("v2-opciones-count-badge"),
    previewSaveMessage: document.getElementById("v2-save-message"),
    previewFooterHelp: document.getElementById("v2-footer-help"),
    btnCancelPreview: document.getElementById("v2-btn-cancel"),
    btnSavePreview: document.getElementById("v2-btn-save"),

    previewEstadoPanel: document.getElementById("v2-estado-panel"),
    previewEstadoPill: document.getElementById("v2-estado-pill"),
    previewEstadoAlertaSts: document.getElementById("v2-estado-alerta-sts"),
    btnConfirmarSts: document.getElementById("v2-btn-confirmar-sts"),
    previewEstadoAlertaRepublicar: document.getElementById("v2-estado-alerta-republicar"),
    btnIntegrar: document.getElementById("v2-btn-integrar"),
    btnDesintegrar: document.getElementById("v2-btn-desintegrar"),
    cartasPanel: document.getElementById("v2-cartas-panel"),
  };

  // Apunta a "els" o "els2" según cuál pantalla de edición esté abierta; las
  // funciones compartidas (guardar, cerrar, vista previa en vivo) leen de aquí.
  let previewTarget = els;

  const state = {
    aggregators: ["RAPPI", "DIDI", "PEDIDOSYA", "LLAMAFOOD"],
    activeTab: null,
    products: [],
    fetchedAt: null,
    completedCodes: new Set(),
    estadoCodes: {}, // {codigo: {progreso, alertas: [...]}} para el agregador de la pestaña activa
    statusFilter: "pendientes", // "pendientes" | "completos" | "todos"
    aggregatorSummary: {}, // {AGG: {count, products: [...], completos: [codes...]}}
    summaryLoaded: false,
    currentView: "resumen",
    preguntas: [],
    preguntasLoaded: false,
    preguntasMarca: "", // marca elegida en Maestro de preguntas; obligatoria antes de listar
    categorias: [],
    categoriasLoaded: false,
    cartasMaestro: [],
    cartasMaestroLoaded: false,
    cartasMarca: "", // marca elegida en Cartas por agregador; obligatoria antes de listar
    catalogPorAgregador: {}, // {AGREGADOR: [productos...]} cache para nombre/precio en el maestro de cartas
    cartasSubview: "maestros", // "maestros" | "asociar" | "previsualizar" (vista "Cartas por agregador")
    // Sub-vista "Asociar productos": carta elegida + catálogo completo del
    // agregador + filtro por tab (todos/asociados/no-asociados) activo.
    asociarCarta: { carta: null, catalogo: null, filtro: "todos" },
    // Sub-vista "Previsualizar": carta elegida + campos guardados (nombre/
    // descripción/precio/imagen) cacheados por agregador de campos (fieldAgg).
    previewCarta: { carta: null },
    previewCampos: {}, // {fieldAgg: {codigo_producto: {campo: valor}}}
    marcas: [],
    selectedMarca: "", // marca elegida en el catálogo por agregador; obligatoria antes de listar productos
    catalogSubview: "productos", // "productos" | "carta"
    carta: {}, // {categoria_id (str): [codigo_producto, ...]} — orden de "Previsualizar carta"
    cartaLoaded: false,
    cartaCampos: {}, // {codigo_producto: {campo: valor}} — campos guardados para el agregador activo
    cartaCamposAgregador: null, // fieldAgg para el que se cargó cartaCampos (se recarga si cambia)
    preguntasComerciales: {},
    preview: {
      producto: null,
      campos: {},      // {AGG: {field: value}} — última versión guardada en el servidor
      draft: {},       // {AGG: {field: value}} — copia editable con cambios sin guardar
      aggregator: "RAPPI",
      modalTab: "general",
      device: "mobile",
      estado: { progreso: null, alertas: [] }, // progreso/alertas del agregador seleccionado en el editor
    },
  };

  const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
  const fmtPrice = (p) => (p === null || p === undefined || p === "" ? "—" : money.format(Number(p)));

  // ------------------------------------------------------------------ //
  // Config (conexión STS)
  // ------------------------------------------------------------------ //
  async function loadConfig() {
    const res = await fetch("/api/config");
    const config = await res.json();
    if (Array.isArray(config.aggregators) && config.aggregators.length) {
      state.aggregators = config.aggregators;
    }
    renderConnStatus(config.token_configured);
    fillConfigForm(config);
    return config;
  }

  function renderConnStatus(tokenConfigured) {
    els.connStatus.classList.remove("hidden");
    if (tokenConfigured) {
      els.connDot.style.background = "#16a34a";
      els.connText.textContent = "Token configurado";
      els.connStatus.className = els.connStatus.className.replace(/border-\S+/, "") + " border-green-200 bg-green-50 text-green-700";
    } else {
      els.connDot.style.background = "#dc2626";
      els.connText.textContent = "Sin token";
      els.connStatus.className = els.connStatus.className.replace(/border-\S+/, "") + " border-red-200 bg-red-50 text-red-700";
    }
  }

  function fillConfigForm(config) {
    for (const [key, value] of Object.entries(config)) {
      const input = els.configForm.elements.namedItem(key);
      if (input && key !== "token") input.value = value ?? "";
    }
    els.configForm.elements.namedItem("token").value = "";
    els.configForm.elements.namedItem("token").placeholder =
      config.token_configured ? `Configurado (…${(config.token || "").slice(-6)}) — pega uno nuevo para reemplazar` : "Pega el token aquí";
  }

  function openConfigModal() {
    els.configOverlay.classList.remove("hidden");
  }
  function closeConfigModal() {
    els.configOverlay.classList.add("hidden");
    els.configFeedback.classList.add("hidden");
  }

  async function submitConfig(e) {
    e.preventDefault();
    const formData = new FormData(els.configForm);
    const payload = Object.fromEntries(formData.entries());
    if (!payload.token) delete payload.token;

    const submitBtn = els.configForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Guardando…";

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const config = await res.json();

      els.configFeedback.classList.remove("hidden");
      if (res.ok) {
        els.configFeedback.className = "text-xs text-green-700";
        els.configFeedback.textContent = "Conexión actualizada. Recargando menú…";
        renderConnStatus(config.token_configured);
        fillConfigForm(config);
        setTimeout(closeConfigModal, 700);
        await fetchMenu(state.activeTab, true);
      } else {
        els.configFeedback.className = "text-xs text-red-700";
        els.configFeedback.textContent = config.error || "No se pudo guardar la configuración.";
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }

  // ------------------------------------------------------------------ //
  // Preguntas comerciales (mapa liviano, usado en todas las vistas)
  // ------------------------------------------------------------------ //
  async function loadPreguntasComerciales() {
    try {
      const res = await fetch("/api/preguntas-comerciales");
      if (res.ok) state.preguntasComerciales = await res.json();
    } catch (_err) {
      // No bloquea el resto de la app si esto falla.
    }
  }

  // Texto de una pregunta para mostrar al usuario: prioriza la pregunta
  // comercial; si todavía no se completó, cae al nombre nativo de Oracle.
  function preguntaDisplayName(code, nombreOracle) {
    const comercial = state.preguntasComerciales[String(code)];
    return (comercial && comercial.trim()) || nombreOracle || "(Sin nombre)";
  }

  // ------------------------------------------------------------------ //
  // Navegación lateral: grupo "Catálogo" (un ítem por agregador)
  // ------------------------------------------------------------------ //
  function renderNavAggregators() {
    els.navAggregators.innerHTML = "";
    state.aggregators.forEach((code) => {
      const meta = AGGREGATOR_META[code] || { label: code, color: "#0f172a" };
      const summary = state.aggregatorSummary[code];
      const completos = summary ? summary.completos.length : 0;
      const total = summary ? summary.count : null;
      const pendientes = total !== null ? Math.max(total - completos, 0) : null;
      const pct = total ? Math.round((completos / total) * 100) : 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-item nav-agg";
      btn.dataset.aggCode = code;
      btn.innerHTML = `
        <div class="nav-agg-row">
          <span class="nav-dot" style="background:${meta.color}"></span>
          <span class="nav-label">${meta.label}</span>
        </div>
        <div class="nav-progress-track"><div class="nav-progress-fill" style="width:${pct}%; background:${meta.color}"></div></div>
      `;
      btn.addEventListener("click", () => openCatalogTab(code));
      els.navAggregators.appendChild(btn);
    });
    markActiveNav();
  }

  function markActiveNav() {
    els.navViewButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.currentView);
    });
    [...els.navAggregators.children].forEach((btn) => {
      btn.classList.toggle("active", state.currentView === "catalog" && btn.dataset.aggCode === state.activeTab);
    });
  }

  async function openCatalogTab(code) {
    state.activeTab = code;
    await switchView("catalog");
    els.search.value = "";
    els.catalogMarcaSelect.value = state.selectedMarca;
    updateCatalogMarcaGate();
    if (state.selectedMarca) {
      await fetchMenu(code, false);
    }
  }

  // ------------------------------------------------------------------ //
  // Selector de marca del catálogo (obligatorio antes de listar productos)
  // ------------------------------------------------------------------ //
  function populateCatalogMarcaOptions() {
    const marcas = [...state.marcas].sort();
    els.catalogMarcaSelect.innerHTML =
      `<option value="">Selecciona una marca…</option>` + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
    els.catalogMarcaSelect.value = marcas.includes(state.selectedMarca) ? state.selectedMarca : "";
  }

  function updateCatalogMarcaGate() {
    const hasMarca = !!state.selectedMarca;
    els.catalogMarcaEmpty.classList.toggle("visible", !hasMarca);
    els.catalogContent.classList.toggle("hidden", !hasMarca);
    els.catalogMarcaHint.textContent = hasMarca
      ? "Catálogo de Oracle Simphony (mismo servicio para todas las marcas en esta POC)."
      : "";
  }

  // ------------------------------------------------------------------ //
  // Sub-vistas del catálogo: Productos del agregador / Previsualizar carta
  // ------------------------------------------------------------------ //
  function switchCatalogSubview(key) {
    state.catalogSubview = key;
    [...els.catalogSubviewTabs.children].forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subview === key);
    });
    els.catalogSubviewProductos.classList.toggle("hidden", key !== "productos");
    els.catalogSubviewCarta.classList.toggle("hidden", key !== "carta");
    if (key === "carta") refreshCartaPreview();
  }

  // Las categorías se necesitan para el tablero de "Previsualizar carta" sin
  // depender de que el usuario haya visitado antes el maestro de Categorías.
  async function ensureCategoriasData() {
    if (state.categorias.length) return;
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      if (res.ok) state.categorias = data.categorias || [];
    } catch (_err) {
      // Si falla, el tablero simplemente no tendrá columnas de categoría.
    }
  }

  // Cache liviana del maestro de cartas, usada tanto por el panel de cartas
  // del editor de producto como por la vista "Cartas por agregador" — evita
  // pedirlo de nuevo si ya se cargó en esta sesión.
  async function ensureCartasMaestroData() {
    if (state.cartasMaestroLoaded) return;
    try {
      const res = await fetch("/api/cartas-maestro");
      const data = await res.json();
      if (res.ok) {
        state.cartasMaestro = data.cartas || [];
        state.cartasMaestroLoaded = true;
      }
    } catch (_err) {
      // Sin cartas cargadas: el panel de cartas del editor simplemente no tendrá opciones.
    }
  }

  async function ensureCartaData() {
    if (state.cartaLoaded) return;
    try {
      const res = await fetch("/api/carta");
      const data = await res.json();
      if (res.ok) {
        state.carta = data.asignaciones || {};
        state.cartaLoaded = true;
      }
    } catch (_err) {
      // Sin asignaciones guardadas: todos los productos aparecen "sin categoría".
    }
  }

  // Campos guardados (nombre/descripción/precio/imagen) de TODOS los productos
  // del agregador activo, en un solo llamado — son los mismos que se ven en
  // Vista previa, así "Previsualizar carta" muestra información real.
  async function ensureCartaCamposData() {
    const fieldAgg = TAB_TO_FIELD_AGG[state.activeTab];
    if (!fieldAgg || state.cartaCamposAgregador === fieldAgg) return;
    try {
      const res = await fetch(`/api/productos/campos?agregador=${fieldAgg}`);
      const data = await res.json();
      if (res.ok) {
        state.cartaCampos = data.campos || {};
        state.cartaCamposAgregador = fieldAgg;
      }
    } catch (_err) {
      // Sin campos guardados: la previsualización cae al nombre/precio de Oracle.
    }
  }

  async function refreshCartaPreview() {
    if (state.catalogSubview !== "carta" || !state.selectedMarca || !state.activeTab) return;
    await Promise.all([ensureCategoriasData(), ensureCartaData(), ensureCartaCamposData()]);
    renderCartaPreview();
  }

  // ------------------------------------------------------------------ //
  // Menú / productos
  // ------------------------------------------------------------------ //
  async function fetchMenu(channel, refresh) {
    showLoading(true);
    hideError();
    els.refreshIcon.classList.toggle("animate-spin", true);
    try {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      if (refresh) params.set("refresh", "1");
      if (state.selectedMarca) params.set("marca", state.selectedMarca);
      const fieldAgg = TAB_TO_FIELD_AGG[channel];

      const [menuRes, estadoRes] = await Promise.all([
        fetch(`/api/menu?${params.toString()}`),
        fieldAgg ? fetch(`/api/productos/estado?agregador=${fieldAgg}`) : Promise.resolve(null),
      ]);
      const data = await menuRes.json();
      if (!menuRes.ok) throw new Error(data.error || "Error consultando el menú.");

      state.products = data.products || [];
      state.fetchedAt = data.fetched_at;
      if (Array.isArray(data.aggregators) && data.aggregators.length) {
        state.aggregators = data.aggregators;
      }

      state.completedCodes = new Set();
      state.estadoCodes = {};
      if (estadoRes && estadoRes.ok) {
        const estadoData = await estadoRes.json();
        (estadoData.completos || []).forEach((c) => state.completedCodes.add(String(c)));
        state.estadoCodes = estadoData.estados || {};
      }
      state.statusFilter = "pendientes";

      renderStatusTabs();
      renderResults();
      renderLastUpdated();
      if (state.currentView === "catalog") updateTopbar();
      await refreshCartaPreview();

      if (refresh) await loadAggregatorSummary();
    } catch (err) {
      showError(err.message);
      state.products = [];
      state.completedCodes = new Set();
      state.estadoCodes = {};
      renderStatusTabs();
      renderResults();
    } finally {
      showLoading(false);
      els.refreshIcon.classList.toggle("animate-spin", false);
    }
  }

  function renderLastUpdated() {
    if (!state.fetchedAt) {
      els.lastUpdated.textContent = "";
      return;
    }
    const d = new Date(state.fetchedAt * 1000);
    els.lastUpdated.textContent = `Actualizado ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
  }

  // ------------------------------------------------------------------ //
  // Resumen: KPIs por agregador + cola de pendientes cruzando los 4
  // ------------------------------------------------------------------ //
  async function loadAggregatorSummary() {
    try {
      const results = await Promise.all(
        state.aggregators.map(async (code) => {
          const fieldAgg = TAB_TO_FIELD_AGG[code] || code;
          const [menuRes, estadoRes] = await Promise.all([
            fetch(`/api/menu?channel=${code}`),
            fetch(`/api/productos/estado?agregador=${fieldAgg}`),
          ]);
          const menuData = await menuRes.json().catch(() => ({}));
          const estadoData = await estadoRes.json().catch(() => ({}));
          const products = menuData.products || [];
          return {
            code,
            products,
            count: products.length,
            completos: estadoData.completos || [],
          };
        })
      );
      state.aggregatorSummary = {};
      results.forEach((r) => { state.aggregatorSummary[r.code] = r; });
      state.summaryLoaded = true;
      renderNavAggregators();
      if (state.currentView === "resumen") {
        renderResumen();
        updateTopbar();
      }
    } catch (_err) {
      // El resumen es informativo: si falla, no bloquea el resto de la app.
    }
  }

  function renderKpiGrid() {
    els.resumenKpiGrid.innerHTML = "";
    state.aggregators.forEach((code) => {
      const meta = AGGREGATOR_META[code] || { label: code, color: "#0f172a" };
      const summary = state.aggregatorSummary[code];
      const completos = summary ? summary.completos.length : 0;
      const total = summary ? summary.count : null;
      const pendientes = total !== null ? Math.max(total - completos, 0) : null;
      const pct = total ? Math.round((completos / total) * 100) : 0;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "kpi-card";

      const statusHtml = !summary
        ? '<span class="kpi-status"><span class="text-slate-400">Cargando…</span></span>'
        : pendientes > 0
          ? `<span class="kpi-status warn">${pendientes} pendiente${pendientes === 1 ? "" : "s"} de completar</span>`
          : '<span class="kpi-status good">Todo completo</span>';

      card.innerHTML = `
        <div class="kpi-top">
          <span class="kpi-agg"><span class="kpi-dot" style="background:${meta.color}"></span>${meta.label}</span>
          <span class="kpi-go">›</span>
        </div>
        <div>
          <div class="kpi-number">${total ?? "—"}</div>
          <div class="kpi-number-label">productos publicados</div>
        </div>
        ${statusHtml}
        <div class="kpi-progress-track"><div class="kpi-progress-fill" style="width:${pct}%; background:${meta.color}"></div></div>
      `;
      card.addEventListener("click", () => openCatalogTab(code));
      els.resumenKpiGrid.appendChild(card);
    });
  }

  // Cruza los 4 agregadores y arma la lista de productos pendientes de
  // completar, agrupando por código para no repetir el mismo producto.
  function buildPendingQueue(limit) {
    const map = new Map();
    let total = 0;
    state.aggregators.forEach((code) => {
      const summary = state.aggregatorSummary[code];
      if (!summary) return;
      const completos = new Set(summary.completos.map(String));
      summary.products.forEach((p) => {
        if (completos.has(String(p.code))) return;
        total++;
        const key = String(p.code);
        if (!map.has(key)) map.set(key, { product: p, aggs: [] });
        map.get(key).aggs.push(code);
      });
    });
    const items = [...map.values()].sort((a, b) =>
      b.aggs.length - a.aggs.length || (a.product.name || "").localeCompare(b.product.name || "")
    );
    return { items: items.slice(0, limit), total };
  }

  function buildQueueRow(item) {
    const node = els.tplQueueRow.content.cloneNode(true);
    node.querySelector(".q-name").textContent = item.product.name || "(Sin nombre)";
    node.querySelector(".q-code").textContent = item.product.code;
    node.querySelector(".q-price").textContent = fmtPrice(item.product.price);

    const chips = node.querySelector(".q-chips");
    item.aggs.forEach((code) => {
      const meta = AGGREGATOR_META[code] || { label: code, color: "#0f172a" };
      const chip = document.createElement("span");
      chip.className = "agg-chip";
      chip.innerHTML = `<span class="d" style="background:${meta.color}"></span>${meta.label}`;
      chips.appendChild(chip);
    });

    node.querySelector(".q-action").addEventListener("click", () => openPreview(item.product));
    node.querySelector(".q-action-v2").addEventListener("click", () => openPreviewV2(item.product));
    return node;
  }

  function renderResumen() {
    renderKpiGrid();
    const { items, total } = buildPendingQueue(8);

    if (!items.length) {
      els.queueNote.textContent = "";
      els.queueWrap.classList.add("hidden");
      els.queueEmpty.classList.remove("hidden");
      els.queueEmpty.textContent = state.summaryLoaded
        ? "Todos los productos ya tienen información completa."
        : "Cargando estado del catálogo…";
      return;
    }

    els.queueEmpty.classList.add("hidden");
    els.queueWrap.classList.remove("hidden");
    els.queueNote.textContent = `${total} pendientes en total, por agregador`;
    els.queueTbody.innerHTML = "";
    items.forEach((item) => els.queueTbody.appendChild(buildQueueRow(item)));
  }

  // ------------------------------------------------------------------ //
  // Previsualizar carta: simula el menú del cliente (nav de categorías a
  // la izquierda + secciones reales a la derecha, con arrastre para
  // ordenar y reasignar productos)
  // ------------------------------------------------------------------ //
  function cartaCategoriasActuales() {
    return state.categorias.filter(
      (c) => c.marca === state.selectedMarca && c.agregador === state.activeTab && c.activo
    );
  }

  // Maestro de categorías disponible para un campo tipo "categoria" del editor
  // de producto: mismas categorías que se administran en Categorías, filtradas
  // por la marca del catálogo actual y el agregador (canónico) del campo.
  function categoriasParaCombo(agg) {
    const canonical = FIELD_AGG_TO_CANONICAL[agg];
    return state.categorias.filter(
      (c) => c.marca === state.selectedMarca && c.agregador === canonical && c.activo
    );
  }

  function productByCode(code) {
    return state.products.find((p) => String(p.code) === String(code));
  }

  // Mismos campos que se editan en Vista previa: si ya se guardó nombre
  // comercial / descripción / precio / imagen para este agregador, la
  // previsualización los usa; si no, cae a lo que trae Oracle Simphony.
  function cartaFieldValue(code, key) {
    const campos = state.cartaCampos[String(code)] || {};
    const valor = campos[key];
    return valor === undefined || valor === null ? "" : valor;
  }

  function cartaResolvedInfo(product) {
    const code = String(product.code);
    const nombre = cartaFieldValue(code, "ProductoPadre") || product.name || "(Sin nombre)";
    const descripcion = state.activeTab === "LLAMAFOOD"
      ? (cartaFieldValue(code, "DescripcionProductoPadreLlamaFood") || cartaFieldValue(code, "DescripcionProductoPadre"))
      : cartaFieldValue(code, "DescripcionProductoPadre");
    const precioGuardado = cartaFieldValue(code, "PrecioPadre");
    const precio = precioGuardado !== "" ? precioGuardado : product.price;
    const imagen = cartaFieldValue(code, "Imagen");
    return { nombre, descripcion: descripcion || "Sin descripción todavía.", precio, imagen };
  }

  let cartaScrollObserver = null;

  function renderCartaPreview() {
    if (!els.cartaPreview) return;
    const categorias = cartaCategoriasActuales();
    const aggLabel = (AGGREGATOR_META[state.activeTab] || {}).label || state.activeTab;
    els.cartaSinCategoriasAgg.textContent = aggLabel;
    els.cartaSinCategorias.classList.toggle("hidden", categorias.length > 0);
    els.cartaPreview.classList.toggle("hidden", categorias.length === 0);
    if (!categorias.length) {
      els.cartaSections.innerHTML = "";
      els.cartaNavList.innerHTML = "";
      return;
    }

    const asignados = new Set();
    categorias.forEach((cat) => {
      (state.carta[String(cat.id)] || []).forEach((code) => asignados.add(String(code)));
    });
    const sinCategoria = state.products.filter((p) => !asignados.has(String(p.code)));

    els.cartaPreviewBadge.textContent = (state.selectedMarca || "?").trim().charAt(0).toUpperCase() || "?";
    els.cartaPreviewMarca.textContent = state.selectedMarca;
    els.cartaPreviewAgg.textContent = aggLabel;

    els.cartaSections.innerHTML = "";
    els.cartaNavList.innerHTML = "";

    els.cartaSections.appendChild(
      buildCartaSection("sin-categoria", "Sin categoría", sinCategoria.map((p) => String(p.code)), true)
    );
    els.cartaNavList.appendChild(buildCartaNavItem("sin-categoria", "Sin categoría", sinCategoria.length, true));

    let totalEnCarta = 0;
    categorias.forEach((cat) => {
      const codigos = (state.carta[String(cat.id)] || []).filter((code) =>
        state.products.some((p) => String(p.code) === code)
      );
      totalEnCarta += codigos.length;
      els.cartaSections.appendChild(buildCartaSection(String(cat.id), cat.nombre, codigos, false));
      els.cartaNavList.appendChild(buildCartaNavItem(String(cat.id), cat.nombre, codigos.length, false));
    });

    els.cartaStatCategorias.textContent = categorias.length;
    els.cartaStatProductos.textContent = totalEnCarta;
    els.cartaStatPendientes.textContent = sinCategoria.length;

    setupCartaScrollspy();
  }

  function buildCartaSection(containerKey, titulo, codigos, esSinCategoria) {
    const section = document.createElement("section");
    section.className = "carta-section" + (esSinCategoria ? " carta-section-unassigned" : "");
    section.id = `carta-section-${containerKey}`;
    section.dataset.cartaSection = containerKey;

    const header = document.createElement("div");
    header.className = "carta-section-header";
    header.innerHTML = `<h4>${titulo.replace(/</g, "&lt;")}</h4><span class="carta-section-count">${codigos.length}</span>`;
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "carta-section-body";
    body.dataset.cartaContainer = containerKey;
    makeContainerDroppable(body);

    codigos.forEach((code) => {
      const producto = productByCode(code);
      if (producto) body.appendChild(buildCartaRow(producto));
    });
    if (!codigos.length) {
      body.appendChild(buildCartaEmptyState(esSinCategoria));
    }
    updateCartaOrderButtons(body);

    section.appendChild(body);
    return section;
  }

  function buildCartaEmptyState(esSinCategoria) {
    const empty = document.createElement("div");
    empty.className = "carta-section-empty";
    empty.textContent = esSinCategoria
      ? "Todos los productos ya están ubicados en alguna categoría."
      : "Arrastra productos aquí";
    return empty;
  }

  function buildCartaNavItem(containerKey, titulo, count, esSinCategoria) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "carta-nav-item" + (esSinCategoria ? " carta-nav-unassigned" : "");
    btn.dataset.cartaNavTarget = containerKey;
    btn.innerHTML = `<span>${titulo.replace(/</g, "&lt;")}</span><span class="carta-nav-count">${count}</span>`;
    btn.addEventListener("click", () => {
      document.getElementById(`carta-section-${containerKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return btn;
  }

  function buildCartaRow(product) {
    const row = document.createElement("div");
    row.className = "carta-row";
    row.draggable = true;
    row.dataset.code = String(product.code);

    const estadoCls = (PROGRESO_META[estadoDe(product.code).progreso] || PROGRESO_META.PENDIENTE_DATOS).cls;
    const info = cartaResolvedInfo(product);
    const thumbInner = info.imagen
      ? `<img src="${String(info.imagen).replace(/"/g, "&quot;")}" alt="" onerror="this.style.display='none'" />`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    row.innerHTML = `
      <span class="carta-row-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg></span>
      <div class="carta-row-order">
        <button type="button" class="carta-row-up" title="Subir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 15 7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="carta-row-down" title="Bajar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 9 7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="carta-row-info">
        <p class="carta-row-name">${String(info.nombre).replace(/</g, "&lt;")}</p>
        <p class="carta-row-desc">${String(info.descripcion).replace(/</g, "&lt;")}</p>
        <div class="carta-row-meta">
          <span class="carta-row-dot ${estadoCls}"></span>
          <span>${fmtPrice(info.precio)}</span>
          <span class="carta-row-code">· ${product.code}</span>
        </div>
      </div>
      <div class="carta-row-thumb">${thumbInner}</div>
      <button type="button" class="carta-row-remove" title="Quitar de la categoría">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    `;

    row.addEventListener("dragstart", (e) => {
      cartaDragState = { code: row.dataset.code, fromContainer: cartaContainerKeyOf(row) };
      row.classList.add("carta-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.code);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("carta-dragging");
      cartaFinalizeDrag(row);
    });

    row.querySelector(".carta-row-up").addEventListener("click", () => moveCartaRow(row, "up"));
    row.querySelector(".carta-row-down").addEventListener("click", () => moveCartaRow(row, "down"));

    row.querySelector(".carta-row-remove").addEventListener("click", () => {
      const fromContainer = cartaContainerKeyOf(row);
      if (fromContainer === "sin-categoria") return;
      const target = els.cartaSections.querySelector('[data-carta-container="sin-categoria"]');
      if (target) {
        target.querySelector(".carta-section-empty")?.remove();
        target.appendChild(row);
        persistCategoriaOrderFromDom(fromContainer);
        updateCartaSectionCount(target);
        updateCartaSectionCount(els.cartaSections.querySelector(`[data-carta-container="${fromContainer}"]`));
      }
    });

    return row;
  }

  // Alternativa al arrastre: mueve una tarjeta un puesto arriba/abajo dentro
  // de su misma sección (útil cuando el cursor no es preciso o cómodo).
  function moveCartaRow(row, direction) {
    const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling || !sibling.classList.contains("carta-row")) return;
    const container = row.parentElement;
    if (direction === "up") {
      container.insertBefore(row, sibling);
    } else {
      container.insertBefore(sibling, row);
    }
    updateCartaOrderButtons(container);
    const key = cartaContainerKeyOf(row);
    if (key && key !== "sin-categoria") persistCategoriaOrderFromDom(key);
  }

  function updateCartaOrderButtons(container) {
    if (!container) return;
    const rows = [...container.querySelectorAll(".carta-row")];
    rows.forEach((row, idx) => {
      const upBtn = row.querySelector(".carta-row-up");
      const downBtn = row.querySelector(".carta-row-down");
      if (upBtn) upBtn.disabled = idx === 0;
      if (downBtn) downBtn.disabled = idx === rows.length - 1;
    });
  }

  // ---- Scrollspy: resalta en el nav la sección visible al hacer scroll ---- //
  function setupCartaScrollspy() {
    if (cartaScrollObserver) cartaScrollObserver.disconnect();
    const sections = [...els.cartaSections.querySelectorAll(".carta-section")];
    if (!sections.length || !els.cartaPreviewScroll) return;
    cartaScrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const key = entry.target.dataset.cartaSection;
          [...els.cartaNavList.children].forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.cartaNavTarget === key);
          });
        });
      },
      { root: els.cartaPreviewScroll, rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => cartaScrollObserver.observe(s));
    els.cartaNavList.children[0]?.classList.add("active");
  }

  // ---- Drag & drop (reordenar dentro de una sección y mover entre secciones) ---- //
  //
  // Rendimiento: en vez de medir TODAS las tarjetas de la sección en cada
  // "dragover" (lento con listas largas como "Sin categoría"), se usa
  // elementFromPoint para saber al instante sobre qué tarjeta está el
  // cursor, y el reacomodo del DOM se agrupa con requestAnimationFrame para
  // no repetirlo más veces de las que el navegador puede pintar.
  let cartaDragState = null;
  let cartaDragRafId = null;
  let cartaDragPending = null;

  function cartaContainerKeyOf(el) {
    const container = el.closest("[data-carta-container]");
    return container ? container.dataset.cartaContainer : null;
  }

  function cartaRowAtPoint(container, x, y) {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest(".carta-row");
    if (!row || row.classList.contains("carta-dragging") || !container.contains(row)) return null;
    return row;
  }

  function applyCartaReorder(container, x, y) {
    const dragging = document.querySelector(".carta-dragging");
    if (!dragging) return;
    container.querySelector(".carta-section-empty")?.remove();
    const overRow = cartaRowAtPoint(container, x, y);
    if (!overRow) {
      container.appendChild(dragging);
    } else {
      const box = overRow.getBoundingClientRect();
      const before = y - box.top < box.height / 2;
      container.insertBefore(dragging, before ? overRow : overRow.nextSibling);
    }
    updateCartaOrderButtons(container);
  }

  function scheduleCartaReorder(container, x, y) {
    cartaDragPending = { container, x, y };
    if (cartaDragRafId) return;
    cartaDragRafId = requestAnimationFrame(() => {
      cartaDragRafId = null;
      const pending = cartaDragPending;
      cartaDragPending = null;
      if (pending) applyCartaReorder(pending.container, pending.x, pending.y);
    });
  }

  function makeContainerDroppable(container) {
    container.addEventListener("dragover", (e) => {
      if (!cartaDragState) return;
      e.preventDefault();
      container.classList.add("carta-dragover");
      scheduleCartaReorder(container, e.clientX, e.clientY);
    });
    container.addEventListener("dragleave", (e) => {
      if (!container.contains(e.relatedTarget)) container.classList.remove("carta-dragover");
    });
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      container.classList.remove("carta-dragover");
    });
  }

  function updateCartaSectionCount(container) {
    if (!container) return;
    const count = container.querySelectorAll(".carta-row").length;
    const key = container.dataset.cartaContainer;
    const headerBadge = container.closest(".carta-section")?.querySelector(".carta-section-count");
    if (headerBadge) headerBadge.textContent = count;
    const navBadge = els.cartaNavList.querySelector(`[data-carta-nav-target="${key}"] .carta-nav-count`);
    if (navBadge) navBadge.textContent = count;
    if (!count && !container.querySelector(".carta-section-empty")) {
      container.appendChild(buildCartaEmptyState(key === "sin-categoria"));
    }
    updateCartaOrderButtons(container);
    syncCartaStats();
  }

  function syncCartaStats() {
    if (!els.cartaSections) return;
    const sinCatContainer = els.cartaSections.querySelector('[data-carta-container="sin-categoria"]');
    els.cartaStatPendientes.textContent = sinCatContainer ? sinCatContainer.querySelectorAll(".carta-row").length : 0;
    const categoriaBodies = [...els.cartaSections.querySelectorAll(".carta-section-body")].filter(
      (b) => b.dataset.cartaContainer !== "sin-categoria"
    );
    const total = categoriaBodies.reduce((acc, b) => acc + b.querySelectorAll(".carta-row").length, 0);
    els.cartaStatProductos.textContent = total;
  }

  async function cartaFinalizeDrag(row) {
    if (cartaDragRafId) {
      cancelAnimationFrame(cartaDragRafId);
      cartaDragRafId = null;
      cartaDragPending = null;
    }
    if (!cartaDragState) return;
    const toContainer = cartaContainerKeyOf(row);
    const { fromContainer } = cartaDragState;
    cartaDragState = null;
    document.querySelectorAll(".carta-dragover").forEach((el) => el.classList.remove("carta-dragover"));

    const affected = new Set([fromContainer, toContainer].filter((k) => k && k !== "sin-categoria"));
    affected.forEach((catId) => {
      updateCartaSectionCount(els.cartaSections.querySelector(`[data-carta-container="${catId}"]`));
    });
    updateCartaSectionCount(els.cartaSections.querySelector('[data-carta-container="sin-categoria"]'));

    for (const catId of affected) {
      await persistCategoriaOrderFromDom(catId);
    }
  }

  async function persistCategoriaOrderFromDom(categoriaId) {
    const container = els.cartaSections.querySelector(`[data-carta-container="${categoriaId}"]`);
    if (!container) return;
    const codigos = [...container.querySelectorAll(".carta-row")].map((el) => el.dataset.code);
    state.carta[categoriaId] = codigos;
    try {
      await fetch(`/api/carta/categorias/${categoriaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos }),
      });
    } catch (_err) {
      // La tarjeta ya se movió visualmente; si falla el guardado, un nuevo
      // arrastre (o recargar la vista) vuelve a intentarlo.
    }

    // Posición producto (ProdPos) = orden dentro de esta categoría en
    // Previsualizar carta, guardado para el agregador de la pestaña activa.
    // Se guarda un código a la vez (no Promise.all): el store persiste todo
    // el JSON en cada escritura, así que POSTs paralelos pueden pisarse
    // entre sí y perder una actualización.
    const fieldAgg = TAB_TO_FIELD_AGG[state.activeTab];
    if (!fieldAgg) return;
    for (let idx = 0; idx < codigos.length; idx++) {
      try {
        await fetch(`/api/productos/${encodeURIComponent(codigos[idx])}/campos?agregador=${fieldAgg}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ProdPos: idx + 1 }),
        });
      } catch (_err) {
        // best-effort, ver comentario arriba sobre el guardado de codigos
      }
    }
  }

  // ------------------------------------------------------------------ //
  // Sub-tabs de estado: Completos / Pendientes / Todos (por agregador)
  // ------------------------------------------------------------------ //
  function renderStatusTabs() {
    const total = state.products.length;
    const completosCount = state.products.filter((p) => state.completedCodes.has(String(p.code))).length;
    const pendientesCount = total - completosCount;

    const tabs = [
      { key: "pendientes", label: "Pendientes", count: pendientesCount },
      { key: "completos", label: "Completos", count: completosCount },
      { key: "todos", label: "Todos", count: total },
    ];

    els.statusTabs.innerHTML = "";
    tabs.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = state.statusFilter === t.key ? "active" : "";
      btn.innerHTML = `${t.label} <span class="count">${t.count}</span>`;
      btn.addEventListener("click", () => {
        if (state.statusFilter === t.key) return;
        state.statusFilter = t.key;
        renderStatusTabs();
        renderResults();
      });
      els.statusTabs.appendChild(btn);
    });
  }

  function currentFiltered() {
    const term = els.search.value.trim().toLowerCase();
    let items = state.products;
    if (term) {
      items = items.filter((p) => p.name.toLowerCase().includes(term) || String(p.code).toLowerCase().includes(term));
    }
    if (state.statusFilter === "completos") {
      items = items.filter((p) => state.completedCodes.has(String(p.code)));
    } else if (state.statusFilter === "pendientes") {
      items = items.filter((p) => !state.completedCodes.has(String(p.code)));
    }
    return items;
  }

  function renderResults() {
    const items = currentFiltered();
    els.resultCount.textContent = `${items.length} producto${items.length === 1 ? "" : "s"}`;
    els.grid.innerHTML = "";

    if (!items.length) {
      els.empty.classList.remove("hidden");
      return;
    }
    els.empty.classList.add("hidden");

    const frag = document.createDocumentFragment();
    items.forEach((p) => frag.appendChild(buildCard(p)));
    els.grid.appendChild(frag);
  }

  function buildCard(product) {
    const node = els.tplCard.content.cloneNode(true);
    const article = node.querySelector(".product-card");
    const badge = node.querySelector(".type-badge");
    const estadoBadge = node.querySelector(".estado-badge");
    const estadoAlertaDot = node.querySelector(".estado-alerta-dot");
    const name = node.querySelector(".product-name");
    const price = node.querySelector(".product-price");
    const toggleBtn = node.querySelector(".toggle-details");
    const toggleLabel = node.querySelector(".toggle-label");
    const chevron = node.querySelector(".chevron");
    const details = node.querySelector(".details");
    const previewBtn = node.querySelector(".btn-preview");
    const previewBtnV2 = node.querySelector(".btn-preview-v2");

    badge.textContent = product.type;
    badge.classList.add(product.type === "COMBO" ? "combo" : "producto");
    name.textContent = product.name || "(Sin nombre)";
    price.textContent = fmtPrice(product.price);

    const estado = estadoDe(product.code);
    const progresoMeta = PROGRESO_META[estado.progreso] || PROGRESO_META.PENDIENTE_DATOS;
    estadoBadge.textContent = progresoMeta.label;
    estadoBadge.classList.add(progresoMeta.cls);
    if (estado.alertas.length) {
      estadoAlertaDot.classList.remove("hidden");
      estadoAlertaDot.title = estado.alertas.map((a) => (ALERTA_META[a] || {}).label || a).join(" · ");
    }

    previewBtn.addEventListener("click", () => openPreview(product));
    previewBtnV2.addEventListener("click", () => openPreviewV2(product));

    const hasDetails = (product.groups && product.groups.length) || (product.condiments && product.condiments.length);
    if (hasDetails) {
      toggleBtn.classList.remove("hidden");
      const count = product.type === "COMBO"
        ? product.groups.reduce((acc, g) => acc + g.items.length, 0)
        : product.condiments.length;
      toggleLabel.textContent = product.type === "COMBO" ? `Ver ${count} opciones` : `Ver ${count} extras`;

      toggleBtn.addEventListener("click", () => {
        const isOpen = !details.classList.contains("hidden");
        details.classList.toggle("hidden");
        chevron.classList.toggle("open", !isOpen);
        if (!isOpen && !details.dataset.rendered) {
          details.appendChild(buildDetails(product));
          details.dataset.rendered = "1";
        }
      });
    }

    return article;
  }

  function buildDetails(product) {
    const wrap = document.createElement("div");

    if (product.type === "COMBO") {
      product.groups.forEach((group) => {
        const block = document.createElement("div");
        block.className = "group-block";
        const title = document.createElement("p");
        title.className = "font-semibold text-slate-600";
        title.textContent = (group.principal ? "★ " : "") + preguntaDisplayName(group.code, group.name);
        block.appendChild(title);

        group.items.forEach((item) => {
          const row = document.createElement("div");
          row.className = "flex justify-between text-slate-500 pl-2";
          row.innerHTML = `<span>${item.name}</span><span>${fmtPrice(item.price)}</span>`;
          block.appendChild(row);
        });
        wrap.appendChild(block);
      });
    } else {
      product.condiments.forEach((c) => {
        const row = document.createElement("div");
        row.className = "flex justify-between text-slate-500";
        row.innerHTML = `<span>${c.name} <span class="text-slate-400">(${c.subgroup_name || ""})</span></span><span>${fmtPrice(c.price)}</span>`;
        wrap.appendChild(row);
      });
    }
    return wrap;
  }

  function showLoading(flag) {
    els.loading.classList.toggle("hidden", !flag);
    if (flag) {
      els.grid.innerHTML = "";
      els.empty.classList.add("hidden");
    }
  }

  function showError(message) {
    els.bannerError.textContent = message;
    els.bannerError.classList.remove("hidden");
  }
  function hideError() {
    els.bannerError.classList.add("hidden");
  }

  // ------------------------------------------------------------------ //
  // Navegación entre vistas
  // ------------------------------------------------------------------ //
  async function switchView(view) {
    state.currentView = view;
    markActiveNav();

    els.viewResumen.classList.toggle("hidden", view !== "resumen");
    els.viewCatalog.classList.toggle("hidden", view !== "catalog");
    els.viewPreguntas.classList.toggle("hidden", view !== "preguntas");
    els.viewCategorias.classList.toggle("hidden", view !== "categorias");
    els.viewCartas.classList.toggle("hidden", view !== "cartas");

    updateTopbar();

    if (view === "resumen" && !state.summaryLoaded) {
      await loadAggregatorSummary();
    } else if (view === "resumen") {
      renderResumen();
    }
    if (view === "preguntas") {
      populatePreguntasMarcaOptions();
      updatePreguntasMarcaGate();
      if (state.preguntasMarca && !state.preguntasLoaded) {
        await loadPreguntas();
      }
    }
    if (view === "categorias" && !state.categoriasLoaded) {
      await loadCategorias();
    }
    if (view === "cartas") {
      populateCartasMarcaOptions();
      updateCartasMarcaGate();
      if (!state.cartasMaestroLoaded) {
        await loadCartasMaestro();
      } else {
        // state.cartasMaestro puede haberse actualizado desde el panel de
        // cartas del editor de producto mientras se estaba en otra vista.
        renderCartasMaestro();
      }
      await ensureCategoriasData();
      populateCartaSelect(els.asociarCartaSelect);
      populateCartaSelect(els.preview2CartaSelect);
    }
  }

  function updateTopbar() {
    const view = state.currentView;
    if (view === "resumen") {
      const totalPendientes = Object.values(state.aggregatorSummary).reduce(
        (acc, s) => acc + Math.max((s.count || 0) - (s.completos ? s.completos.length : 0), 0), 0
      );
      els.topbarEyebrow.textContent = "Panel";
      els.topbarTitle.textContent = "Resumen";
      els.topbarSub.textContent = state.summaryLoaded
        ? `${totalPendientes} pendientes en total, en los ${state.aggregators.length} agregadores`
        : "Cargando estado del catálogo…";
    } else if (view === "catalog") {
      const meta = AGGREGATOR_META[state.activeTab] || { label: state.activeTab || "", color: "#0f172a" };
      const total = state.products.length;
      const completos = state.products.filter((p) => state.completedCodes.has(String(p.code))).length;
      els.topbarEyebrow.textContent = "Catálogo";
      els.topbarTitle.innerHTML = `<span class="topbar-dot" style="background:${meta.color}"></span>${meta.label}`;
      els.topbarSub.textContent = !state.selectedMarca
        ? "Elige una marca para ver su catálogo."
        : total
          ? `${total} productos publicados · ${total - completos} pendientes de completar`
          : "Cargando menú desde STS…";
    } else if (view === "preguntas") {
      els.topbarEyebrow.textContent = "Maestros";
      els.topbarTitle.textContent = "Preguntas comerciales";
      els.topbarSub.textContent = state.preguntasMarca
        ? "Nombre en Oracle Simphony y su equivalente comercial."
        : "Elige una marca para ver sus preguntas.";
    } else if (view === "categorias") {
      els.topbarEyebrow.textContent = "Maestros";
      els.topbarTitle.textContent = "Categorías";
      els.topbarSub.textContent = "Por marca y agregador.";
    } else if (view === "cartas") {
      els.topbarEyebrow.textContent = "Maestros";
      els.topbarTitle.textContent = "Cartas por agregador";
      els.topbarSub.textContent = state.cartasMarca
        ? "Agrupa productos del catálogo por carta y marca cuáles se pueden integrar."
        : "Elige una marca para ver sus cartas.";
    }
  }

  // ------------------------------------------------------------------ //
  // Maestro de preguntas
  // ------------------------------------------------------------------ //
  // Selector de marca: mismo patrón que Catálogo (obligatorio antes de listar).
  // En esta POC todas las marcas comparten el mismo servicio de Oracle
  // Simphony, así que "marca" solo se envía y refleja en la respuesta (ver
  // backend/app.py get_preguntas); cuando cada marca tenga su propio
  // servicio, este es el punto donde el filtro empieza a traer datos reales.
  function populatePreguntasMarcaOptions() {
    const marcas = [...state.marcas].sort();
    els.preguntasMarcaSelect.innerHTML =
      `<option value="">Selecciona una marca…</option>` + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
    els.preguntasMarcaSelect.value = marcas.includes(state.preguntasMarca) ? state.preguntasMarca : "";
  }

  function updatePreguntasMarcaGate() {
    const hasMarca = !!state.preguntasMarca;
    els.preguntasMarcaEmpty.classList.toggle("visible", !hasMarca);
    els.preguntasContent.classList.toggle("hidden", !hasMarca);
    els.preguntasMarcaHint.textContent = hasMarca
      ? "Catálogo de Oracle Simphony (mismo servicio para todas las marcas en esta POC)."
      : "";
  }

  async function loadPreguntas() {
    els.preguntasLoading.classList.remove("hidden");
    els.preguntasError.classList.add("hidden");
    els.preguntasEmpty.classList.add("hidden");
    try {
      const res = await fetch(`/api/preguntas?marca=${encodeURIComponent(state.preguntasMarca)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error consultando preguntas.");
      state.preguntas = data.preguntas || [];
      state.preguntasLoaded = true;
      renderPreguntas();
    } catch (err) {
      els.preguntasError.textContent = err.message;
      els.preguntasError.classList.remove("hidden");
    } finally {
      els.preguntasLoading.classList.add("hidden");
    }
  }

  function renderPreguntas() {
    const term = els.preguntasSearch.value.trim().toLowerCase();
    const items = term
      ? state.preguntas.filter((p) => p.name.toLowerCase().includes(term) || p.code.includes(term))
      : state.preguntas;

    els.preguntasCount.textContent = `${items.length} pregunta${items.length === 1 ? "" : "s"}`;
    els.preguntasTbody.innerHTML = "";
    els.preguntasEmpty.classList.toggle("hidden", items.length > 0);

    const frag = document.createDocumentFragment();
    items.forEach((p) => frag.appendChild(buildPreguntaRow(p)));
    els.preguntasTbody.appendChild(frag);
  }

  function buildPreguntaRow(pregunta) {
    const node = els.tplPreguntaRow.content.cloneNode(true);
    const code = node.querySelector(".pregunta-code");
    const oracle = node.querySelector(".pregunta-oracle");
    const input = node.querySelector(".pregunta-comercial-input");
    const cantidadInput = node.querySelector(".pregunta-cantidad-input");
    const actions = node.querySelector(".pregunta-actions");
    const btnGuardar = node.querySelector(".btn-guardar-pregunta");
    const btnCancelar = node.querySelector(".btn-cancelar-pregunta");
    const cantidadHint = node.querySelector(".pregunta-cantidad-hint");
    const msg = node.querySelector(".pregunta-msg");

    code.textContent = pregunta.code;
    oracle.textContent = pregunta.name || "(Sin nombre)";
    input.value = pregunta.pregunta_comercial || "";
    cantidadInput.value = pregunta.cantidad_maxima || "";

    let lastSaved = input.value;
    let lastSavedCantidad = cantidadInput.value;
    let saving = false;

    const cantidadValida = () => Number(cantidadInput.value) > 0;

    const setDirty = (dirty) => {
      actions.classList.toggle("hidden", !dirty);
      if (dirty) {
        btnGuardar.disabled = !cantidadValida();
        cantidadHint.classList.toggle("hidden", cantidadValida());
      }
    };

    const showMsg = (text, ok) => {
      msg.className = `pregunta-msg text-xs font-medium ${ok ? "text-green-600" : "text-red-600"}`;
      msg.textContent = text;
      msg.classList.remove("hidden");
      if (ok) setTimeout(() => msg.classList.add("hidden"), 2000);
    };

    const isDirty = () => input.value !== lastSaved || cantidadInput.value !== lastSavedCantidad;

    const doSave = async () => {
      if (saving || !isDirty() || !cantidadValida()) return;
      saving = true;
      btnGuardar.disabled = true;
      btnGuardar.textContent = "Guardando…";
      msg.classList.add("hidden");
      try {
        const res = await fetch(`/api/preguntas/${encodeURIComponent(pregunta.code)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta_comercial: input.value, cantidad_maxima: Number(cantidadInput.value) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo guardar la pregunta comercial.");

        lastSaved = input.value;
        lastSavedCantidad = cantidadInput.value;
        const trimmed = lastSaved.trim();
        if (trimmed) {
          state.preguntasComerciales[String(pregunta.code)] = trimmed;
        } else {
          delete state.preguntasComerciales[String(pregunta.code)];
        }
        setDirty(false);
        showMsg("Guardado exitosamente", true);
      } catch (err) {
        showMsg(err.message, false);
      } finally {
        saving = false;
        btnGuardar.disabled = !cantidadValida();
        btnGuardar.textContent = "Guardar";
      }
    };

    const doCancel = () => {
      input.value = lastSaved;
      cantidadInput.value = lastSavedCantidad;
      setDirty(false);
      msg.classList.add("hidden");
    };

    input.addEventListener("input", () => setDirty(isDirty()));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doSave(); }
      if (e.key === "Escape") { e.preventDefault(); doCancel(); }
    });
    cantidadInput.addEventListener("input", () => setDirty(isDirty()));
    cantidadInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doSave(); }
      if (e.key === "Escape") { e.preventDefault(); doCancel(); }
    });
    btnGuardar.addEventListener("click", doSave);
    btnCancelar.addEventListener("click", doCancel);

    return node.querySelector("tr");
  }

  // ------------------------------------------------------------------ //
  // Maestro de categorías / subcategorías
  // ------------------------------------------------------------------ //
  function populateAgregadorSelects() {
    const optionsHtml = state.aggregators
      .map((code) => `<option value="${code}">${(AGGREGATOR_META[code] || { label: code }).label}</option>`)
      .join("");
    els.formCategoria.elements.namedItem("agregador").innerHTML = optionsHtml;
    els.filtroAgregador.innerHTML =
      `<option value="">Todos los agregadores</option>` + optionsHtml;
    els.formCarta.elements.namedItem("agregador").innerHTML = optionsHtml;
    els.filtroCartaAgregador.innerHTML =
      `<option value="">Todos los agregadores</option>` + optionsHtml;
  }

  // Las marcas son un maestro propio (pueden existir sin categorías todavía);
  // se completan con cualquier marca que ya esté en uso en categorías existentes,
  // por si hubiera datos previos que no pasaron por /api/marcas.
  function updateMarcasOptions() {
    const desdeCategorias = state.categorias.map((c) => c.marca).filter(Boolean);
    const marcas = [...new Set([...state.marcas, ...desdeCategorias])].sort();
    els.marcasDatalist.innerHTML = marcas.map((m) => `<option value="${m}"></option>`).join("");
    const current = els.filtroMarca.value;
    els.filtroMarca.innerHTML =
      `<option value="">Todas las marcas</option>` + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
    els.filtroMarca.value = marcas.includes(current) ? current : "";

    populateCatalogMarcaOptions();
    populateCartasMarcaOptions();
  }

  async function loadMarcas() {
    try {
      const res = await fetch("/api/marcas");
      const data = await res.json();
      if (res.ok) state.marcas = data.marcas || [];
    } catch (_err) {
      // Las marcas son informativas: si falla, el filtro sigue funcionando con lo que haya en categorías.
    }
  }

  async function loadCategorias() {
    els.categoriasError.classList.add("hidden");
    try {
      const [, res] = await Promise.all([loadMarcas(), fetch("/api/categorias")]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error consultando categorías.");
      state.categorias = data.categorias || [];
      state.categoriasLoaded = true;
      updateMarcasOptions();
      renderCategorias();
    } catch (err) {
      els.categoriasError.textContent = err.message;
      els.categoriasError.classList.remove("hidden");
    }
  }

  function renderCategorias() {
    const marca = els.filtroMarca.value;
    const agregador = els.filtroAgregador.value;
    const items = state.categorias.filter(
      (c) => (!marca || c.marca === marca) && (!agregador || c.agregador === agregador)
    );

    els.categoriasList.innerHTML = "";
    els.categoriasEmpty.classList.toggle("hidden", items.length > 0);

    // El orden (y el "código" que alimenta Orden/OrderPos en el editor de
    // producto) solo tiene sentido dentro de una (marca, agregador) puntual:
    // por eso los botones de mover solo se habilitan cuando ambos filtros
    // están fijos en un valor específico, no en "Todas/Todos".
    const puedeOrdenar = !!marca && !!agregador;

    const frag = document.createDocumentFragment();
    items.forEach((c, idx) =>
      frag.appendChild(
        buildCategoriaCard(c, { puedeOrdenar, posicion: idx + 1, esPrimero: idx === 0, esUltimo: idx === items.length - 1, itemsOrdenados: items })
      )
    );
    els.categoriasList.appendChild(frag);
  }

  function buildCategoriaCard(categoria, opts) {
    const { puedeOrdenar, posicion, esPrimero, esUltimo, itemsOrdenados } = opts || {};
    const node = els.tplCategoriaCard.content.cloneNode(true);
    const article = node.querySelector(".categoria-card");
    const agBadge = node.querySelector(".agregador-badge");
    const marcaBadge = node.querySelector(".marca-badge");
    const inactivoBadge = node.querySelector(".inactivo-badge");
    const nombreEl = node.querySelector(".categoria-nombre");
    const nombreInput = node.querySelector(".categoria-nombre-input");
    const btnEditarNombre = node.querySelector(".btn-editar-nombre");
    const toggleActivo = node.querySelector(".toggle-activo");
    const btnAddSub = node.querySelector(".btn-add-sub");
    const codigoEl = node.querySelector(".categoria-codigo");
    const btnUp = node.querySelector(".btn-categoria-up");
    const btnDown = node.querySelector(".btn-categoria-down");

    if (puedeOrdenar) {
      codigoEl.textContent = String(posicion);
      codigoEl.title = "Código de la categoría (posición): se usa para completar Orden (OrderPos) en el editor de producto.";
      btnUp.disabled = !!esPrimero;
      btnDown.disabled = !!esUltimo;
      btnUp.addEventListener("click", () => moverCategoria(categoria, itemsOrdenados, "up"));
      btnDown.addEventListener("click", () => moverCategoria(categoria, itemsOrdenados, "down"));
    } else {
      codigoEl.textContent = "—";
      codigoEl.title = "Filtra por una marca y un agregador específicos para poder ordenar.";
      btnUp.disabled = true;
      btnDown.disabled = true;
    }
    const subList = node.querySelector(".subcategorias-list");

    const meta = AGGREGATOR_META[categoria.agregador] || { label: categoria.agregador, color: "#0f172a" };
    agBadge.textContent = meta.label;
    agBadge.style.background = meta.color + "1a";
    agBadge.style.color = meta.color;
    marcaBadge.textContent = categoria.marca;
    nombreEl.textContent = categoria.nombre;
    toggleActivo.checked = !!categoria.activo;
    article.classList.toggle("inactivo", !categoria.activo);
    inactivoBadge.classList.toggle("hidden", !!categoria.activo);

    toggleActivo.addEventListener("change", async () => {
      const nuevoValor = toggleActivo.checked;
      const res = await fetch(`/api/categorias/${categoria.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevoValor }),
      });
      if (res.ok) {
        categoria.activo = nuevoValor;
        article.classList.toggle("inactivo", !categoria.activo);
        inactivoBadge.classList.toggle("hidden", !!categoria.activo);
      } else {
        toggleActivo.checked = !nuevoValor;
        showCategoriasError("No se pudo actualizar el estado de la categoría.");
      }
    });

    btnEditarNombre.addEventListener("click", () => {
      const editing = !nombreInput.classList.contains("hidden");
      if (editing) return;
      nombreInput.value = categoria.nombre;
      nombreEl.classList.add("hidden");
      nombreInput.classList.remove("hidden");
      nombreInput.focus();
    });

    const saveNombre = async () => {
      nombreInput.classList.add("hidden");
      nombreEl.classList.remove("hidden");
      const nuevo = nombreInput.value.trim();
      if (!nuevo || nuevo === categoria.nombre) return;
      const res = await fetch(`/api/categorias/${categoria.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo }),
      });
      if (res.ok) {
        categoria.nombre = nuevo;
        nombreEl.textContent = nuevo;
      } else {
        showCategoriasError("No se pudo actualizar el nombre de la categoría.");
      }
    };
    nombreInput.addEventListener("blur", saveNombre);
    nombreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nombreInput.blur(); }
    });

    (categoria.subcategorias || []).forEach((sub) => subList.appendChild(buildSubcategoriaRow(categoria, sub)));

    btnAddSub.addEventListener("click", async () => {
      const nombre = prompt("Nombre de la nueva subcategoría:");
      if (!nombre || !nombre.trim()) return;
      const res = await fetch(`/api/categorias/${categoria.id}/subcategorias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      const sub = await res.json();
      if (res.ok) {
        categoria.subcategorias = categoria.subcategorias || [];
        categoria.subcategorias.push(sub);
        subList.appendChild(buildSubcategoriaRow(categoria, sub));
      } else {
        showCategoriasError(sub.error || "No se pudo crear la subcategoría.");
      }
    });

    return article;
  }

  function buildSubcategoriaRow(categoria, sub) {
    const node = els.tplSubcategoriaRow.content.cloneNode(true);
    const row = node.querySelector(".subcategoria-row");
    const toggle = node.querySelector(".toggle-activo-sub");
    const nombreEl = node.querySelector(".sub-nombre");
    const nombreInput = node.querySelector(".sub-nombre-input");
    const btnEditar = node.querySelector(".btn-editar-sub");

    toggle.checked = !!sub.activo;
    nombreEl.textContent = sub.nombre;
    row.classList.toggle("opacity-50", !sub.activo);

    toggle.addEventListener("change", async () => {
      const nuevoValor = toggle.checked;
      const res = await fetch(`/api/categorias/${categoria.id}/subcategorias/${sub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevoValor }),
      });
      if (res.ok) {
        sub.activo = nuevoValor;
        row.classList.toggle("opacity-50", !sub.activo);
      } else {
        toggle.checked = !nuevoValor;
        showCategoriasError("No se pudo actualizar el estado de la subcategoría.");
      }
    });

    btnEditar.addEventListener("click", () => {
      nombreInput.value = sub.nombre;
      nombreEl.classList.add("hidden");
      nombreInput.classList.remove("hidden");
      nombreInput.focus();
    });

    const saveNombre = async () => {
      nombreInput.classList.add("hidden");
      nombreEl.classList.remove("hidden");
      const nuevo = nombreInput.value.trim();
      if (!nuevo || nuevo === sub.nombre) return;
      const res = await fetch(`/api/categorias/${categoria.id}/subcategorias/${sub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo }),
      });
      if (res.ok) {
        sub.nombre = nuevo;
        nombreEl.textContent = nuevo;
      } else {
        showCategoriasError("No se pudo actualizar el nombre de la subcategoría.");
      }
    };
    nombreInput.addEventListener("blur", saveNombre);
    nombreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nombreInput.blur(); }
    });

    return row;
  }

  async function moverCategoria(categoria, itemsOrdenados, direction) {
    const ids = itemsOrdenados.map((c) => c.id);
    const idx = ids.indexOf(categoria.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];

    const { marca, agregador } = categoria;
    try {
      const res = await fetch("/api/categorias/orden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca, agregador, ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo reordenar la categoría.");
      state.categorias = state.categorias
        .filter((c) => !(c.marca === marca && c.agregador === agregador))
        .concat(data.categorias);
      renderCategorias();
    } catch (err) {
      showCategoriasError(err.message);
    }
  }

  function showCategoriasError(message) {
    els.categoriasError.textContent = message;
    els.categoriasError.classList.remove("hidden");
    setTimeout(() => els.categoriasError.classList.add("hidden"), 4000);
  }

  async function submitCategoria(e) {
    e.preventDefault();
    const formData = new FormData(els.formCategoria);
    const payload = Object.fromEntries(formData.entries());
    const submitBtn = els.formCategoria.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Guardando…";
    try {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        state.categorias.push(data);
        if (data.marca && !state.marcas.includes(data.marca)) state.marcas.push(data.marca);
        updateMarcasOptions();
        renderCategorias();
        els.formCategoria.reset();
        els.formCategoria.classList.add("hidden");
      } else {
        showCategoriasError(data.error || "No se pudo crear la categoría.");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }

  // ------------------------------------------------------------------ //
  // Maestro de cartas por agregador
  // ------------------------------------------------------------------ //
  // Selector de marca: mismo patrón que Catálogo/Preguntas (obligatorio antes
  // de listar). A diferencia de esos casos, las cartas SÍ son datos locales
  // propios (no vienen de Oracle Simphony), así que "marca" filtra de verdad
  // los maestros, el combo de "Asociar productos" y el de "Previsualizar".
  function populateCartasMarcaOptions() {
    const marcas = [...state.marcas].sort();
    els.cartasMarcaSelect.innerHTML =
      `<option value="">Selecciona una marca…</option>` + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
    els.cartasMarcaSelect.value = marcas.includes(state.cartasMarca) ? state.cartasMarca : "";
  }

  function updateCartasMarcaGate() {
    const hasMarca = !!state.cartasMarca;
    els.cartasMarcaEmpty.classList.toggle("visible", !hasMarca);
    els.cartasContent.classList.toggle("hidden", !hasMarca);
    els.cartasMarcaHint.textContent = hasMarca
      ? "Maestros, asociación de productos y previsualización filtrados por esta marca."
      : "";
  }

  async function loadCartasMaestro() {
    els.cartasError.classList.add("hidden");
    try {
      const [, res] = await Promise.all([loadMarcas(), fetch("/api/cartas-maestro")]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error consultando cartas.");
      state.cartasMaestro = data.cartas || [];
      state.cartasMaestroLoaded = true;
      updateMarcasOptions();
      renderCartasMaestro();
      populateCartaSelect(els.asociarCartaSelect);
      populateCartaSelect(els.preview2CartaSelect);
    } catch (err) {
      els.cartasError.textContent = err.message;
      els.cartasError.classList.remove("hidden");
    }
  }

  function renderCartasMaestro() {
    const marca = state.cartasMarca;
    const agregador = els.filtroCartaAgregador.value;
    const term = els.filtroCartaBusqueda.value.trim().toLowerCase();
    const items = state.cartasMaestro.filter(
      (c) =>
        c.marca === marca &&
        (!agregador || c.agregador === agregador) &&
        (!term || c.nombre.toLowerCase().includes(term))
    );

    els.cartasList.innerHTML = "";
    els.cartasEmpty.classList.toggle("hidden", items.length > 0);
    if (!items.length) {
      els.cartasEmpty.textContent = state.cartasMaestro.some((c) => c.marca === marca)
        ? "No hay cartas que coincidan con la búsqueda o los filtros."
        : "No hay cartas registradas todavía para esta marca.";
    }

    const frag = document.createDocumentFragment();
    items.forEach((c) => frag.appendChild(buildCartaCard(c)));
    els.cartasList.appendChild(frag);
  }

  function resumenProductosCarta(carta) {
    const productos = carta.productos || [];
    if (!productos.length) return "Sin productos asociados todavía.";
    const integrables = productos.filter((p) => p.integrable).length;
    return `${productos.length} producto${productos.length === 1 ? "" : "s"} · ${integrables} integrable${integrables === 1 ? "" : "s"}`;
  }

  function buildCartaCard(carta) {
    const node = els.tplCartaCard.content.cloneNode(true);
    const article = node.querySelector(".categoria-card");
    const agBadge = node.querySelector(".agregador-badge");
    const marcaBadge = node.querySelector(".marca-badge");
    const inactivoBadge = node.querySelector(".inactivo-badge");
    const nombreEl = node.querySelector(".carta-nombre");
    const nombreInput = node.querySelector(".carta-nombre-input");
    const btnEditarNombre = node.querySelector(".btn-editar-carta-nombre");
    const toggleActivo = node.querySelector(".toggle-activo");
    const resumenEl = node.querySelector(".carta-productos-resumen");
    const btnAsociar = node.querySelector(".btn-asociar-carta");
    const btnPrevisualizar = node.querySelector(".btn-previsualizar-carta");

    const meta = AGGREGATOR_META[carta.agregador] || { label: carta.agregador, color: "#0f172a" };
    agBadge.textContent = meta.label;
    agBadge.style.background = meta.color + "1a";
    agBadge.style.color = meta.color;
    marcaBadge.textContent = carta.marca;
    nombreEl.textContent = carta.nombre;
    resumenEl.textContent = resumenProductosCarta(carta);
    toggleActivo.checked = !!carta.activo;
    article.classList.toggle("inactivo", !carta.activo);
    inactivoBadge.classList.toggle("hidden", !!carta.activo);

    toggleActivo.addEventListener("change", async () => {
      const nuevoValor = toggleActivo.checked;
      const res = await fetch(`/api/cartas-maestro/${carta.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevoValor }),
      });
      if (res.ok) {
        carta.activo = nuevoValor;
        article.classList.toggle("inactivo", !carta.activo);
        inactivoBadge.classList.toggle("hidden", !!carta.activo);
      } else {
        toggleActivo.checked = !nuevoValor;
        showCartasError("No se pudo actualizar el estado de la carta.");
      }
    });

    btnEditarNombre.addEventListener("click", () => {
      const editing = !nombreInput.classList.contains("hidden");
      if (editing) return;
      nombreInput.value = carta.nombre;
      nombreEl.classList.add("hidden");
      nombreInput.classList.remove("hidden");
      nombreInput.focus();
    });

    const saveNombre = async () => {
      nombreInput.classList.add("hidden");
      nombreEl.classList.remove("hidden");
      const nuevo = nombreInput.value.trim();
      if (!nuevo || nuevo === carta.nombre) return;
      const res = await fetch(`/api/cartas-maestro/${carta.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo }),
      });
      if (res.ok) {
        carta.nombre = nuevo;
        nombreEl.textContent = nuevo;
      } else {
        showCartasError("No se pudo actualizar el nombre de la carta.");
      }
    };
    nombreInput.addEventListener("blur", saveNombre);
    nombreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nombreInput.blur(); }
    });

    btnAsociar.addEventListener("click", () => {
      switchCartasSubview("asociar");
      populateCartaSelect(els.asociarCartaSelect, carta.id);
      selectAsociarCarta(carta);
    });
    btnPrevisualizar.addEventListener("click", () => {
      switchCartasSubview("previsualizar");
      populateCartaSelect(els.preview2CartaSelect, carta.id);
      selectPreviewCarta(carta);
    });

    return article;
  }

  // ------------------------------------------------------------------ //
  // Sub-vistas de "Cartas por agregador": Maestros / Asociar productos /
  // Previsualizar. Los combos de carta de las dos últimas comparten el
  // mismo listado (state.cartasMaestro) via populateCartaSelect.
  // ------------------------------------------------------------------ //
  function populateCartaSelect(selectEl, selectedId) {
    const actual = selectedId !== undefined && selectedId !== null ? String(selectedId) : selectEl.value;
    const cartas = state.cartasMaestro
      .filter((c) => c.marca === state.cartasMarca)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    selectEl.innerHTML = `<option value="">Selecciona una carta…</option>` + cartas.map((c) => {
      const meta = AGGREGATOR_META[c.agregador] || { label: c.agregador };
      return `<option value="${c.id}">${c.nombre.replace(/</g, "&lt;")} · ${c.marca.replace(/</g, "&lt;")} · ${meta.label}</option>`;
    }).join("");
    if (actual && cartas.some((c) => String(c.id) === actual)) selectEl.value = actual;
  }

  // Categorías del maestro que corresponden a (marca, agregador) de una carta
  // puntual — se usan tanto en el selector de "Asociar productos" como en el
  // drag & drop de "Previsualizar".
  function categoriasDeCarta(carta) {
    return state.categorias.filter((c) => c.marca === carta.marca && c.agregador === carta.agregador);
  }

  // Mueve UN producto a una categoría (o a "sin categoría" si nuevaCategoriaId
  // es vacío). Solo toca las dos listas afectadas (la que lo tenía y la
  // nueva) y solo agrega/quita ese código puntual — nunca reemplaza la lista
  // completa de una categoría por la vista acotada de una carta, porque esa
  // misma categoría puede tener productos de OTRAS cartas que no deben
  // perderse.
  async function assignAsociarCategoria(carta, code, nuevaCategoriaId) {
    await Promise.all([ensureCategoriasData(), ensureCartaData()]);
    const grupo = categoriasDeCarta(carta);
    const actual = grupo.find((c) => (state.carta[String(c.id)] || []).includes(String(code)));
    const actualId = actual ? String(actual.id) : "";
    const nuevoId = nuevaCategoriaId ? String(nuevaCategoriaId) : "";
    if (actualId === nuevoId) return;

    if (actualId) {
      const codigos = (state.carta[actualId] || []).filter((c) => c !== String(code));
      const res = await fetch(`/api/carta/categorias/${actualId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos }),
      });
      const data = await res.json();
      if (res.ok) state.carta = data.asignaciones;
    }
    if (nuevoId) {
      const codigos = [...(state.carta[nuevoId] || []), String(code)];
      const res = await fetch(`/api/carta/categorias/${nuevoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos }),
      });
      const data = await res.json();
      if (res.ok) state.carta = data.asignaciones;
    }
  }

  function switchCartasSubview(key) {
    state.cartasSubview = key;
    [...els.cartasSubviewTabs.children].forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subview === key);
    });
    els.cartasSubviewMaestros.classList.toggle("hidden", key !== "maestros");
    els.cartasSubviewAsociar.classList.toggle("hidden", key !== "asociar");
    els.cartasSubviewPrevisualizar.classList.toggle("hidden", key !== "previsualizar");
  }

  // ---- Sub-vista "Asociar productos": catálogo completo del agregador de
  // la carta elegida, con búsqueda, filtro por asociación y toggle de
  // asociación/integrable en línea (persiste de inmediato, sin paso de
  // "Guardar" aparte). ---- //
  async function selectAsociarCarta(carta) {
    state.asociarCarta = { carta, catalogo: null, filtro: "todos" };
    els.asociarSearch.value = "";
    els.asociarTabs.forEach((t) => t.classList.toggle("active", t.dataset.filter === "todos"));
    els.asociarError.classList.add("hidden");
    els.asociarEmpty.classList.add("hidden");
    els.asociarList.innerHTML = "";
    els.asociarCount.textContent = "";
    els.asociarSinCarta.classList.add("hidden");
    els.asociarPanel.classList.remove("hidden");

    const meta = AGGREGATOR_META[carta.agregador] || { label: carta.agregador };
    els.asociarSubtitle.textContent = `${carta.nombre} · ${carta.marca} · ${meta.label}`;
    els.asociarLoading.classList.remove("hidden");

    try {
      const [catalogo] = await Promise.all([
        ensureCatalogAgregador(carta.agregador),
        ensureCategoriasData(),
        ensureCartaData(),
      ]);
      state.asociarCarta.catalogo = catalogo;
      renderAsociarList();
    } catch (err) {
      els.asociarError.textContent = err.message;
      els.asociarError.classList.remove("hidden");
    } finally {
      els.asociarLoading.classList.add("hidden");
    }
  }

  function renderAsociarList() {
    const { carta, catalogo, filtro } = state.asociarCarta;
    if (!carta || !catalogo) return;
    const asociados = new Map((carta.productos || []).map((p) => [p.code, p]));
    const term = els.asociarSearch.value.trim().toLowerCase();
    const items = catalogo.filter((p) => {
      const code = String(p.code);
      const asociado = asociados.has(code);
      if (filtro === "asociados" && !asociado) return false;
      if (filtro === "no-asociados" && asociado) return false;
      if (term && !(p.name || "").toLowerCase().includes(term) && !code.includes(term)) return false;
      return true;
    });

    els.asociarEmpty.classList.toggle("hidden", items.length > 0);
    els.asociarCount.textContent = `${asociados.size} de ${catalogo.length} producto${catalogo.length === 1 ? "" : "s"} asociados` +
      (term || filtro !== "todos" ? ` · mostrando ${items.length}` : "");

    els.asociarList.innerHTML = "";
    const frag = document.createDocumentFragment();
    items.forEach((p) => frag.appendChild(buildAsociarRow(p, asociados.get(String(p.code)))));
    els.asociarList.appendChild(frag);
  }

  function buildAsociarRow(producto, asociacion) {
    const row = els.tplCartaCatalogoRow.content.cloneNode(true);
    const rowEl = row.querySelector(".carta-catalogo-row");
    const check = row.querySelector(".carta-catalogo-check");
    const nombreProdEl = row.querySelector(".carta-producto-nombre");
    const codeEl = row.querySelector(".carta-producto-code");
    const priceEl = row.querySelector(".carta-producto-price");
    const categoriaSelect = row.querySelector(".carta-catalogo-categoria-select");
    const integrableBtn = row.querySelector(".carta-catalogo-integrable-btn");

    const carta = state.asociarCarta.carta;
    const code = String(producto.code);
    const asociado = !!asociacion;
    nombreProdEl.textContent = producto.name || "(Sin nombre)";
    codeEl.textContent = code;
    priceEl.textContent = fmtPrice(producto.price);
    rowEl.classList.toggle("no-asociado", !asociado);
    check.classList.toggle("checked", asociado);
    check.textContent = asociado ? "✓" : "";
    check.title = asociado ? "Asociado — clic para quitar de la carta" : "Clic para asociar a esta carta";

    const integrable = asociado ? !!asociacion.integrable : true;
    integrableBtn.disabled = !asociado;
    integrableBtn.textContent = integrable ? "Integrable" : "No integrable";
    integrableBtn.classList.toggle("integrable", integrable);
    integrableBtn.classList.toggle("no-integrable", !integrable);

    categoriaSelect.disabled = !asociado;
    if (asociado) {
      const grupo = categoriasDeCarta(carta);
      const actual = grupo.find((c) => (state.carta[String(c.id)] || []).includes(code));
      categoriaSelect.innerHTML = `<option value="">Sin categoría</option>` +
        grupo.map((c) => `<option value="${c.id}">${c.nombre.replace(/</g, "&lt;")}</option>`).join("");
      categoriaSelect.value = actual ? String(actual.id) : "";
      categoriaSelect.addEventListener("change", async () => {
        categoriaSelect.disabled = true;
        await assignAsociarCategoria(carta, code, categoriaSelect.value);
        categoriaSelect.disabled = false;
      });
    }

    check.addEventListener("click", () => toggleAsociarProducto(code));
    integrableBtn.addEventListener("click", () => toggleAsociarIntegrable(code));

    return rowEl;
  }

  function toggleAsociarProducto(code) {
    const { carta } = state.asociarCarta;
    const actuales = carta.productos || [];
    const yaAsociado = actuales.some((p) => p.code === code);
    const nuevos = yaAsociado
      ? actuales.filter((p) => p.code !== code)
      : [...actuales, { code, integrable: true }];
    persistAsociarProductos(nuevos);
  }

  function toggleAsociarIntegrable(code) {
    const { carta } = state.asociarCarta;
    const nuevos = (carta.productos || []).map((p) =>
      p.code === code ? { ...p, integrable: !p.integrable } : p
    );
    persistAsociarProductos(nuevos);
  }

  async function persistAsociarProductos(nuevaLista) {
    const { carta } = state.asociarCarta;
    if (!carta) return;
    els.asociarList.classList.add("cartas-panel-busy");
    try {
      const res = await fetch(`/api/cartas-maestro/${carta.id}/productos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productos: nuevaLista }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la carta.");
      carta.productos = data.productos;
      renderCartasMaestro();
      renderAsociarList();
    } catch (err) {
      els.asociarError.textContent = err.message;
      els.asociarError.classList.remove("hidden");
    } finally {
      els.asociarList.classList.remove("cartas-panel-busy");
    }
  }

  // ---- Sub-vista "Previsualizar": vista de solo lectura, al estilo de una
  // página de restaurante de un agregador (ej. Rappi), acotada a los
  // productos asociados a UNA carta puntual — ver renderCarta2Preview. ---- //
  async function selectPreviewCarta(carta) {
    state.previewCarta = { carta };
    els.preview2SinCarta.classList.add("hidden");
    els.preview2SinProductos.classList.add("hidden");
    els.preview2.classList.add("hidden");

    const fieldAgg = TAB_TO_FIELD_AGG[carta.agregador] || carta.agregador;
    await Promise.all([
      ensureCategoriasData(),
      ensureCartaData(),
      ensureCatalogAgregador(carta.agregador),
      ensurePreviewCamposData(fieldAgg),
    ]);
    if (state.previewCarta.carta !== carta) return; // el usuario cambió de carta mientras cargaba
    renderCarta2Preview(carta);
  }

  async function ensurePreviewCamposData(fieldAgg) {
    if (state.previewCampos[fieldAgg]) return;
    try {
      const res = await fetch(`/api/productos/campos?agregador=${fieldAgg}`);
      const data = await res.json();
      if (res.ok) state.previewCampos[fieldAgg] = data.campos || {};
    } catch (_err) {
      // Sin campos guardados: la previsualización cae al nombre/precio de Oracle.
    }
  }

  function carta2FieldValue(fieldAgg, code, key) {
    const campos = (state.previewCampos[fieldAgg] || {})[String(code)] || {};
    const valor = campos[key];
    return valor === undefined || valor === null ? "" : valor;
  }

  function carta2ResolvedInfo(carta, producto) {
    const fieldAgg = TAB_TO_FIELD_AGG[carta.agregador] || carta.agregador;
    const code = String(producto.code);
    const nombre = carta2FieldValue(fieldAgg, code, "ProductoPadre") || producto.name || "(Sin nombre)";
    const descripcion = fieldAgg === "LLAMAFOOD"
      ? (carta2FieldValue(fieldAgg, code, "DescripcionProductoPadreLlamaFood") || carta2FieldValue(fieldAgg, code, "DescripcionProductoPadre"))
      : carta2FieldValue(fieldAgg, code, "DescripcionProductoPadre");
    const precioGuardado = carta2FieldValue(fieldAgg, code, "PrecioPadre");
    const precio = precioGuardado !== "" ? precioGuardado : producto.price;
    const imagen = carta2FieldValue(fieldAgg, code, "Imagen");
    return { nombre, descripcion: descripcion || "Sin descripción todavía.", precio, imagen };
  }

  function renderCarta2Preview(carta) {
    const catalogo = state.catalogPorAgregador[carta.agregador] || [];
    const productosMap = new Map(catalogo.map((p) => [String(p.code), p]));
    const asociaciones = carta.productos || [];

    els.preview2SinProductos.classList.toggle("hidden", asociaciones.length > 0);
    els.preview2.classList.toggle("hidden", asociaciones.length === 0);
    if (!asociaciones.length) {
      els.preview2Sections.innerHTML = "";
      els.preview2NavList.innerHTML = "";
      return;
    }

    const categorias = state.categorias.filter((c) => c.marca === carta.marca && c.agregador === carta.agregador && c.activo);
    const codigosCarta = new Set(asociaciones.map((p) => String(p.code)));
    const asignados = new Set();
    categorias.forEach((cat) => {
      (state.carta[String(cat.id)] || []).forEach((code) => {
        if (codigosCarta.has(String(code))) asignados.add(String(code));
      });
    });
    const sinCategoria = asociaciones.map((p) => p.code).filter((code) => !asignados.has(String(code)));

    const meta = AGGREGATOR_META[carta.agregador] || { label: carta.agregador, color: "#0f172a" };
    els.preview2Badge.textContent = (carta.nombre || "?").trim().charAt(0).toUpperCase() || "?";
    els.preview2Badge.style.background = meta.color;
    els.preview2Nombre.textContent = carta.nombre;
    els.preview2Agg.textContent = `${carta.marca} · ${meta.label}`;

    els.preview2Sections.innerHTML = "";
    els.preview2NavList.innerHTML = "";

    els.preview2Sections.appendChild(
      buildCarta2Section("sin-categoria", "Sin categoría", sinCategoria, true, carta, productosMap, asociaciones)
    );
    els.preview2NavList.appendChild(buildCarta2NavItem("sin-categoria", "Sin categoría", sinCategoria.length, true));

    let totalEnCarta = 0;
    categorias.forEach((cat) => {
      const codigos = (state.carta[String(cat.id)] || []).filter((code) => codigosCarta.has(String(code)));
      totalEnCarta += codigos.length;
      els.preview2Sections.appendChild(buildCarta2Section(String(cat.id), cat.nombre, codigos, false, carta, productosMap, asociaciones));
      els.preview2NavList.appendChild(buildCarta2NavItem(String(cat.id), cat.nombre, codigos.length, false));
    });

    els.preview2StatCategorias.textContent = categorias.length;
    els.preview2StatProductos.textContent = totalEnCarta;
    els.preview2StatPendientes.textContent = sinCategoria.length;
  }

  function buildCarta2Section(containerKey, titulo, codigos, esSinCategoria, carta, productosMap, asociaciones) {
    const section = document.createElement("section");
    section.className = "carta-section" + (esSinCategoria ? " carta-section-unassigned" : "");
    section.id = `preview2-section-${containerKey}`;

    const header = document.createElement("div");
    header.className = "carta-section-header";
    header.innerHTML = `<h4>${String(titulo).replace(/</g, "&lt;")}</h4><span class="carta-section-count">${codigos.length}</span>`;
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "carta-section-body";
    body.dataset.preview2Container = containerKey;
    makeCarta2Droppable(body, carta);
    codigos.forEach((code) => {
      const producto = productosMap.get(String(code));
      const asociacion = asociaciones.find((p) => p.code === String(code));
      if (producto) body.appendChild(buildCarta2Row(carta, producto, asociacion, esSinCategoria));
    });
    if (!codigos.length) {
      const empty = document.createElement("div");
      empty.className = "carta-section-empty";
      empty.textContent = esSinCategoria ? "Todos los productos ya están ubicados en alguna categoría." : "Sin productos en esta categoría — arrastra una tarjeta aquí.";
      body.appendChild(empty);
    }
    updateCartaOrderButtons(body);

    section.appendChild(body);
    return section;
  }

  // ---- Drag & drop en "Previsualizar" (Cartas por agregador): reordenar
  // dentro de una categoría y mover entre categorías. Usa el mismo patrón
  // "vivo" (elementFromPoint + rAF) que la previsualización de Catálogo,
  // pero al finalizar (dragend) persiste con cuidado: nunca reemplaza la
  // lista completa de una categoría por el orden visible acá, porque esa
  // categoría puede tener productos de OTRAS cartas — solo reacomoda, en su
  // mismo lugar dentro de la lista completa, los códigos que pertenecen a
  // ESTA carta (ver persistCarta2CategoriaOrder).
  let carta2DragState = null;
  let carta2DragRafId = null;
  let carta2DragPending = null;

  function carta2ContainerKeyOf(el) {
    const container = el.closest("[data-preview2-container]");
    return container ? container.dataset.preview2Container : null;
  }

  function carta2RowAtPoint(container, x, y) {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest(".carta-row");
    if (!row || row.classList.contains("carta-dragging") || !container.contains(row)) return null;
    return row;
  }

  function applyCarta2Reorder(container, x, y) {
    const dragging = document.querySelector(".carta-dragging");
    if (!dragging) return;
    container.querySelector(".carta-section-empty")?.remove();
    const overRow = carta2RowAtPoint(container, x, y);
    if (!overRow) {
      container.appendChild(dragging);
    } else {
      const box = overRow.getBoundingClientRect();
      const before = y - box.top < box.height / 2;
      container.insertBefore(dragging, before ? overRow : overRow.nextSibling);
    }
    updateCartaOrderButtons(container);
  }

  function scheduleCarta2Reorder(container, x, y) {
    carta2DragPending = { container, x, y };
    if (carta2DragRafId) return;
    carta2DragRafId = requestAnimationFrame(() => {
      carta2DragRafId = null;
      const pending = carta2DragPending;
      carta2DragPending = null;
      if (pending) applyCarta2Reorder(pending.container, pending.x, pending.y);
    });
  }

  function makeCarta2Droppable(container, carta) {
    container.addEventListener("dragover", (e) => {
      if (!carta2DragState) return;
      e.preventDefault();
      container.classList.add("carta-dragover");
      scheduleCarta2Reorder(container, e.clientX, e.clientY);
    });
    container.addEventListener("dragleave", (e) => {
      if (!container.contains(e.relatedTarget)) container.classList.remove("carta-dragover");
    });
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      container.classList.remove("carta-dragover");
    });
  }

  async function carta2FinalizeDrag(row, carta) {
    if (carta2DragRafId) {
      cancelAnimationFrame(carta2DragRafId);
      carta2DragRafId = null;
      // Aplica ya mismo el último reacomodo pendiente en vez de descartarlo:
      // si el arrastre fue muy rápido, todavía no había corrido el rAF y
      // se perdería la posición exacta donde se soltó la tarjeta.
      if (carta2DragPending) applyCarta2Reorder(carta2DragPending.container, carta2DragPending.x, carta2DragPending.y);
      carta2DragPending = null;
    }
    if (!carta2DragState) return;
    const toContainer = carta2ContainerKeyOf(row);
    const { fromContainer, code } = carta2DragState;
    carta2DragState = null;
    document.querySelectorAll(".carta-dragover").forEach((el) => el.classList.remove("carta-dragover"));
    if (!toContainer) return;

    if (toContainer !== fromContainer) {
      await assignAsociarCategoria(carta, code, toContainer === "sin-categoria" ? "" : toContainer);
    }
    const afectados = new Set([fromContainer, toContainer].filter((k) => k && k !== "sin-categoria"));
    for (const categoriaId of afectados) {
      await persistCarta2CategoriaOrder(carta, categoriaId);
    }
    renderCarta2Preview(carta);
  }

  // Reacomoda, DENTRO de la lista completa de la categoría (que puede tener
  // productos de otras cartas), únicamente los códigos que pertenecen a esta
  // carta — cada uno se queda en el mismo "casillero" que ya ocupaba, solo
  // cambia qué código de esta carta va en cada casillero, según el orden
  // visible acá. Así nunca se toca la posición de un producto de otra carta.
  async function persistCarta2CategoriaOrder(carta, categoriaId) {
    const container = els.preview2Sections.querySelector(`[data-preview2-container="${categoriaId}"]`);
    if (!container) return;
    const nuevoOrdenCarta = [...container.querySelectorAll(".carta-row")].map((el) => el.dataset.code);
    const codigosCarta = new Set((carta.productos || []).map((p) => String(p.code)));
    const listaCompleta = state.carta[categoriaId] || [];
    const casilleros = [];
    listaCompleta.forEach((code, idx) => {
      if (codigosCarta.has(String(code))) casilleros.push(idx);
    });
    if (casilleros.length !== nuevoOrdenCarta.length) return; // estado inconsistente: no tocar
    const nuevaLista = [...listaCompleta];
    casilleros.forEach((idx, i) => {
      nuevaLista[idx] = nuevoOrdenCarta[i];
    });
    if (nuevaLista.every((c, i) => c === listaCompleta[i])) return;

    state.carta[categoriaId] = nuevaLista;
    try {
      await fetch(`/api/carta/categorias/${categoriaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos: nuevaLista }),
      });
    } catch (_err) {
      // La tarjeta ya se movió visualmente; un nuevo arrastre o recargar
      // la vista vuelve a intentar guardar el orden.
    }
  }

  function moveCarta2Row(carta, row, direction) {
    const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling || !sibling.classList.contains("carta-row")) return;
    const container = row.parentElement;
    if (direction === "up") container.insertBefore(row, sibling);
    else container.insertBefore(sibling, row);
    updateCartaOrderButtons(container);
    const key = carta2ContainerKeyOf(row);
    if (key && key !== "sin-categoria") persistCarta2CategoriaOrder(carta, key);
  }

  function buildCarta2NavItem(containerKey, titulo, count, esSinCategoria) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "carta-nav-item" + (esSinCategoria ? " carta-nav-unassigned" : "");
    btn.innerHTML = `<span>${String(titulo).replace(/</g, "&lt;")}</span><span class="carta-nav-count">${count}</span>`;
    btn.addEventListener("click", () => {
      document.getElementById(`preview2-section-${containerKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return btn;
  }

  function buildCarta2Row(carta, producto, asociacion, esSinCategoria) {
    const row = document.createElement("div");
    const noDisponible = !!asociacion && asociacion.integrable === false;
    row.className = "carta-row" + (noDisponible ? " carta-row-no-disp" : "");
    row.draggable = true;
    row.dataset.code = String(producto.code);
    row.title = esSinCategoria
      ? "Arrastra para mover este producto a una categoría"
      : "Arrastra para reordenar dentro de la categoría, o suéltalo en otra para moverlo";

    const info = carta2ResolvedInfo(carta, producto);
    const thumbInner = info.imagen
      ? `<img src="${String(info.imagen).replace(/"/g, "&quot;")}" alt="" onerror="this.style.display='none'" />`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const badge = noDisponible ? `<span class="carta-row-no-disp-badge">No disponible</span>` : "";

    row.innerHTML = `
      <span class="carta-row-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg></span>
      ${esSinCategoria ? "" : `
      <div class="carta-row-order">
        <button type="button" class="carta-row-up" title="Subir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 15 7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="carta-row-down" title="Bajar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 9 7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`}
      <div class="carta-row-info">
        <p class="carta-row-name">${String(info.nombre).replace(/</g, "&lt;")} ${badge}</p>
        <p class="carta-row-desc">${String(info.descripcion).replace(/</g, "&lt;")}</p>
        <div class="carta-row-meta">
          <span>${fmtPrice(info.precio)}</span>
          <span class="carta-row-code">· ${producto.code}</span>
        </div>
      </div>
      <div class="carta-row-thumb">${thumbInner}</div>
      ${esSinCategoria ? "" : `
      <button type="button" class="carta-row-remove" title="Quitar de esta categoría">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/></svg>
      </button>`}
    `;

    row.addEventListener("dragstart", (e) => {
      carta2DragState = { code: row.dataset.code, fromContainer: carta2ContainerKeyOf(row) };
      row.classList.add("carta-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.code);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("carta-dragging");
      carta2FinalizeDrag(row, carta);
    });

    if (!esSinCategoria) {
      row.querySelector(".carta-row-up").addEventListener("click", () => moveCarta2Row(carta, row, "up"));
      row.querySelector(".carta-row-down").addEventListener("click", () => moveCarta2Row(carta, row, "down"));
      row.querySelector(".carta-row-remove").addEventListener("click", async () => {
        await assignAsociarCategoria(carta, producto.code, "");
        renderCarta2Preview(carta);
      });
    }

    return row;
  }

  // Catálogo del agregador, cacheado en sesión: lo usa el modal "Catálogo
  // de la carta" y el panel de cartas del editor de producto.
  async function ensureCatalogAgregador(agregador) {
    if (state.catalogPorAgregador[agregador]) return state.catalogPorAgregador[agregador];
    const res = await fetch(`/api/menu?channel=${encodeURIComponent(agregador)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo cargar el catálogo del agregador.");
    state.catalogPorAgregador[agregador] = data.products || [];
    return state.catalogPorAgregador[agregador];
  }

  function showCartasError(message) {
    els.cartasError.textContent = message;
    els.cartasError.classList.remove("hidden");
    setTimeout(() => els.cartasError.classList.add("hidden"), 4000);
  }

  async function submitCarta(e) {
    e.preventDefault();
    const formData = new FormData(els.formCarta);
    const payload = Object.fromEntries(formData.entries());
    const submitBtn = els.formCarta.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Guardando…";
    try {
      const res = await fetch("/api/cartas-maestro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        state.cartasMaestro.push(data);
        if (data.marca && !state.marcas.includes(data.marca)) state.marcas.push(data.marca);
        updateMarcasOptions();
        renderCartasMaestro();
        populateCartaSelect(els.asociarCartaSelect);
        populateCartaSelect(els.preview2CartaSelect);
        els.formCarta.reset();
        els.formCarta.classList.add("hidden");
      } else {
        showCartasError(data.error || "No se pudo crear la carta.");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }

  // ------------------------------------------------------------------ //
  // Modal de edición de producto (Información general / Precios /
  // Opciones-Preguntas / Agregadores / Imágenes + vista previa en vivo)
  // ------------------------------------------------------------------ //
  const AGGREGATOR_ALIASES_JS = {
    RAPPI: ["RAPPI"],
    DIDI: ["DIDI"],
    PEDIDOSYA: ["PEDIDOSYA", "PEYA"],
    LLAMAFOOD: ["LLAMAFOOD"],
  };

  function canalIncludesAggregator(canal, code) {
    if (!canal) return false;
    const norm = canal.toUpperCase();
    const aliases = AGGREGATOR_ALIASES_JS[code] || [code];
    return aliases.some((a) => norm.includes(a));
  }

  // Lee el valor "para mostrar" de un campo desde un mapa {AGG: {campo: valor}},
  // aplicando los mismos fallbacks que antes (padre/ precio de Oracle).
  function fieldValueFrom(source, key, agg) {
    const campos = (source && source[agg]) || {};
    const producto = state.preview.producto || {};
    if (key === "CodigoPadre") return producto.code ?? "";
    if (key === "ProductoPadre") return producto.name ?? "";
    if (key === "Menu") return state.selectedMarca ?? "";
    if (key === "PrecioPadre") {
      return campos.PrecioPadre !== undefined && campos.PrecioPadre !== ""
        ? campos.PrecioPadre
        : (producto.price ?? "");
    }
    return campos[key] ?? "";
  }

  function buildChangedByAgg() {
    const changedByAgg = {};
    (state.preview.fieldAggregators || []).forEach((agg) => {
      const fields = PRODUCT_FIELDS.filter((f) => f.type !== "readonly" && f.aggregators.includes(agg));
      const changes = {};
      fields.forEach((f) => {
        const draftVal = fieldValueFrom(state.preview.draft, f.key, agg);
        const savedVal = fieldValueFrom(state.preview.campos, f.key, agg);
        if (String(draftVal) !== String(savedVal)) changes[f.key] = draftVal;
      });
      if (Object.keys(changes).length) changedByAgg[agg] = changes;
    });
    return changedByAgg;
  }

  function preguntasOrdenChanged() {
    return JSON.stringify(state.preview.preguntasOrdenDraft) !== JSON.stringify(state.preview.preguntasOrdenOriginal);
  }

  // Imagen de un producto hijo (opción dentro de una pregunta): se guarda UNA
  // sola vez por (código de hijo, agregador) — ver hijoCampos/hijoDraft.
  function hijoImagenValor(source, agg, hijoCode) {
    const porAgg = (source && source[agg]) || {};
    return (porAgg[hijoCode] || {}).Imagen ?? "";
  }

  function buildChangedHijosByAgg() {
    const changedByAgg = {}; // {agg: {hijoCode: {Imagen: valor}}}
    (state.preview.fieldAggregators || []).forEach((agg) => {
      const draftMap = state.preview.hijoDraft[agg] || {};
      const savedMap = state.preview.hijoCampos[agg] || {};
      const codigos = new Set([...Object.keys(draftMap), ...Object.keys(savedMap)]);
      codigos.forEach((code) => {
        const draftVal = hijoImagenValor(state.preview.hijoDraft, agg, code);
        const savedVal = hijoImagenValor(state.preview.hijoCampos, agg, code);
        if (String(draftVal) !== String(savedVal)) {
          changedByAgg[agg] = changedByAgg[agg] || {};
          changedByAgg[agg][code] = { Imagen: draftVal };
        }
      });
    });
    return changedByAgg;
  }

  function updateSaveButtonState() {
    const hayCambios =
      Object.keys(buildChangedByAgg()).length > 0 ||
      Object.keys(buildChangedHijosByAgg()).length > 0 ||
      preguntasOrdenChanged();
    previewTarget.btnSavePreview.disabled = !hayCambios;
  }

  // ---- Estado del producto (progreso + alertas) dentro del editor ---- //
  // Refleja el mismo (código, agregador) que se está editando; se vuelve a
  // pedir cada vez que se abre el editor o se cambia el agregador
  // seleccionado, porque el progreso/las alertas son por agregador.
  async function refreshPreviewEstado() {
    const code = state.preview.rawProduct && state.preview.rawProduct.code;
    const agg = state.preview.aggregator;
    if (!code || !agg) {
      state.preview.estado = { progreso: null, alertas: [] };
      renderEstadoPanel();
      return;
    }
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(code)}/estado?agregador=${agg}`);
      const data = await res.json();
      state.preview.estado = res.ok ? { progreso: data.progreso, alertas: data.alertas || [] } : { progreso: null, alertas: [] };
    } catch (_err) {
      state.preview.estado = { progreso: null, alertas: [] };
    }
    renderEstadoPanel();
  }

  function renderEstadoPanel() {
    const { progreso, alertas } = state.preview.estado;
    previewTarget.previewEstadoPanel.classList.toggle("hidden", !progreso);
    if (!progreso) return;

    const meta = PROGRESO_META[progreso] || PROGRESO_META.PENDIENTE_DATOS;
    previewTarget.previewEstadoPill.textContent = meta.label;
    previewTarget.previewEstadoPill.className = "estado-pill " + meta.cls;

    previewTarget.previewEstadoAlertaSts.classList.toggle("hidden", !alertas.includes("CAMBIO_STS"));
    previewTarget.previewEstadoAlertaRepublicar.classList.toggle("hidden", !alertas.includes("PENDIENTE_REPUBLICAR"));

    const puedeIntegrar = (PROGRESO_RANK[progreso] ?? 0) >= PROGRESO_RANK.DATOS_COMPLETOS;
    if (progreso === "INTEGRADO") {
      const faltaRepublicar = alertas.includes("PENDIENTE_REPUBLICAR");
      previewTarget.btnIntegrar.textContent = faltaRepublicar ? "Republicar cambios" : "Integrado ✓";
      previewTarget.btnIntegrar.disabled = !faltaRepublicar;
      previewTarget.btnIntegrar.title = "";
      previewTarget.btnDesintegrar.classList.remove("hidden");
    } else {
      previewTarget.btnIntegrar.textContent = "Integrar producto";
      previewTarget.btnIntegrar.disabled = !puedeIntegrar;
      previewTarget.btnIntegrar.title = puedeIntegrar ? "" : "Completa y guarda los datos comerciales antes de integrar.";
      previewTarget.btnDesintegrar.classList.add("hidden");
    }
  }

  // ---- Cartas del maestro asociadas al producto, para el (marca, agregador)
  // que se está editando en ese momento; se recalcula cada vez que cambia
  // el agregador seleccionado, igual que el panel de estado. ---- //
  function cartasDelContextoActual() {
    const canonical = FIELD_AGG_TO_CANONICAL[state.preview.aggregator];
    if (!canonical || !state.selectedMarca) return [];
    return state.cartasMaestro.filter((c) => c.marca === state.selectedMarca && c.agregador === canonical);
  }

  function renderCartasPanel() {
    const panel = previewTarget.cartasPanel;
    if (!panel) return;
    const code = state.preview.rawProduct && state.preview.rawProduct.code;
    if (!code || !state.preview.aggregator) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }

    const cartas = cartasDelContextoActual();
    panel.classList.remove("hidden");
    panel.innerHTML = "";

    const label = document.createElement("span");
    label.className = "cartas-panel-label";
    label.textContent = "Cartas";
    panel.appendChild(label);

    if (!cartas.length) {
      const hint = document.createElement("span");
      hint.className = "cartas-panel-hint";
      const aggLabel = (AGGREGATOR_META[FIELD_AGG_TO_CANONICAL[state.preview.aggregator]] || {}).label || state.preview.aggregator;
      hint.textContent = state.selectedMarca
        ? `Sin cartas creadas para ${state.selectedMarca} en ${aggLabel}.`
        : `Selecciona una marca en el catálogo para ver las cartas de ${aggLabel}.`;
      panel.appendChild(hint);
      return;
    }

    cartas.forEach((carta) => {
      const asociado = (carta.productos || []).some((p) => p.code === String(code));
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "carta-chip" + (asociado ? " checked" : "");
      chip.title = asociado ? "En esta carta — clic para quitar" : "Clic para asociar a esta carta";
      chip.innerHTML = `<span class="carta-chip-check">${asociado ? "✓" : ""}</span><span>${carta.nombre}</span>`;
      chip.addEventListener("click", () => toggleProductoEnCarta(carta, String(code)));
      panel.appendChild(chip);
    });
  }

  async function toggleProductoEnCarta(carta, code) {
    const yaAsociado = (carta.productos || []).some((p) => p.code === code);
    const productos = yaAsociado
      ? (carta.productos || []).filter((p) => p.code !== code)
      : [...(carta.productos || []), { code, integrable: true }];

    previewTarget.cartasPanel.classList.add("cartas-panel-busy");
    try {
      const res = await fetch(`/api/cartas-maestro/${carta.id}/productos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la carta.");
      const idx = state.cartasMaestro.findIndex((c) => c.id === carta.id);
      if (idx !== -1) state.cartasMaestro[idx] = data;
      if (state.currentView === "cartas") renderCartasMaestro();
    } catch (err) {
      previewTarget.previewError.textContent = err.message;
      previewTarget.previewError.classList.remove("hidden");
    } finally {
      previewTarget.cartasPanel.classList.remove("cartas-panel-busy");
      renderCartasPanel();
    }
  }

  // Actualiza en el sitio el mapa usado por el catálogo/carta cuando la
  // acción ocurrió sobre el mismo agregador que la pestaña activa, para
  // que los badges se vean al tiro sin tener que refrescar todo el menú.
  function applyEstadoLocal(code, progreso, alertas, agg) {
    if (TAB_TO_FIELD_AGG[state.activeTab] !== agg) return;
    state.estadoCodes[String(code)] = { progreso, alertas: alertas || [] };
    if ((PROGRESO_RANK[progreso] ?? 0) >= PROGRESO_RANK.DATOS_COMPLETOS) {
      state.completedCodes.add(String(code));
    } else {
      state.completedCodes.delete(String(code));
    }
    if (state.currentView === "catalog") {
      renderStatusTabs();
      renderResults();
      if (state.catalogSubview === "carta") renderCartaPreview();
    }
  }

  async function doConfirmarSts() {
    const code = state.preview.rawProduct && state.preview.rawProduct.code;
    const agg = state.preview.aggregator;
    if (!code || !agg) return;
    previewTarget.btnConfirmarSts.disabled = true;
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(code)}/confirmar-sts?agregador=${agg}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        state.preview.estado = { progreso: data.progreso, alertas: data.alertas || [] };
        applyEstadoLocal(code, data.progreso, data.alertas, agg);
      }
    } finally {
      previewTarget.btnConfirmarSts.disabled = false;
      renderEstadoPanel();
    }
  }

  async function doIntegrar() {
    const code = state.preview.rawProduct && state.preview.rawProduct.code;
    const agg = state.preview.aggregator;
    if (!code || !agg) return;
    previewTarget.btnIntegrar.disabled = true;
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(code)}/integrar?agregador=${agg}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        state.preview.estado = { progreso: data.progreso, alertas: data.alertas || [] };
        applyEstadoLocal(code, data.progreso, data.alertas, agg);
      }
    } finally {
      renderEstadoPanel();
    }
  }

  async function doDesintegrar() {
    const code = state.preview.rawProduct && state.preview.rawProduct.code;
    const agg = state.preview.aggregator;
    if (!code || !agg) return;
    previewTarget.btnDesintegrar.disabled = true;
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(code)}/desintegrar?agregador=${agg}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        state.preview.estado = { progreso: data.progreso, alertas: data.alertas || [] };
        applyEstadoLocal(code, data.progreso, data.alertas, agg);
      }
    } finally {
      previewTarget.btnDesintegrar.disabled = false;
      renderEstadoPanel();
    }
  }

  // Carga desde el servidor los campos guardados de un producto para los 4
  // agregadores editables y deja state.preview listo para renderizar, tanto
  // para el modal (Vista previa) como para el editor de pantalla completa
  // (Vista previa 2).
  async function loadPreviewProduct(product) {
    await Promise.all([
      ensureCategoriasData(), // maestro de categorías para los campos tipo "categoria" (Collection/Sección)
      ensureCartasMaestroData(), // maestro de cartas, para el panel de cartas asociadas
    ]);

    // El agregador inicial solo depende de product.canal (ya lo tenemos),
    // así que se resuelve antes de pedir nada: permite pedir también el
    // estado de ESE agregador en la misma tanda en paralelo de abajo, en
    // vez de esperar a que terminen los campos para recién pedirlo.
    const fieldAggregators = availableFieldAggregators(product.canal || "");
    const preferido = TAB_TO_FIELD_AGG[state.activeTab];
    const aggregatorInicial = fieldAggregators.includes(preferido) ? preferido : (fieldAggregators[0] || null);

    // Campos (x4 agregadores) + preguntas-orden + estado no dependen entre
    // sí, así que se piden todos en una sola tanda paralela en vez de en
    // rondas sucesivas: eso es lo que hacía lenta la apertura del editor.
    const [campoResults, hijoCampoResults, preguntasOrdenData, estadoData] = await Promise.all([
      Promise.all(
        FIELD_AGGREGATORS.map((agg) =>
          fetch(`/api/productos/${encodeURIComponent(product.code)}/campos?agregador=${agg}`)
            .then((res) => res.json().then((data) => ({ agg, ok: res.ok, data })))
        )
      ),
      // Imagen de los "productos hijos" (opciones dentro de una pregunta): se
      // trae en bloque para los 4 agregadores, igual que /api/productos/campos
      // en "Previsualizar carta" — evita pedirla una por una por cada opción.
      Promise.all(
        FIELD_AGGREGATORS.map((agg) =>
          fetch(`/api/productos-hijos/campos?agregador=${agg}`)
            .then((res) => res.json().then((data) => ({ agg, ok: res.ok, data })))
            .catch(() => ({ agg, ok: false, data: {} }))
        )
      ),
      fetch(`/api/productos/${encodeURIComponent(product.code)}/preguntas-orden`)
        .then((res) => (res.ok ? res.json() : { orden: [] }))
        .catch(() => ({ orden: [] })),
      aggregatorInicial
        ? fetch(`/api/productos/${encodeURIComponent(product.code)}/estado?agregador=${aggregatorInicial}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const failed = campoResults.find((r) => !r.ok);
    if (failed) throw new Error(failed.data.error || "No se pudo cargar el producto.");

    state.preview.producto = campoResults[0].data.producto;
    campoResults.forEach(({ agg, data }) => {
      state.preview.campos[agg] = data.campos || {};
      state.preview.draft[agg] = { ...(data.campos || {}) };
    });

    hijoCampoResults.forEach(({ agg, ok, data }) => {
      const campos = ok ? (data.campos || {}) : {};
      state.preview.hijoCampos[agg] = campos;
      state.preview.hijoDraft[agg] = Object.fromEntries(
        Object.entries(campos).map(([code, valores]) => [code, { ...valores }])
      );
    });

    state.preview.fieldAggregators = fieldAggregators;
    state.preview.aggregator = aggregatorInicial;
    state.preview.estado = estadoData
      ? { progreso: estadoData.progreso, alertas: estadoData.alertas || [] }
      : { progreso: null, alertas: [] };

    state.preview.opcionesCount = product.type === "COMBO"
      ? (product.groups || []).length
      : new Set((product.condiments || []).map((c) => c.subgroup_code || c.subgroup_name)).size;

    // Orden de "Opciones / Preguntas": el grupo principal (obligatorio) va
    // siempre primero y no se guarda; el resto usa el orden guardado si
    // existe (validado contra las preguntas actuales), o el orden natural
    // de Oracle Simphony si todavía no se personalizó.
    const principalCode = product.type === "COMBO"
      ? (product.groups || []).find((g) => g.principal)?.code
      : null;
    state.preview.preguntasPrincipalCode = principalCode !== undefined && principalCode !== null ? String(principalCode) : null;

    const natural = preguntasNaturalOrder(product);
    const guardado = preguntasOrdenData.orden || [];
    const resuelto = resolvePreguntasOrden(natural, guardado, state.preview.preguntasPrincipalCode);
    state.preview.preguntasOrdenOriginal = resuelto;
    state.preview.preguntasOrdenDraft = [...resuelto];
  }

  // Códigos de las "preguntas" (grupos de combo o subgrupos de condimentos)
  // en el orden en el que llegan desde Oracle Simphony.
  function preguntasNaturalOrder(product) {
    if (product.type === "COMBO") {
      return (product.groups || []).map((g) => String(g.code));
    }
    const vistos = new Set();
    const codigos = [];
    (product.condiments || []).forEach((c) => {
      const key = String(c.subgroup_code || c.subgroup_name || "otros");
      if (!vistos.has(key)) {
        vistos.add(key);
        codigos.push(key);
      }
    });
    return codigos;
  }

  // Combina el orden guardado con el natural (por si Oracle agregó/quitó
  // preguntas desde el último guardado) y fuerza al principal a ir primero.
  function resolvePreguntasOrden(natural, guardado, principalCode) {
    const naturalSet = new Set(natural);
    let orden = (guardado || []).filter((c) => naturalSet.has(c));
    natural.forEach((c) => {
      if (!orden.includes(c)) orden.push(c);
    });
    if (principalCode && orden.includes(principalCode)) {
      orden = [principalCode, ...orden.filter((c) => c !== principalCode)];
    }
    return orden;
  }

  // ---- Vista previa: modal con pestañas (comportamiento original) ---- //
  async function openPreview(product) {
    previewTarget = els;
    state.preview = {
      producto: null,
      rawProduct: product,
      campos: {},
      draft: {},
      hijoCampos: {}, // {agregador: {codigo_hijo: {Imagen: valor}}} — imagen de los "productos hijos" (opciones)
      hijoDraft: {},
      aggregator: null,
      fieldAggregators: [],
      modalTab: "general",
      device: state.preview.device || "mobile",
      opcionesCount: 0,
      preguntasOrdenOriginal: [],
      preguntasOrdenDraft: [],
      preguntasPrincipalCode: null,
      estado: { progreso: null, alertas: [] },
    };

    els.previewOverlay.classList.remove("hidden");
    els.previewError.classList.add("hidden");
    els.previewBody.classList.add("hidden");
    els.previewLoading.classList.remove("hidden");
    els.previewModalTabs.innerHTML = "";
    els.previewEstadoPanel.classList.add("hidden");
    hideSaveMessage();
    els.btnSavePreview.disabled = true;

    els.previewTypeBadge.textContent = product.type;
    els.previewTypeBadge.className = "type-badge " + (product.type === "COMBO" ? "combo" : "producto");
    els.previewTitle.textContent = product.name || "(Sin nombre)";
    els.previewCode.textContent = product.code;

    try {
      await loadPreviewProduct(product);

      renderModalTabs();
      renderDeviceToggle();
      els.previewMockupCard.style.maxWidth = state.preview.device === "desktop" ? "26rem" : "20rem";
      selectModalTab("general");
      renderPreviewMockup();
      updateSaveButtonState();
      renderEstadoPanel(); // el estado ya se cargó junto con el resto en loadPreviewProduct
      renderCartasPanel();
      els.previewBody.classList.remove("hidden");
    } catch (err) {
      els.previewError.textContent = err.message;
      els.previewError.classList.remove("hidden");
    } finally {
      els.previewLoading.classList.add("hidden");
    }
  }

  // ---- Vista previa 2 (en prueba): editor de pantalla completa ---- //
  async function openPreviewV2(product) {
    previewTarget = els2;
    state.preview = {
      producto: null,
      rawProduct: product,
      campos: {},
      draft: {},
      hijoCampos: {}, // {agregador: {codigo_hijo: {Imagen: valor}}} — imagen de los "productos hijos" (opciones)
      hijoDraft: {},
      aggregator: null,
      fieldAggregators: [],
      modalTab: "general",
      device: state.preview.device || "mobile",
      opcionesCount: 0,
      preguntasOrdenOriginal: [],
      preguntasOrdenDraft: [],
      preguntasPrincipalCode: null,
      estado: { progreso: null, alertas: [] },
    };

    els2.previewOverlay.classList.remove("hidden");
    els2.previewError.classList.add("hidden");
    els2.previewBody.classList.add("hidden");
    els2.previewLoading.classList.remove("hidden");
    els2.previewAggSelector.innerHTML = "";
    els2.previewEstadoPanel.classList.add("hidden");
    hideSaveMessage();
    els2.btnSavePreview.disabled = true;

    els2.previewTypeBadge.textContent = product.type;
    els2.previewTypeBadge.className = "type-badge " + (product.type === "COMBO" ? "combo" : "producto");
    els2.previewTitle.textContent = product.name || "(Sin nombre)";
    els2.previewCode.textContent = product.code;

    try {
      await loadPreviewProduct(product);

      renderAggSelector();
      renderFormSections();
      renderAgregadoresPanelV2();
      renderOpcionesPanelV2();
      updateSaveButtonState();
      renderEstadoPanel(); // el estado ya se cargó junto con el resto en loadPreviewProduct
      renderCartasPanel();
      els2.previewBody.classList.remove("hidden");
    } catch (err) {
      els2.previewError.textContent = err.message;
      els2.previewError.classList.remove("hidden");
    } finally {
      els2.previewLoading.classList.add("hidden");
    }
  }

  function closePreview() {
    previewTarget.previewOverlay.classList.add("hidden");
  }

  function showSaveMessage(text, ok) {
    previewTarget.previewSaveMessage.className = `font-medium ${ok ? "text-green-600" : "text-red-600"}`;
    previewTarget.previewSaveMessage.textContent = text;
    previewTarget.previewSaveMessage.classList.remove("hidden");
    previewTarget.previewFooterHelp.classList.add("hidden");
    if (ok) setTimeout(hideSaveMessage, 2500);
  }

  function hideSaveMessage() {
    previewTarget.previewSaveMessage.classList.add("hidden");
    previewTarget.previewFooterHelp.classList.remove("hidden");
  }

  async function doSaveAll() {
    const changedByAgg = buildChangedByAgg();
    const changedHijosByAgg = buildChangedHijosByAgg();
    const aggsToSave = Object.keys(changedByAgg);
    const hijoAggsToSave = Object.keys(changedHijosByAgg);
    const ordenDirty = preguntasOrdenChanged();
    if (!aggsToSave.length && !hijoAggsToSave.length && !ordenDirty) return;

    previewTarget.btnSavePreview.disabled = true;
    const originalLabel = previewTarget.btnSavePreview.textContent;
    previewTarget.btnSavePreview.textContent = "Guardando…";
    hideSaveMessage();

    try {
      const tareas = aggsToSave.map(async (agg) => {
        const res = await fetch(`/api/productos/${encodeURIComponent(state.preview.producto.code)}/campos?agregador=${agg}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changedByAgg[agg]),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `No se pudo guardar (${FIELD_AGG_META[agg].label}).`);
        return { type: "campos", agg, campos: data.campos };
      });
      hijoAggsToSave.forEach((agg) => {
        Object.entries(changedHijosByAgg[agg]).forEach(([hijoCode, campos]) => {
          tareas.push(
            (async () => {
              const res = await fetch(`/api/productos-hijos/${encodeURIComponent(hijoCode)}/campos?agregador=${agg}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(campos),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `No se pudo guardar la imagen de una opción (${FIELD_AGG_META[agg].label}).`);
              return { type: "hijoCampos", agg, hijoCode, campos: data.campos };
            })()
          );
        });
      });
      if (ordenDirty) {
        tareas.push(
          (async () => {
            const res = await fetch(`/api/productos/${encodeURIComponent(state.preview.producto.code)}/preguntas-orden`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orden: state.preview.preguntasOrdenDraft }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "No se pudo guardar el orden de preguntas.");
            return { type: "orden", orden: data.orden };
          })()
        );
      }

      const results = await Promise.all(tareas);
      results.forEach((r) => {
        if (r.type === "campos") {
          state.preview.campos[r.agg] = r.campos;
          state.preview.draft[r.agg] = { ...r.campos };
        } else if (r.type === "hijoCampos") {
          state.preview.hijoCampos[r.agg] = state.preview.hijoCampos[r.agg] || {};
          state.preview.hijoCampos[r.agg][r.hijoCode] = r.campos;
          state.preview.hijoDraft[r.agg] = state.preview.hijoDraft[r.agg] || {};
          state.preview.hijoDraft[r.agg][r.hijoCode] = { ...r.campos };
        } else if (r.type === "orden") {
          state.preview.preguntasOrdenOriginal = [...state.preview.preguntasOrdenDraft];
        }
      });
      showSaveMessage("Guardado exitosamente", true);
      if (previewTarget === els) {
        renderTabPanel(state.preview.modalTab);
      } else {
        renderFormSections();
        renderOpcionesPanelV2();
      }
      renderPreviewMockup();
      await refreshPreviewEstado();
      // Refresca en segundo plano el estado Completo/Pendiente del catálogo y las tarjetas resumen.
      fetchMenu(state.activeTab, false);
      loadAggregatorSummary();
    } catch (err) {
      showSaveMessage(err.message, false);
    } finally {
      previewTarget.btnSavePreview.textContent = originalLabel;
      updateSaveButtonState();
    }
  }

  // ---- Pestañas internas del modal (Vista previa) ---- //
  function renderModalTabs() {
    els.previewModalTabs.innerHTML = "";
    MODAL_TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-tab-btn" + (state.preview.modalTab === tab.key ? " active" : "");
      let label = tab.label;
      if (tab.key === "opciones") label += ` (${state.preview.opcionesCount})`;
      btn.textContent = label;
      btn.dataset.tab = tab.key;
      btn.addEventListener("click", () => selectModalTab(tab.key));
      els.previewModalTabs.appendChild(btn);
    });
  }

  function selectModalTab(tabKey) {
    state.preview.modalTab = tabKey;
    [...els.previewModalTabs.children].forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabKey));
    els.previewTabPanels.querySelectorAll(".preview-tab-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.tab !== tabKey);
    });
    renderTabPanel(tabKey);
  }

  function renderTabPanel(tabKey) {
    if (tabKey === "general" || tabKey === "precios" || tabKey === "imagenes") {
      renderFieldTabPanel(tabKey);
    } else if (tabKey === "opciones") {
      renderOpcionesPanelModal();
    } else if (tabKey === "agregadores") {
      renderAgregadoresPanelModal();
    }
  }

  // ---- Pestañas de campos del modal (Información general / Precios / Imágenes) ---- //
  function renderFieldTabPanel(tabKey) {
    const panel = els.previewTabPanels.querySelector(`.preview-tab-panel[data-tab="${tabKey}"]`);
    panel.innerHTML = "";

    if (tabKey === "general") {
      panel.appendChild(buildInfoBasicaCard());
    }

    if (!state.preview.fieldAggregators.length) {
      const aviso = document.createElement("p");
      aviso.className = "text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4";
      aviso.textContent = "Este producto no tiene NGR_Carta configurado en Oracle Simphony, por lo tanto no se publica en ningún agregador y no hay campos que editar.";
      panel.appendChild(aviso);
      return;
    }

    const pillsWrap = document.createElement("div");
    pillsWrap.className = "flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1.5 mt-4";
    state.preview.fieldAggregators.forEach((agg) => {
      const meta = FIELD_AGG_META[agg];
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "preview-agg-chip" + (agg === state.preview.aggregator ? " active" : "");
      pill.style.setProperty("--chip-color", meta.color);
      pill.textContent = meta.label;
      pill.addEventListener("click", () => {
        if (state.preview.aggregator === agg) return;
        state.preview.aggregator = agg;
        renderFieldTabPanel(tabKey);
        renderPreviewMockup();
        refreshPreviewEstado();
        renderCartasPanel();
      });
      pillsWrap.appendChild(pill);
    });
    panel.appendChild(pillsWrap);

    const aggFields = PRODUCT_FIELDS.filter((f) => f.tab === tabKey && f.aggregators.includes(state.preview.aggregator));
    const secciones = [...new Set(aggFields.map((f) => f.section))];
    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "space-y-4 mt-4";

    secciones.forEach((seccion) => {
      const camposSeccion = aggFields.filter((f) => f.section === seccion);
      if (!camposSeccion.length) return;

      const wrap = document.createElement("div");
      wrap.className = "bg-white rounded-xl border border-slate-200 p-4";
      const title = document.createElement("p");
      title.className = "field-section-title mb-2";
      title.textContent = seccion;
      wrap.appendChild(title);
      camposSeccion.filter((f) => !isFieldRowHidden(f, state.preview.aggregator)).forEach((field) => wrap.appendChild(buildFieldRow(field, state.preview.aggregator)));
      fieldsWrap.appendChild(wrap);
    });

    if (!aggFields.length) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-slate-400";
      empty.textContent = "Este agregador no tiene campos configurables en esta sección.";
      fieldsWrap.appendChild(empty);
    }

    panel.appendChild(fieldsWrap);
  }

  function buildInfoBasicaCard() {
    const producto = state.preview.producto || {};
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl border border-slate-200 p-4";

    const title = document.createElement("p");
    title.className = "field-section-title mb-3";
    title.textContent = "Información básica (Oracle Simphony)";
    card.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-3";
    grid.innerHTML = `
      <div>
        <p class="text-xs font-medium text-slate-600 mb-1">Nombre del producto</p>
        <input type="text" class="cfg-input w-full bg-slate-50 text-slate-500" value="${(producto.name || "").replace(/"/g, "&quot;")}" disabled />
      </div>
      <div>
        <p class="text-xs font-medium text-slate-600 mb-1">Código Oracle (STS)</p>
        <input type="text" class="cfg-input w-full bg-slate-50 text-slate-500" value="${producto.code ?? ""}" disabled />
      </div>
    `;
    card.appendChild(grid);
    return card;
  }

  // ---- Selector de agregador (chips) ---- //
  // Reemplaza las antiguas pestañas del modal: como los valores de cada campo
  // son independientes por agregador, solo se necesita elegir CUÁL agregador
  // se está editando; el resto del formulario ya no está dividido en pestañas.
  function renderAggSelector() {
    els2.previewAggSelector.innerHTML = "";
    if (state.preview.fieldAggregators.length <= 1) return; // nada que elegir

    state.preview.fieldAggregators.forEach((agg) => {
      const meta = FIELD_AGG_META[agg];
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "preview-agg-chip" + (agg === state.preview.aggregator ? " active" : "");
      pill.style.setProperty("--chip-color", meta.color);
      pill.textContent = meta.label;
      pill.addEventListener("click", () => {
        if (state.preview.aggregator === agg) return;
        state.preview.aggregator = agg;
        renderAggSelector();
        renderFormSections();
        renderOpcionesPanelV2();
        renderPreviewMockup();
        refreshPreviewEstado();
        renderCartasPanel();
      });
      els2.previewAggSelector.appendChild(pill);
    });
  }

  // ---- Formulario único de Vista previa 2 (sin pestañas): todas las secciones de campos ---- //
  function renderFormSections() {
    const wrap = els2.previewFormSections;
    wrap.innerHTML = "";

    if (!state.preview.fieldAggregators.length) {
      const aviso = document.createElement("p");
      aviso.className = "text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2";
      aviso.textContent = "Este producto no tiene NGR_Carta configurado en Oracle Simphony, por lo tanto no se publica en ningún agregador y no hay campos que editar.";
      wrap.appendChild(aviso);
      return;
    }

    const agg = state.preview.aggregator;
    const aggFields = PRODUCT_FIELDS.filter((f) => f.aggregators.includes(agg));

    // "Menú y categoría" no se muestra en Vista previa 2 (a diferencia del
    // modal Vista previa, donde sí aparece dentro de "Información general").
    SECTION_ORDER.filter((seccion) => seccion !== "Menú y categoría").forEach((seccion) => {
      const camposSeccion = aggFields.filter((f) => f.section === seccion);
      if (!camposSeccion.length) return;

      const card = document.createElement("div");
      card.className = "bg-white rounded-xl border border-slate-200 p-4";
      const title = document.createElement("p");
      title.className = "field-section-title mb-2";
      title.textContent = seccion;
      card.appendChild(title);
      camposSeccion.filter((f) => !isFieldRowHidden(f, agg)).forEach((field) => card.appendChild(buildFieldRow(field, agg)));
      wrap.appendChild(card);
    });
  }

  function fieldAppliesNote(field) {
    return field.nota ? `<p class="text-[11px] text-slate-400 italic mt-1">${field.nota}</p>` : "";
  }

  function buildFieldRow(field, agg) {
    const row = document.createElement("div");
    row.className = "field-row grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-2 py-2.5 border-b border-slate-50";

    const left = document.createElement("div");
    const labelWrap = document.createElement("div");
    labelWrap.className = "flex items-center gap-1.5";
    const label = document.createElement("p");
    label.className = "text-xs font-medium text-slate-600";
    label.textContent = field.label;
    const dot = document.createElement("span");
    dot.className = "field-dirty-dot hidden";
    dot.title = "Cambios sin guardar";
    labelWrap.appendChild(label);
    labelWrap.appendChild(dot);
    left.appendChild(labelWrap);

    if (field.aggregators.length > 1) {
      const shared = document.createElement("p");
      shared.className = "text-[11px] text-slate-400 mt-0.5";
      shared.textContent = `También aplica a: ${field.aggregators
        .filter((a) => a !== agg)
        .map((a) => FIELD_AGG_META[a].label)
        .join(", ")} (valor independiente por agregador)`;
      left.appendChild(shared);
    }
    left.insertAdjacentHTML("beforeend", fieldAppliesNote(field));

    const right = document.createElement("div");
    const draftVal = fieldValueFrom(state.preview.draft, field.key, agg);
    const savedVal = fieldValueFrom(state.preview.campos, field.key, agg);

    if (field.type === "readonly") {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cfg-input w-full bg-slate-50 text-slate-500";
      input.value = draftVal;
      input.disabled = true;
      right.appendChild(input);
    } else if (field.type === "categoria") {
      const opciones = categoriasParaCombo(agg);
      const select = document.createElement("select");
      select.className = "cfg-input w-full bg-white";

      const addOption = (value, text, selected) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        if (selected) opt.selected = true;
        select.appendChild(opt);
      };

      if (!opciones.length) {
        select.disabled = true;
        addOption("", `Sin categorías creadas para esta marca en ${FIELD_AGG_META[agg].label}`, true);
        if (draftVal) addOption(draftVal, `${draftVal} (valor actual, fuera del maestro)`, true);
      } else {
        addOption("", "Selecciona una categoría…", !draftVal);
        opciones.forEach((c) => addOption(c.nombre, c.nombre, c.nombre === draftVal));
        if (draftVal && !opciones.some((c) => c.nombre === draftVal)) {
          addOption(draftVal, `${draftVal} (valor actual, fuera del maestro)`, true);
        }
      }

      dot.classList.toggle("hidden", String(draftVal) === String(savedVal));

      const autoKeys = [...(field.alsoSets || []), ...(field.ordenSets ? [field.ordenSets] : [])];
      if (autoKeys.length) {
        const nota = document.createElement("p");
        nota.className = "text-[11px] text-slate-400 mt-1";
        nota.textContent = `Completa automáticamente: ${autoKeys
          .filter((k) => (PRODUCT_FIELDS.find((f) => f.key === k) || {}).aggregators.includes(agg))
          .map((k) => (PRODUCT_FIELDS.find((f) => f.key === k) || {}).label)
          .join(", ")}`;
        left.appendChild(nota);
      }

      select.addEventListener("change", () => {
        state.preview.draft[agg] = state.preview.draft[agg] || {};
        state.preview.draft[agg][field.key] = select.value;
        (field.alsoSets || []).forEach((otherKey) => {
          const otherField = PRODUCT_FIELDS.find((f) => f.key === otherKey);
          if (otherField && otherField.aggregators.includes(agg)) {
            state.preview.draft[agg][otherKey] = select.value;
          }
        });
        if (field.ordenSets) {
          const orderField = PRODUCT_FIELDS.find((f) => f.key === field.ordenSets);
          if (orderField && orderField.aggregators.includes(agg)) {
            const posicion = opciones.findIndex((c) => c.nombre === select.value);
            state.preview.draft[agg][field.ordenSets] = posicion >= 0 ? posicion + 1 : "";
          }
        }
        const nowSaved = fieldValueFrom(state.preview.campos, field.key, agg);
        dot.classList.toggle("hidden", String(select.value) === String(nowSaved));
        updateSaveButtonState();
      });

      right.appendChild(select);
    } else {
      const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
      if (field.type !== "textarea") input.type = field.type;
      input.className = "cfg-input w-full";
      if (field.type === "textarea") input.rows = 2;
      input.value = draftVal;

      dot.classList.toggle("hidden", String(draftVal) === String(savedVal));

      input.addEventListener("input", () => {
        state.preview.draft[agg] = state.preview.draft[agg] || {};
        state.preview.draft[agg][field.key] = input.value;
        const nowSaved = fieldValueFrom(state.preview.campos, field.key, agg);
        dot.classList.toggle("hidden", String(input.value) === String(nowSaved));
        updateSaveButtonState();
        if (agg === state.preview.aggregator && ["Imagen", "DescripcionProductoPadre", "DescripcionProductoPadreLlamaFood", "PrecioPadre"].includes(field.key)) {
          renderPreviewMockup();
        }
      });

      right.appendChild(input);
    }

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  // ---- Opciones / Preguntas: bloques de datos (grupos de combo o subgrupos
  // de condimentos), independientes de cómo se rendericen ---- //
  function buildPreguntaBloques(raw) {
    if (raw.type === "COMBO") {
      return (raw.groups || []).map((group) => ({
        code: String(group.code),
        principal: !!group.principal,
        titulo: preguntaDisplayName(group.code, group.name),
        items: (group.items || []).map((it) => ({ code: it.code, name: it.name, price: it.price })),
      }));
    }
    const subgrupos = {};
    const orden = [];
    (raw.condiments || []).forEach((c) => {
      const key = String(c.subgroup_code || c.subgroup_name || "otros");
      if (!subgrupos[key]) {
        subgrupos[key] = { code: c.subgroup_code, name: c.subgroup_name, items: [] };
        orden.push(key);
      }
      subgrupos[key].items.push(c);
    });
    return orden.map((key) => ({
      code: key,
      principal: false,
      titulo: preguntaDisplayName(subgrupos[key].code, subgrupos[key].name),
      items: subgrupos[key].items.map((it) => ({ code: it.code, name: it.name, price: it.price })),
    }));
  }

  // ---- Opciones / Preguntas: contenido compartido entre el modal (Vista
  // previa, solo lectura) y el editor de pantalla completa (Vista previa 2,
  // donde además se puede reordenar). El grupo "Principal" (antes llamado
  // "Obligatorio") siempre va primero y nunca se puede mover. ---- //
  function fillOpcionesPanel(panel, editable) {
    const raw = state.preview.rawProduct || {};
    const bloques = buildPreguntaBloques(raw);

    if (!bloques.length) {
      panel.innerHTML = raw.type === "COMBO"
        ? '<p class="text-xs text-slate-400">Este combo no tiene grupos de opciones.</p>'
        : '<p class="text-xs text-slate-400">Este producto no tiene extras o condimentos configurados.</p>';
      return;
    }

    const porCodigo = new Map(bloques.map((b) => [b.code, b]));
    const orden = state.preview.preguntasOrdenDraft.length
      ? state.preview.preguntasOrdenDraft.filter((c) => porCodigo.has(c))
      : bloques.map((b) => b.code);
    // Por si algún bloque no estuviera en el orden guardado (dato nuevo).
    bloques.forEach((b) => { if (!orden.includes(b.code)) orden.push(b.code); });

    orden.forEach((code) => {
      const bloque = porCodigo.get(code);
      if (bloque) panel.appendChild(buildPreguntaCard(bloque, editable));
    });

    if (editable) updatePreguntaOrderButtons(panel);
  }

  function buildPreguntaCard(bloque, editable) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl border border-slate-200 p-4";
    card.dataset.preguntaCode = bloque.code;
    if (bloque.principal) card.dataset.preguntaPrincipal = "1";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2 mb-2";

    const left = document.createElement("div");
    left.className = "flex items-center gap-2 min-w-0";
    const movible = editable && !bloque.principal;

    if (movible) {
      const handle = document.createElement("span");
      handle.className = "pregunta-drag-handle";
      handle.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`;
      left.appendChild(handle);
    }

    const title = document.createElement("p");
    title.className = "text-sm font-semibold text-slate-700 truncate";
    title.textContent = (bloque.principal ? "★ " : "") + bloque.titulo;
    left.appendChild(title);
    header.appendChild(left);

    const right = document.createElement("div");
    right.className = "flex items-center gap-2 shrink-0";
    if (bloque.principal) {
      const badge = document.createElement("span");
      badge.className = "type-badge combo shrink-0";
      badge.textContent = "Principal";
      right.appendChild(badge);
    }
    if (movible) {
      const orderWrap = document.createElement("div");
      orderWrap.className = "pregunta-order-buttons";
      orderWrap.innerHTML = `
        <button type="button" class="pregunta-up" title="Subir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 15 7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="pregunta-down" title="Bajar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 9 7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      `;
      right.appendChild(orderWrap);
    }
    header.appendChild(right);
    card.appendChild(header);

    const agg = state.preview.aggregator;
    const list = document.createElement("div");
    list.className = "space-y-0.5";
    bloque.items.forEach((item) => {
      const hijoCode = item.code !== undefined && item.code !== null ? String(item.code) : "";
      const itemRow = document.createElement("div");
      itemRow.className = "pregunta-item-row";

      const top = document.createElement("div");
      top.className = "pregunta-item-top";
      const imagenGuardada = hijoCode && agg ? hijoImagenValor(state.preview.hijoCampos, agg, hijoCode) : "";
      top.innerHTML =
        (imagenGuardada
          ? `<img class="pregunta-item-thumb" src="${String(imagenGuardada).replace(/"/g, "&quot;")}" alt="" onerror="this.style.display='none'" />`
          : "") +
        `<span class="truncate">${(item.name || "").replace(/</g, "&lt;")}</span><span>${fmtPrice(item.price)}</span>`;
      itemRow.appendChild(top);

      list.appendChild(itemRow);
    });
    card.appendChild(list);

    if (movible) {
      card.classList.add("pregunta-draggable");
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        if (e.target.closest(".pregunta-item-imagen")) {
          e.preventDefault();
          return;
        }
        preguntaDragState = { code: bloque.code };
        card.classList.add("pregunta-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", bloque.code);
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("pregunta-dragging");
        finalizePreguntaDrag(card.parentElement);
      });
      card.querySelector(".pregunta-up").addEventListener("click", () => movePreguntaCard(card, "up"));
      card.querySelector(".pregunta-down").addEventListener("click", () => movePreguntaCard(card, "down"));
    }

    return card;
  }

  // ---- Reordenar preguntas: arrastre (con la misma técnica que Previsualizar
  // carta) + botones subir/bajar como alternativa. Nunca se autoguarda: solo
  // actualiza el borrador (state.preview.preguntasOrdenDraft); el guardado
  // real ocurre al hacer clic en "Guardar cambios". ---- //
  let preguntaDragState = null;
  let preguntaDragRafId = null;
  let preguntaDragPending = null;

  function enforcePrincipalFirst(panel) {
    const principal = panel.querySelector('[data-pregunta-principal="1"]');
    if (principal && panel.firstElementChild !== principal) {
      panel.insertBefore(principal, panel.firstElementChild);
    }
  }

  function preguntaCardAtPoint(panel, x, y) {
    const el = document.elementFromPoint(x, y);
    const card = el && el.closest("[data-pregunta-code]");
    if (!card || card.classList.contains("pregunta-dragging") || !panel.contains(card)) return null;
    return card;
  }

  function applyPreguntaReorder(panel, x, y) {
    const dragging = panel.querySelector(".pregunta-dragging");
    if (!dragging) return;
    const overCard = preguntaCardAtPoint(panel, x, y);
    if (!overCard || overCard === dragging) {
      panel.appendChild(dragging);
    } else {
      const box = overCard.getBoundingClientRect();
      const before = y - box.top < box.height / 2;
      panel.insertBefore(dragging, before ? overCard : overCard.nextSibling);
    }
    enforcePrincipalFirst(panel);
    updatePreguntaOrderButtons(panel);
  }

  function schedulePreguntaReorder(panel, x, y) {
    preguntaDragPending = { panel, x, y };
    if (preguntaDragRafId) return;
    preguntaDragRafId = requestAnimationFrame(() => {
      preguntaDragRafId = null;
      const pending = preguntaDragPending;
      preguntaDragPending = null;
      if (pending) applyPreguntaReorder(pending.panel, pending.x, pending.y);
    });
  }

  function makePreguntasPanelDroppable(panel) {
    panel.addEventListener("dragover", (e) => {
      if (!preguntaDragState) return;
      e.preventDefault();
      schedulePreguntaReorder(panel, e.clientX, e.clientY);
    });
    panel.addEventListener("drop", (e) => e.preventDefault());
  }

  function movePreguntaCard(card, direction) {
    const panel = card.parentElement;
    const sibling = direction === "up" ? card.previousElementSibling : card.nextElementSibling;
    if (!sibling || sibling.dataset.preguntaPrincipal === "1") return;
    if (direction === "up") panel.insertBefore(card, sibling);
    else panel.insertBefore(sibling, card);
    updatePreguntaOrderButtons(panel);
    syncPreguntasOrdenFromDom(panel);
  }

  function updatePreguntaOrderButtons(panel) {
    const movibles = [...panel.querySelectorAll(".pregunta-draggable")];
    movibles.forEach((card, idx) => {
      const upBtn = card.querySelector(".pregunta-up");
      const downBtn = card.querySelector(".pregunta-down");
      if (upBtn) upBtn.disabled = idx === 0;
      if (downBtn) downBtn.disabled = idx === movibles.length - 1;
    });
  }

  function syncPreguntasOrdenFromDom(panel) {
    state.preview.preguntasOrdenDraft = [...panel.querySelectorAll("[data-pregunta-code]")].map(
      (el) => el.dataset.preguntaCode
    );
    updateSaveButtonState();
  }

  function finalizePreguntaDrag(panel) {
    if (preguntaDragRafId) {
      cancelAnimationFrame(preguntaDragRafId);
      preguntaDragRafId = null;
      preguntaDragPending = null;
    }
    if (!preguntaDragState) return;
    preguntaDragState = null;
    syncPreguntasOrdenFromDom(panel);
  }

  // ---- Opciones / Preguntas: pestaña del modal (Vista previa, solo lectura) ---- //
  function renderOpcionesPanelModal() {
    const panel = els.previewTabPanels.querySelector('.preview-tab-panel[data-tab="opciones"]');
    panel.innerHTML = "";
    fillOpcionesPanel(panel, false);
  }

  // ---- Opciones / Preguntas: acordeón de Vista previa 2 (reordenable) ---- //
  function renderOpcionesPanelV2() {
    els2.previewOpcionesCountBadge.textContent = `(${state.preview.opcionesCount})`;
    const panel = els2.previewOpcionesPanel;
    panel.innerHTML = "";
    fillOpcionesPanel(panel, true);
  }

  // ---- Publicado en / Agregadores: pestaña del modal (Vista previa) ---- //
  function renderAgregadoresPanelModal() {
    const panel = els.previewTabPanels.querySelector('.preview-tab-panel[data-tab="agregadores"]');
    panel.innerHTML = "";
    const producto = state.preview.producto || {};
    const canal = producto.canal || "";

    const intro = document.createElement("p");
    intro.className = "text-xs text-slate-400 mb-3";
    intro.textContent = canal
      ? `Canal en Oracle Simphony (NGR_Carta): "${canal}"`
      : "Este producto no tiene NGR_Carta configurado en Oracle Simphony, por lo tanto no se publica en ningún agregador.";
    panel.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-2 sm:grid-cols-4 gap-2";
    Object.keys(AGGREGATOR_META).forEach((code) => {
      const meta = AGGREGATOR_META[code];
      const published = canalIncludesAggregator(canal, code);
      const chip = document.createElement("div");
      chip.className = "info-chip" + (published ? " published" : "");
      if (published) chip.style.background = meta.color;
      chip.innerHTML = `<span>${published ? "✓" : "—"}</span><span>${meta.label}</span>`;
      grid.appendChild(chip);
    });
    panel.appendChild(grid);
  }

  // ---- Publicado en: acordeón de Vista previa 2 ---- //
  function renderAgregadoresPanelV2() {
    const producto = state.preview.producto || {};
    const canal = producto.canal || "";
    const publicados = Object.keys(AGGREGATOR_META).filter((code) => canalIncludesAggregator(canal, code));
    els2.previewAggCount.textContent = `(${publicados.length}/${Object.keys(AGGREGATOR_META).length})`;

    const panel = els2.previewAgregadoresPanel;
    panel.innerHTML = "";
    const intro = document.createElement("p");
    intro.className = "text-[11px] text-slate-400 mb-3";
    intro.textContent = canal
      ? `Canal en Oracle Simphony (NGR_Carta): "${canal}"`
      : "Este producto no tiene NGR_Carta configurado en Oracle Simphony, por lo tanto no se publica en ningún agregador.";
    panel.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-2 gap-2";
    Object.keys(AGGREGATOR_META).forEach((code) => {
      const meta = AGGREGATOR_META[code];
      const published = canalIncludesAggregator(canal, code);
      const chip = document.createElement("div");
      chip.className = "info-chip" + (published ? " published" : "");
      if (published) chip.style.background = meta.color;
      chip.innerHTML = `<span>${published ? "✓" : "—"}</span><span>${meta.label}</span>`;
      grid.appendChild(chip);
    });
    panel.appendChild(grid);
  }

  // ---- Vista previa (mockup en vivo): solo existe en el modal (Vista previa);
  // Vista previa 2 no tiene esta columna, así que estas funciones no hacen
  // nada si previewTarget no tiene esos elementos. ---- //
  function renderDeviceToggle() {
    if (!previewTarget.previewDeviceToggle) return;
    previewTarget.previewDeviceToggle.innerHTML = "";
    const options = [
      { key: "mobile", label: "Móvil", icon: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2" stroke-linecap="round"/></svg>' },
      { key: "desktop", label: "Escritorio", icon: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3" stroke-linecap="round"/></svg>' },
    ];
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "device-toggle-btn" + (state.preview.device === opt.key ? " active" : "");
      btn.title = opt.label;
      btn.innerHTML = opt.icon;
      btn.addEventListener("click", () => {
        state.preview.device = opt.key;
        previewTarget.previewMockupCard.style.maxWidth = opt.key === "desktop" ? "26rem" : "20rem";
        renderDeviceToggle();
      });
      previewTarget.previewDeviceToggle.appendChild(btn);
    });
  }

  function renderPreviewMockup() {
    if (!previewTarget.previewMockupTitle) return;
    const agg = state.preview.aggregator;
    if (!agg) {
      previewTarget.previewMockupTitle.textContent = "Vista previa";
      previewTarget.previewMockupImage.textContent = "Sin imagen";
      previewTarget.previewMockupName.textContent = state.preview.producto?.name || "(Sin nombre)";
      previewTarget.previewMockupDesc.textContent = "Este producto no se publica en ningún agregador (sin NGR_Carta configurado).";
      previewTarget.previewMockupPrice.textContent = "—";
      previewTarget.previewMockupIncludesWrap.classList.add("hidden");
      previewTarget.previewMockupCta.style.background = "#94a3b8";
      return;
    }
    const meta = FIELD_AGG_META[agg];
    previewTarget.previewMockupTitle.textContent = `Vista previa (${meta.label})`;

    const imagen = fieldValueFrom(state.preview.draft, "Imagen", agg);
    if (imagen) {
      previewTarget.previewMockupImage.innerHTML = `<img src="${imagen}" alt="" class="w-full h-full object-cover" onerror="this.parentElement.textContent='Imagen no disponible';" />`;
    } else {
      previewTarget.previewMockupImage.textContent = "Sin imagen";
    }

    previewTarget.previewMockupName.textContent = fieldValueFrom(state.preview.draft, "ProductoPadre", agg) || "(Sin nombre)";

    const desc = agg === "LLAMAFOOD"
      ? (fieldValueFrom(state.preview.draft, "DescripcionProductoPadreLlamaFood", agg) || fieldValueFrom(state.preview.draft, "DescripcionProductoPadre", agg))
      : fieldValueFrom(state.preview.draft, "DescripcionProductoPadre", agg);
    previewTarget.previewMockupDesc.textContent = desc || "Sin descripción comercial todavía.";

    const precio = fieldValueFrom(state.preview.draft, "PrecioPadre", agg);
    previewTarget.previewMockupPrice.textContent = precio !== "" && precio !== null ? fmtPrice(precio) : "—";

    const raw = state.preview.rawProduct;
    let items = [];
    let listTitle = "Incluye";
    if (raw && raw.type === "COMBO" && raw.groups && raw.groups.length) {
      const seen = new Set();
      raw.groups.forEach((g) => (g.items || []).forEach((it) => {
        if (it.name && !seen.has(it.name)) { seen.add(it.name); items.push(it.name); }
      }));
    } else if (raw && raw.condiments && raw.condiments.length) {
      listTitle = "Extras disponibles";
      const seen = new Set();
      raw.condiments.forEach((c) => {
        if (c.name && !seen.has(c.name)) { seen.add(c.name); items.push(c.name); }
      });
    }

    if (items.length) {
      previewTarget.previewMockupIncludesTitle.textContent = listTitle;
      previewTarget.previewMockupIncludes.innerHTML = "";
      items.slice(0, 6).forEach((name) => {
        const li = document.createElement("li");
        li.textContent = `• ${name}`;
        previewTarget.previewMockupIncludes.appendChild(li);
      });
      if (items.length > 6) {
        const li = document.createElement("li");
        li.className = "text-slate-400";
        li.textContent = `+ ${items.length - 6} más`;
        previewTarget.previewMockupIncludes.appendChild(li);
      }
      previewTarget.previewMockupIncludesWrap.classList.remove("hidden");
    } else {
      previewTarget.previewMockupIncludesWrap.classList.add("hidden");
    }

    previewTarget.previewMockupCta.style.background = meta.color;
  }

  // ------------------------------------------------------------------ //
  // Eventos globales
  // ------------------------------------------------------------------ //
  els.search.addEventListener("input", renderResults);
  els.btnRefresh.addEventListener("click", refreshCurrent);
  els.catalogMarcaSelect.addEventListener("change", async () => {
    state.selectedMarca = els.catalogMarcaSelect.value;
    updateCatalogMarcaGate();
    if (state.selectedMarca && state.activeTab) {
      await fetchMenu(state.activeTab, false);
    }
  });
  [...els.catalogSubviewTabs.children].forEach((btn) => {
    btn.addEventListener("click", () => switchCatalogSubview(btn.dataset.subview));
  });
  els.btnSettings.addEventListener("click", openConfigModal);
  els.btnCloseConfig.addEventListener("click", closeConfigModal);
  els.btnCancelConfig.addEventListener("click", closeConfigModal);
  els.configForm.addEventListener("submit", submitConfig);
  els.configOverlay.addEventListener("click", (e) => {
    if (e.target === els.configOverlay) closeConfigModal();
  });

  els.navViewButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  els.collapseBtn.addEventListener("click", () => {
    els.sidebar.classList.toggle("collapsed");
  });

  // ------------------------------------------------------------------ //
  // Sidebar como menú deslizable en móvil (< 880px): se abre con el botón
  // hamburguesa del topbar y se cierra tocando el fondo oscuro o eligiendo
  // una opción de navegación. Al volver a escritorio se limpia cualquier
  // estado de móvil que haya quedado (drawer abierto / colapsado heredado).
  // ------------------------------------------------------------------ //
  const mobileNavQuery = window.matchMedia("(max-width: 880px)");

  function openMobileSidebar() {
    els.sidebar.classList.add("mobile-open");
    els.sidebarBackdrop.classList.add("visible");
  }
  function closeMobileSidebar() {
    els.sidebar.classList.remove("mobile-open");
    els.sidebarBackdrop.classList.remove("visible");
  }

  els.btnMenuToggle.addEventListener("click", openMobileSidebar);
  els.sidebarBackdrop.addEventListener("click", closeMobileSidebar);
  els.sidebar.addEventListener("click", (e) => {
    if (mobileNavQuery.matches && e.target.closest(".nav-item")) {
      closeMobileSidebar();
    }
  });
  mobileNavQuery.addEventListener("change", (e) => {
    if (e.matches) {
      els.sidebar.classList.remove("collapsed");
    } else {
      closeMobileSidebar();
    }
  });

  async function refreshCurrent() {
    if (state.currentView === "catalog" && state.activeTab && state.selectedMarca) {
      await fetchMenu(state.activeTab, true);
    } else {
      els.refreshIcon.classList.add("animate-spin");
      await loadAggregatorSummary();
      els.refreshIcon.classList.remove("animate-spin");
    }
  }

  els.preguntasSearch.addEventListener("input", renderPreguntas);
  els.preguntasMarcaSelect.addEventListener("change", async () => {
    state.preguntasMarca = els.preguntasMarcaSelect.value;
    state.preguntasLoaded = false;
    updatePreguntasMarcaGate();
    if (state.preguntasMarca) {
      await loadPreguntas();
    }
  });

  els.btnNuevaCategoria.addEventListener("click", () => {
    els.formCategoria.classList.toggle("hidden");
  });
  els.btnCancelarCategoria.addEventListener("click", () => {
    els.formCategoria.reset();
    els.formCategoria.classList.add("hidden");
  });
  els.formCategoria.addEventListener("submit", submitCategoria);
  els.filtroMarca.addEventListener("change", renderCategorias);
  els.filtroAgregador.addEventListener("change", renderCategorias);

  els.btnNuevaCarta.addEventListener("click", () => {
    const abriendo = els.formCarta.classList.contains("hidden");
    els.formCarta.classList.toggle("hidden");
    if (abriendo && state.cartasMarca) {
      els.formCarta.elements.namedItem("marca").value = state.cartasMarca;
    }
  });
  els.btnCancelarCarta.addEventListener("click", () => {
    els.formCarta.reset();
    els.formCarta.classList.add("hidden");
  });
  els.formCarta.addEventListener("submit", submitCarta);
  els.filtroCartaBusqueda.addEventListener("input", renderCartasMaestro);
  els.filtroCartaAgregador.addEventListener("change", renderCartasMaestro);

  els.cartasMarcaSelect.addEventListener("change", () => {
    state.cartasMarca = els.cartasMarcaSelect.value;
    updateCartasMarcaGate();
    renderCartasMaestro();
    populateCartaSelect(els.asociarCartaSelect);
    populateCartaSelect(els.preview2CartaSelect);
    // La carta elegida en "Asociar productos"/"Previsualizar" puede no
    // pertenecer a la nueva marca — resetear esos paneles a su estado vacío.
    state.asociarCarta = { carta: null, catalogo: null, filtro: "todos" };
    els.asociarPanel.classList.add("hidden");
    els.asociarSinCarta.classList.remove("hidden");
    state.previewCarta = { carta: null };
    els.preview2.classList.add("hidden");
    els.preview2SinProductos.classList.add("hidden");
    els.preview2SinCarta.classList.remove("hidden");
  });

  [...els.cartasSubviewTabs.children].forEach((btn) => {
    btn.addEventListener("click", () => switchCartasSubview(btn.dataset.subview));
  });

  els.asociarCartaSelect.addEventListener("change", () => {
    const carta = state.cartasMaestro.find((c) => String(c.id) === els.asociarCartaSelect.value);
    if (carta) {
      selectAsociarCarta(carta);
    } else {
      state.asociarCarta = { carta: null, catalogo: null, filtro: "todos" };
      els.asociarPanel.classList.add("hidden");
      els.asociarSinCarta.classList.remove("hidden");
    }
  });
  els.asociarSearch.addEventListener("input", renderAsociarList);
  els.asociarTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.classList.contains("active")) return;
      els.asociarTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.asociarCarta.filtro = tab.dataset.filter;
      renderAsociarList();
    });
  });

  els.preview2CartaSelect.addEventListener("change", () => {
    const carta = state.cartasMaestro.find((c) => String(c.id) === els.preview2CartaSelect.value);
    if (carta) {
      selectPreviewCarta(carta);
    } else {
      state.previewCarta = { carta: null };
      els.preview2.classList.add("hidden");
      els.preview2SinProductos.classList.add("hidden");
      els.preview2SinCarta.classList.remove("hidden");
    }
  });

  els.btnClosePreview.addEventListener("click", closePreview);
  els.btnCancelPreview.addEventListener("click", closePreview);
  els.btnSavePreview.addEventListener("click", doSaveAll);
  els.previewOverlay.addEventListener("click", (e) => {
    if (e.target === els.previewOverlay) closePreview();
  });
  els.btnConfirmarSts.addEventListener("click", doConfirmarSts);
  els.btnIntegrar.addEventListener("click", doIntegrar);
  els.btnDesintegrar.addEventListener("click", doDesintegrar);

  els2.btnClosePreview.addEventListener("click", closePreview);
  els2.btnCancelPreview.addEventListener("click", closePreview);
  els2.btnSavePreview.addEventListener("click", doSaveAll);
  els2.previewOverlay.addEventListener("click", (e) => {
    if (e.target === els2.previewOverlay) closePreview();
  });
  els2.btnConfirmarSts.addEventListener("click", doConfirmarSts);
  els2.btnIntegrar.addEventListener("click", doIntegrar);
  els2.btnDesintegrar.addEventListener("click", doDesintegrar);
  // El panel persiste entre renders (solo se limpia su innerHTML), así que el
  // listener de arrastre se registra una sola vez acá y no en cada render.
  makePreguntasPanelDroppable(els2.previewOpcionesPanel);

  // ------------------------------------------------------------------ //
  // Init
  // ------------------------------------------------------------------ //
  (async function init() {
    await Promise.all([loadConfig(), loadPreguntasComerciales(), loadMarcas()]);
    populateAgregadorSelects();
    populateCatalogMarcaOptions();
    state.activeTab = state.aggregators[0];
    renderNavAggregators();
    await switchView("resumen");
  })();
})();
