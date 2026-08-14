#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backend Flask de la POC "Carta Digital".

Un solo proceso: sirve el front estático y expone un puñado de
endpoints que hacen de proxy hacia Oracle Simphony STS (para no
exponer el token en el navegador y evitar problemas de CORS).

Ejecutar:  python backend/app.py   ->  http://localhost:5000
"""

import time
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import sts_client as sts
import store

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")

_cache = {"tree": None, "by_code": {}, "channels": [], "fetched_at": None, "raw_meta": None}
_CACHE_TTL_SECONDS = 300


def _cache_is_fresh():
    if _cache["tree"] is None or _cache["fetched_at"] is None:
        return False
    return (time.time() - _cache["fetched_at"]) < _CACHE_TTL_SECONDS


def _refresh_cache(config):
    raw = sts.fetch_menu_raw(config)
    tree = sts.build_catalog_tree(raw, config)
    _cache["tree"] = tree
    _cache["by_code"] = {str(p.get("code")): p for p in tree}
    _cache["channels"] = sts.distinct_channels(tree)
    _cache["fetched_at"] = time.time()
    _cache["raw_meta"] = {
        "combos": sum(1 for p in tree if p["type"] == "COMBO"),
        "productos": sum(1 for p in tree if p["type"] == "PRODUCTO"),
    }


# ------------------------------------------------------------------ #
# Front estático
# ------------------------------------------------------------------ #
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


# ------------------------------------------------------------------ #
# Configuración de conexión
# ------------------------------------------------------------------ #
@app.route("/api/config", methods=["GET"])
def get_config():
    config = sts.load_config()
    return jsonify(sts.public_config(config))


@app.route("/api/config", methods=["POST"])
def update_config():
    body = request.get_json(force=True, silent=True) or {}
    config = sts.load_config()

    editable_fields = [
        "base_url", "endpoint", "org", "timeout", "max_retries",
        "org_short_name", "env_locRef", "locRef",
        "idioma_es", "idioma_en", "aggregators",
    ]
    for field in editable_fields:
        if field in body:
            config[field] = body[field]

    # El token solo se pisa si mandan uno nuevo no vacío
    # (el front lo muestra enmascarado, así que un valor vacío significa "sin cambios").
    new_token = body.get("token")
    if new_token:
        config["token"] = new_token

    sts.save_config(config)
    _cache["tree"] = None  # invalida cache: próxima consulta trae datos frescos
    return jsonify(sts.public_config(config))


# ------------------------------------------------------------------ #
# Menú / productos
# ------------------------------------------------------------------ #
@app.route("/api/menu", methods=["GET"])
def get_menu():
    # "marca" identifica la marca elegida en el front (ver Catálogo > selector
    # de marca). Esta POC tiene una sola conexión/config de Oracle Simphony
    # para todas las marcas, así que por ahora el parámetro solo se recibe y
    # se refleja en la respuesta sin cambiar la config usada.
    #
    # Cuando cada marca tenga su propio servicio STS, este es el punto donde
    # se debe resolver la config según "marca" (por ejemplo,
    # sts.load_config(marca) en vez de sts.load_config()) antes de consultar.
    marca = (request.args.get("marca") or "").strip()

    config = sts.load_config()
    force_refresh = request.args.get("refresh") == "1"
    channel = request.args.get("channel")

    if force_refresh or not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    tree = _cache["tree"] or []
    if channel:
        tree = sts.filter_by_aggregator(tree, channel)

    return jsonify({
        "products": tree,
        "channels_detected": _cache["channels"],
        "aggregators": config.get("aggregators", sts.DEFAULT_AGGREGATORS),
        "fetched_at": _cache["fetched_at"],
        "meta": _cache["raw_meta"],
        "marca": marca,
    })


# ------------------------------------------------------------------ #
# Maestro de preguntas (comboGroups de Oracle + pregunta comercial)
# ------------------------------------------------------------------ #
@app.route("/api/preguntas", methods=["GET"])
def get_preguntas():
    # "marca": mismo patrón que /api/menu — esta POC tiene una sola conexión
    # de Oracle Simphony para todas las marcas, así que por ahora el
    # parámetro solo se recibe y se refleja en la respuesta sin filtrar
    # nada. Cuando cada marca tenga su propio servicio STS, este es el
    # punto donde se debe resolver la config según "marca".
    marca = (request.args.get("marca") or "").strip()

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    preguntas = sts.distinct_questions(_cache["tree"] or [])
    comerciales = store.load_preguntas_comerciales()
    cantidades = store.load_preguntas_cantidad()
    for p in preguntas:
        p["pregunta_comercial"] = comerciales.get(p["code"], "")
        p["cantidad_maxima"] = cantidades.get(p["code"])

    return jsonify({"preguntas": preguntas, "marca": marca})


@app.route("/api/preguntas/<code>", methods=["POST"])
def set_pregunta_comercial(code):
    body = request.get_json(force=True, silent=True) or {}
    texto = (body.get("pregunta_comercial") or "").strip()
    try:
        cantidad = int(body.get("cantidad_maxima"))
    except (TypeError, ValueError):
        cantidad = 0
    if cantidad <= 0:
        return jsonify({"error": "La cantidad debe ser un número mayor a 0."}), 400

    valor = store.save_pregunta_comercial(code, texto)
    cantidad_guardada = store.save_pregunta_cantidad(code, cantidad)
    return jsonify({"code": code, "pregunta_comercial": valor, "cantidad_maxima": cantidad_guardada})


@app.route("/api/preguntas-comerciales", methods=["GET"])
def get_preguntas_comerciales_map():
    """Mapa liviano {codigo: pregunta_comercial} sin depender del catálogo de Oracle.

    Se usa para mostrar la pregunta comercial (con fallback al nombre de Oracle)
    en cualquier pantalla que muestre grupos/preguntas de un producto.
    """
    return jsonify(store.load_preguntas_comerciales())


# ------------------------------------------------------------------ #
# Marcas (independientes de si ya tienen categorías o no)
# ------------------------------------------------------------------ #
@app.route("/api/marcas", methods=["GET"])
def get_marcas():
    return jsonify({"marcas": store.load_marcas()})


@app.route("/api/marcas", methods=["POST"])
def post_marca():
    body = request.get_json(force=True, silent=True) or {}
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "nombre es obligatorio"}), 400
    return jsonify({"marcas": store.create_marca(nombre)}), 201


# ------------------------------------------------------------------ #
# Maestro de categorías / subcategorías (por marca y agregador)
# ------------------------------------------------------------------ #
@app.route("/api/categorias", methods=["GET"])
def get_categorias():
    return jsonify({"categorias": store.load_categorias()})


@app.route("/api/categorias", methods=["POST"])
def post_categoria():
    body = request.get_json(force=True, silent=True) or {}
    nombre = (body.get("nombre") or "").strip()
    marca = (body.get("marca") or "").strip()
    agregador = (body.get("agregador") or "").strip().upper()
    if not nombre or not marca or not agregador:
        return jsonify({"error": "nombre, marca y agregador son obligatorios"}), 400
    return jsonify(store.create_categoria(nombre, marca, agregador)), 201


@app.route("/api/categorias/<int:cat_id>", methods=["PUT"])
def put_categoria(cat_id):
    body = request.get_json(force=True, silent=True) or {}
    agregador = body.get("agregador")
    try:
        cat = store.update_categoria(
            cat_id,
            nombre=body.get("nombre"),
            marca=body.get("marca"),
            agregador=agregador.strip().upper() if agregador else None,
            activo=body.get("activo"),
        )
    except store.NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(cat)


@app.route("/api/categorias/orden", methods=["PUT"])
def put_categorias_orden():
    """Reordena las categorías de una (marca, agregador); ver store.reorder_categorias."""
    body = request.get_json(force=True, silent=True) or {}
    marca = (body.get("marca") or "").strip()
    agregador = (body.get("agregador") or "").strip().upper()
    ids = body.get("ids")
    if not marca or not agregador or not isinstance(ids, list):
        return jsonify({"error": "marca, agregador e ids (lista) son obligatorios"}), 400
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "ids debe ser una lista de números"}), 400
    categorias = store.reorder_categorias(marca, agregador, ids)
    return jsonify({"categorias": categorias})


@app.route("/api/categorias/<int:cat_id>/subcategorias", methods=["POST"])
def post_subcategoria(cat_id):
    body = request.get_json(force=True, silent=True) or {}
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "nombre es obligatorio"}), 400
    try:
        sub = store.create_subcategoria(cat_id, nombre)
    except store.NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(sub), 201


@app.route("/api/categorias/<int:cat_id>/subcategorias/<int:sub_id>", methods=["PUT"])
def put_subcategoria(cat_id, sub_id):
    body = request.get_json(force=True, silent=True) or {}
    try:
        sub = store.update_subcategoria(
            cat_id, sub_id,
            nombre=body.get("nombre"),
            activo=body.get("activo"),
        )
    except store.NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(sub)


# ------------------------------------------------------------------ #
# "Carta" (previsualización): productos asignados a cada categoría y su orden
# ------------------------------------------------------------------ #
@app.route("/api/carta", methods=["GET"])
def get_carta():
    return jsonify({"asignaciones": store.load_carta()})


@app.route("/api/carta/categorias/<int:cat_id>", methods=["PUT"])
def put_carta_categoria(cat_id):
    body = request.get_json(force=True, silent=True) or {}
    codigos = body.get("codigos")
    if not isinstance(codigos, list):
        return jsonify({"error": "codigos debe ser una lista"}), 400
    return jsonify({"asignaciones": store.set_carta_categoria(cat_id, codigos)})


# ------------------------------------------------------------------ #
# Maestro de cartas por agregador: cartas nombradas (marca + agregador)
# con un subconjunto de productos del catálogo y un flag "integrable"
# por producto (ver store.set_carta_maestro_productos).
# ------------------------------------------------------------------ #
@app.route("/api/cartas-maestro", methods=["GET"])
def get_cartas_maestro():
    return jsonify({"cartas": store.load_cartas_maestro()})


@app.route("/api/cartas-maestro", methods=["POST"])
def post_carta_maestro():
    body = request.get_json(force=True, silent=True) or {}
    nombre = (body.get("nombre") or "").strip()
    marca = (body.get("marca") or "").strip()
    agregador = (body.get("agregador") or "").strip().upper()
    if not nombre or not marca or not agregador:
        return jsonify({"error": "nombre, marca y agregador son obligatorios"}), 400
    return jsonify(store.create_carta_maestro(nombre, marca, agregador)), 201


@app.route("/api/cartas-maestro/<int:carta_id>", methods=["PUT"])
def put_carta_maestro(carta_id):
    body = request.get_json(force=True, silent=True) or {}
    agregador = body.get("agregador")
    try:
        carta = store.update_carta_maestro(
            carta_id,
            nombre=body.get("nombre"),
            marca=body.get("marca"),
            agregador=agregador.strip().upper() if agregador else None,
            activo=body.get("activo"),
        )
    except store.NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(carta)


@app.route("/api/cartas-maestro/<int:carta_id>/productos", methods=["PUT"])
def put_carta_maestro_productos(carta_id):
    """Reemplaza el listado completo de productos asociados a la carta.

    body: {"productos": [{"code": ..., "integrable": bool}, ...]}
    """
    body = request.get_json(force=True, silent=True) or {}
    productos = body.get("productos")
    if not isinstance(productos, list):
        return jsonify({"error": "productos debe ser una lista"}), 400
    try:
        carta = store.set_carta_maestro_productos(carta_id, productos)
    except store.NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(carta)


# ------------------------------------------------------------------ #
# Orden de preguntas (Opciones / Preguntas) dentro del editor de producto
# ------------------------------------------------------------------ #
@app.route("/api/productos/<code>/preguntas-orden", methods=["GET"])
def get_producto_preguntas_orden(code):
    return jsonify({"orden": store.get_pregunta_orden(code)})


@app.route("/api/productos/<code>/preguntas-orden", methods=["PUT"])
def put_producto_preguntas_orden(code):
    body = request.get_json(force=True, silent=True) or {}
    orden = body.get("orden")
    if not isinstance(orden, list):
        return jsonify({"error": "orden debe ser una lista"}), 400
    return jsonify({"orden": store.set_pregunta_orden(code, orden)})


# ------------------------------------------------------------------ #
# Vista previa / campos de producto por agregador
# ------------------------------------------------------------------ #
def _find_product_in_tree(code):
    return _cache["by_code"].get(str(code))


def _validar_agregador():
    agregador = (request.args.get("agregador") or "").strip().upper()
    if agregador not in store.PRODUCT_FIELD_AGGREGATORS:
        return None, (jsonify({
            "error": f"Parámetro 'agregador' inválido. Debe ser uno de: {', '.join(store.PRODUCT_FIELD_AGGREGATORS)}"
        }), 400)
    return agregador, None


# ------------------------------------------------------------------ #
# Flujo de atención del producto: progreso (NUEVO -> PENDIENTE_DATOS ->
# DATOS_COMPLETOS -> ORDENADO_EN_CARTA -> INTEGRADO) + alertas
# superpuestas (CAMBIO_STS, PENDIENTE_REPUBLICAR). Ver conversación con
# el usuario para el diseño completo; en corto: el progreso nunca
# retrocede solo, las alertas son las que avisan que algo necesita
# atención sin bajar de estado.
# ------------------------------------------------------------------ #
def _sts_snapshot_de(producto):
    if producto.get("type") == "COMBO":
        preguntas = sorted(str(g.get("code", "")) for g in producto.get("groups", []))
    else:
        preguntas = sorted(str(c.get("subgroup_code", "")) for c in producto.get("condiments", []))
    return {
        "name": producto.get("name"),
        "price": producto.get("price"),
        "type": producto.get("type"),
        "preguntas": preguntas,
    }


def _producto_en_carta(code, agregador):
    categoria_ids = [c["id"] for c in store.load_categorias() if c["agregador"] == agregador]
    if not categoria_ids:
        return False
    carta = store.load_carta()
    code = str(code)
    return any(code in carta.get(str(cid), []) for cid in categoria_ids)


def _integracion_snapshot_de(code, agregador):
    categoria_ids = [c["id"] for c in store.load_categorias() if c["agregador"] == agregador]
    carta = store.load_carta()
    carta_pos = None
    for cid in categoria_ids:
        lista = carta.get(str(cid), [])
        if str(code) in lista:
            carta_pos = f"{cid}:{lista.index(str(code))}"
            break
    return {
        "campos": store.get_producto_campos(code, agregador),
        "preguntasOrden": store.get_pregunta_orden(code),
        "cartaPos": carta_pos,
    }


def compute_estado_producto(producto, agregador):
    code = str(producto["code"])
    campos = store.get_producto_campos(code, agregador)
    tiene_campos = any(str(v).strip() for v in campos.values())
    estado = store.get_estado_producto(code, agregador)

    if not store.es_visto(agregador, code):
        progreso = "NUEVO"
    elif estado["integrado"]:
        progreso = "INTEGRADO"
    elif _producto_en_carta(code, agregador):
        progreso = "ORDENADO_EN_CARTA"
    elif tiene_campos:
        progreso = "DATOS_COMPLETOS"
    else:
        progreso = "PENDIENTE_DATOS"

    alertas = []
    if tiene_campos and estado.get("stsSnapshot") is not None:
        if _sts_snapshot_de(producto) != estado["stsSnapshot"]:
            alertas.append("CAMBIO_STS")
    if estado["integrado"]:
        if _integracion_snapshot_de(code, agregador) != estado.get("integracionSnapshot"):
            alertas.append("PENDIENTE_REPUBLICAR")

    return progreso, alertas


@app.route("/api/productos/<code>/campos", methods=["GET"])
def get_producto_campos(code):
    agregador, error = _validar_agregador()
    if error:
        return error

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    producto = _find_product_in_tree(code)
    if producto is None:
        return jsonify({"error": "Producto no encontrado en el catálogo actual."}), 404

    return jsonify({
        "producto": {
            "code": producto["code"],
            "name": producto["name"],
            "price": producto["price"],
            "type": producto["type"],
            "canal": producto.get("canal", ""),
        },
        "agregador": agregador,
        "campos": store.get_producto_campos(code, agregador),
    })


@app.route("/api/productos/<code>/campos", methods=["POST"])
def post_producto_campos(code):
    agregador, error = _validar_agregador()
    if error:
        return error

    body = request.get_json(force=True, silent=True) or {}
    campos = store.save_producto_campos(code, agregador, body)
    return jsonify({"code": code, "agregador": agregador, "campos": campos})


# ------------------------------------------------------------------ #
# Campos de "productos hijos" (opciones dentro de una pregunta: items de
# un grupo de combo o condimentos). No se validan contra el árbol de
# catálogo porque su código puede no existir como producto de nivel
# superior — su nombre/precio ya vienen embebidos en el producto padre
# (ver sts_client.build_catalog_tree), acá solo se guarda su imagen.
# ------------------------------------------------------------------ #
@app.route("/api/productos-hijos/<code>/campos", methods=["GET"])
def get_producto_hijo_campos(code):
    agregador, error = _validar_agregador()
    if error:
        return error
    return jsonify({"code": code, "agregador": agregador, "campos": store.get_producto_hijo_campos(code, agregador)})


@app.route("/api/productos-hijos/<code>/campos", methods=["POST"])
def post_producto_hijo_campos(code):
    agregador, error = _validar_agregador()
    if error:
        return error

    body = request.get_json(force=True, silent=True) or {}
    campos = store.save_producto_hijo_campos(code, agregador, body)
    return jsonify({"code": code, "agregador": agregador, "campos": campos})


@app.route("/api/productos/estado", methods=["GET"])
def get_productos_estado():
    """Estado (progreso + alertas) de cada producto para un agregador.

    "completos" se mantiene por compatibilidad: son los códigos con
    progreso "DATOS_COMPLETOS" o más avanzado, que es lo que usan hoy
    las pestañas "Completos/Pendientes" del catálogo y el resumen.
    "estados" trae el detalle completo (progreso + alertas) para los
    badges de la interfaz.
    """
    agregador, error = _validar_agregador()
    if error:
        return error

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    tree = _cache["tree"] or []
    store.marcar_vistos(agregador, [p["code"] for p in tree])

    estados = {}
    completos = []
    for producto in tree:
        progreso, alertas = compute_estado_producto(producto, agregador)
        code = str(producto["code"])
        estados[code] = {"progreso": progreso, "alertas": alertas}
        if progreso in ("DATOS_COMPLETOS", "ORDENADO_EN_CARTA", "INTEGRADO"):
            completos.append(code)

    return jsonify({"agregador": agregador, "completos": completos, "estados": estados})


@app.route("/api/productos/<code>/estado", methods=["GET"])
def get_producto_estado_individual(code):
    """Progreso + alertas de UN producto para un agregador puntual.

    Se usa en el editor (Vista previa / Vista previa 2), donde el
    agregador seleccionado puede ser distinto al de la pestaña activa
    del catálogo, así que no alcanza con el mapa masivo de /estado.
    """
    agregador, error = _validar_agregador()
    if error:
        return error

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    producto = _find_product_in_tree(code)
    if producto is None:
        return jsonify({"error": "Producto no encontrado en el catálogo actual."}), 404

    store.marcar_vistos(agregador, [producto["code"]])
    progreso, alertas = compute_estado_producto(producto, agregador)
    return jsonify({"progreso": progreso, "alertas": alertas})


@app.route("/api/productos/<code>/confirmar-sts", methods=["POST"])
def confirmar_cambio_sts(code):
    """El usuario revisó el cambio que reportó STS y da por buena la foto actual."""
    agregador, error = _validar_agregador()
    if error:
        return error

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    producto = _find_product_in_tree(code)
    if producto is None:
        return jsonify({"error": "Producto no encontrado en el catálogo actual."}), 404

    store.set_sts_snapshot(code, agregador, _sts_snapshot_de(producto))
    progreso, alertas = compute_estado_producto(producto, agregador)
    return jsonify({"progreso": progreso, "alertas": alertas})


@app.route("/api/productos/<code>/integrar", methods=["POST"])
def integrar_producto(code):
    """Marca el producto como integrado (o lo vuelve a integrar si ya lo estaba).

    Guarda una foto de los datos de STS y de los datos comerciales/orden
    actuales, que es contra lo que se compara después para detectar
    cambios (CAMBIO_STS / PENDIENTE_REPUBLICAR).
    """
    agregador, error = _validar_agregador()
    if error:
        return error

    config = sts.load_config()
    if not _cache_is_fresh():
        try:
            _refresh_cache(config)
        except sts.STSError as e:
            return jsonify({"error": str(e)}), 502

    producto = _find_product_in_tree(code)
    if producto is None:
        return jsonify({"error": "Producto no encontrado en el catálogo actual."}), 404

    store.set_integrado(
        code, agregador,
        _sts_snapshot_de(producto),
        _integracion_snapshot_de(code, agregador),
    )
    progreso, alertas = compute_estado_producto(producto, agregador)
    return jsonify({"progreso": progreso, "alertas": alertas})


@app.route("/api/productos/<code>/desintegrar", methods=["POST"])
def desintegrar_producto(code):
    """Desmarca la integración (pensado para poder demostrar el flujo varias veces en la POC)."""
    agregador, error = _validar_agregador()
    if error:
        return error

    store.set_desintegrado(code, agregador)
    producto = _find_product_in_tree(code)
    if producto is None:
        return jsonify({"progreso": "PENDIENTE_DATOS", "alertas": []})
    progreso, alertas = compute_estado_producto(producto, agregador)
    return jsonify({"progreso": progreso, "alertas": alertas})


@app.route("/api/productos/campos", methods=["GET"])
def get_productos_campos_bulk():
    """Campos guardados de TODOS los productos para un agregador, en un solo
    llamado. Lo usa "Previsualizar carta" para mostrar nombre/descripción/
    precio/imagen reales (los mismos que se ven en Vista previa) sin pedirlos
    uno por uno.
    """
    agregador, error = _validar_agregador()
    if error:
        return error
    data = store.load_producto_campos()
    campos_por_producto = {
        code: campos[agregador]
        for code, campos in data.items()
        if campos.get(agregador)
    }
    return jsonify({"agregador": agregador, "campos": campos_por_producto})


@app.route("/api/productos-hijos/campos", methods=["GET"])
def get_productos_hijos_campos_bulk():
    """Campos guardados de TODOS los productos hijos para un agregador, en un
    solo llamado (mismo patrón que /api/productos/campos). Lo usa la pestaña
    Opciones/Preguntas del editor para mostrar la imagen de cada opción sin
    pedirla una por una.
    """
    agregador, error = _validar_agregador()
    if error:
        return error
    data = store.load_producto_hijo_campos()
    campos_por_hijo = {
        code: campos[agregador]
        for code, campos in data.items()
        if campos.get(agregador)
    }
    return jsonify({"agregador": agregador, "campos": campos_por_hijo})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
