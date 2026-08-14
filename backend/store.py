#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Persistencia simple en JSON para datos propios de la POC que no vienen
de Oracle STS: la "pregunta comercial" de cada pregunta (comboGroup) y
el maestro de categorías/subcategorías por marca y agregador.
"""

import json
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PREGUNTAS_PATH = BACKEND_DIR / "preguntas_store.json"
PREGUNTAS_CANTIDAD_PATH = BACKEND_DIR / "preguntas_cantidad_store.json"
CATEGORIAS_PATH = BACKEND_DIR / "categorias_store.json"
PRODUCTO_CAMPOS_PATH = BACKEND_DIR / "producto_campos_store.json"
MARCAS_PATH = BACKEND_DIR / "marcas_store.json"
CARTA_PATH = BACKEND_DIR / "carta_store.json"
CARTAS_MAESTRO_PATH = BACKEND_DIR / "cartas_maestro_store.json"
PREGUNTAS_ORDEN_PATH = BACKEND_DIR / "preguntas_orden_store.json"
VISTOS_PATH = BACKEND_DIR / "productos_vistos_store.json"
ESTADO_PATH = BACKEND_DIR / "estado_store.json"


# Cache en memoria de los JSON ya leídos: estas stores se consultan muchas
# veces por request (por ejemplo /api/productos/estado recorre todo el
# catálogo y por cada producto vuelve a pedir campos/estado/vistos/carta),
# así que releer y parsear el archivo cada vez es el cuello de botella real.
# Como el server corre single-process, alcanza con guardar en memoria lo ya
# leído y mantenerlo al día en cada escritura.
_json_cache = {}


def _read_json(path, default):
    key = str(path)
    if key in _json_cache:
        return _json_cache[key]
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = default
    _json_cache[key] = data
    return data


def _write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _json_cache[str(path)] = data


# ------------------------------------------------------------------ #
# Preguntas comerciales
# ------------------------------------------------------------------ #
def load_preguntas_comerciales():
    """dict: {codigo_pregunta_oracle: pregunta_comercial}"""
    return _read_json(PREGUNTAS_PATH, {})


def save_pregunta_comercial(code, texto):
    data = load_preguntas_comerciales()
    data[str(code)] = texto
    _write_json(PREGUNTAS_PATH, data)
    return data[str(code)]


def load_preguntas_cantidad():
    """dict: {codigo_pregunta_oracle: cantidad_maxima (int)}

    Cantidad máxima de veces/opciones que el agregador permite seleccionar
    para esa pregunta (comboGroup) — configuración comercial aparte del
    nombre a mostrar.
    """
    return _read_json(PREGUNTAS_CANTIDAD_PATH, {})


def save_pregunta_cantidad(code, cantidad):
    data = load_preguntas_cantidad()
    data[str(code)] = int(cantidad)
    _write_json(PREGUNTAS_CANTIDAD_PATH, data)
    return data[str(code)]


# ------------------------------------------------------------------ #
# Marcas (independientes de si ya tienen categorías o no)
# ------------------------------------------------------------------ #
def load_marcas():
    """list[str]: nombres de marca registrados, con o sin categorías todavía."""
    return _read_json(MARCAS_PATH, [])


def _save_marcas(marcas):
    _write_json(MARCAS_PATH, marcas)


def create_marca(nombre):
    nombre = (nombre or "").strip()
    if not nombre:
        return load_marcas()
    marcas = load_marcas()
    if nombre not in marcas:
        marcas.append(nombre)
        _save_marcas(marcas)
    return marcas


# ------------------------------------------------------------------ #
# Categorías / subcategorías (por marca y agregador)
# ------------------------------------------------------------------ #
class NotFoundError(Exception):
    pass


def load_categorias():
    return _read_json(CATEGORIAS_PATH, [])


def _save_categorias(categorias):
    _write_json(CATEGORIAS_PATH, categorias)


def _next_id(items):
    existentes = [item["id"] for item in items if isinstance(item.get("id"), int)]
    return (max(existentes) + 1) if existentes else 1


def create_categoria(nombre, marca, agregador):
    categorias = load_categorias()
    nueva = {
        "id": _next_id(categorias),
        "nombre": nombre,
        "marca": marca,
        "agregador": agregador,
        "activo": True,
        "subcategorias": [],
    }
    categorias.append(nueva)
    _save_categorias(categorias)
    create_marca(marca)
    return nueva


def _find_categoria(categorias, cat_id):
    for cat in categorias:
        if cat["id"] == cat_id:
            return cat
    raise NotFoundError(f"Categoría {cat_id} no existe")


def update_categoria(cat_id, **cambios):
    categorias = load_categorias()
    cat = _find_categoria(categorias, cat_id)
    for campo, valor in cambios.items():
        if valor is not None:
            cat[campo] = valor
    _save_categorias(categorias)
    return cat


def reorder_categorias(marca, agregador, ids):
    """Reordena las categorías de una (marca, agregador) según `ids`.

    La posición dentro de este grupo (1, 2, 3…) es el "código" que el
    front usa para completar automáticamente Orden (OrderPos) al elegir
    una categoría en Collection/Sección. Los ids que no pertenecen al
    grupo se ignoran; los del grupo que falten en `ids` se agregan al
    final en su orden original, para no perder categorías por error.
    """
    categorias = load_categorias()
    grupo = {
        cat["id"]: cat for cat in categorias if cat["marca"] == marca and cat["agregador"] == agregador
    }
    ordenados_ids = [i for i in ids if i in grupo]
    faltantes_ids = [cat_id for cat_id in grupo if cat_id not in ordenados_ids]
    orden_final = ordenados_ids + faltantes_ids

    otras = [cat for cat in categorias if not (cat["marca"] == marca and cat["agregador"] == agregador)]
    reordenadas = [grupo[cat_id] for cat_id in orden_final]
    _save_categorias(otras + reordenadas)
    return reordenadas


def create_subcategoria(cat_id, nombre):
    categorias = load_categorias()
    cat = _find_categoria(categorias, cat_id)
    nueva = {"id": _next_id(cat["subcategorias"]), "nombre": nombre, "activo": True}
    cat["subcategorias"].append(nueva)
    _save_categorias(categorias)
    return nueva


def update_subcategoria(cat_id, sub_id, **cambios):
    categorias = load_categorias()
    cat = _find_categoria(categorias, cat_id)
    for sub in cat["subcategorias"]:
        if sub["id"] == sub_id:
            for campo, valor in cambios.items():
                if valor is not None:
                    sub[campo] = valor
            _save_categorias(categorias)
            return sub
    raise NotFoundError(f"Subcategoría {sub_id} no existe en categoría {cat_id}")


# ------------------------------------------------------------------ #
# Campos de producto por agregador (ver "Campos por agregador.png")
#
# Un mismo producto puede publicarse en varios agregadores con valores
# distintos por campo (incluido el precio), así que se guarda por
# (codigo_producto, agregador) y nunca se comparte entre agregadores.
# ------------------------------------------------------------------ #
PRODUCT_FIELD_AGGREGATORS = ["RAPPI", "DIDI", "PEYA_PRODUCTOS", "LLAMAFOOD"]


def load_producto_campos():
    """dict: {codigo_producto: {AGREGADOR: {NombreCampo: valor}}}"""
    return _read_json(PRODUCTO_CAMPOS_PATH, {})


def get_producto_campos(code, agregador):
    return load_producto_campos().get(str(code), {}).get(agregador, {})


def save_producto_campos(code, agregador, campos):
    data = load_producto_campos()
    producto = data.setdefault(str(code), {})
    actuales = producto.get(agregador, {})
    actuales.update(campos)
    producto[agregador] = actuales
    _write_json(PRODUCTO_CAMPOS_PATH, data)
    return actuales


def completed_codes(agregador):
    """Códigos de producto con al menos un campo guardado (no vacío) para ese agregador.

    Un producto se considera "pendiente" mientras nadie haya completado su
    información en el modal de edición para ese agregador en particular.
    """
    data = load_producto_campos()
    return [
        code
        for code, por_agregador in data.items()
        if any(str(v).strip() for v in (por_agregador.get(agregador) or {}).values())
    ]


# ------------------------------------------------------------------ #
# "Carta" (previsualización): orden de productos dentro de cada categoría
# del maestro. Cada categoría ya está scopeada a una (marca, agregador),
# así que basta guardar la lista ordenada de códigos de producto por
# categoria_id. Un producto que no aparece en ninguna lista se considera
# "sin categoría" (no se persiste esa cola, se calcula en el front).
# ------------------------------------------------------------------ #
def load_carta():
    """dict: {categoria_id (str): [codigo_producto, ...]} en el orden a mostrar."""
    return _read_json(CARTA_PATH, {})


def _save_carta(data):
    _write_json(CARTA_PATH, data)


def set_carta_categoria(categoria_id, codigos):
    data = load_carta()
    data[str(categoria_id)] = [str(c) for c in codigos]
    _save_carta(data)
    return data


# ------------------------------------------------------------------ #
# Maestro de cartas por agregador: una carta agrupa un subconjunto de
# productos del catálogo de un (marca, agregador) — puede haber varias
# cartas para la misma combinación (ej. variantes estacionales). Cada
# producto asociado lleva un flag "integrable" propio de esa carta.
# ------------------------------------------------------------------ #
def load_cartas_maestro():
    return _read_json(CARTAS_MAESTRO_PATH, [])


def _save_cartas_maestro(cartas):
    _write_json(CARTAS_MAESTRO_PATH, cartas)


def create_carta_maestro(nombre, marca, agregador):
    cartas = load_cartas_maestro()
    nueva = {
        "id": _next_id(cartas),
        "nombre": nombre,
        "marca": marca,
        "agregador": agregador,
        "activo": True,
        "productos": [],
    }
    cartas.append(nueva)
    _save_cartas_maestro(cartas)
    create_marca(marca)
    return nueva


def _find_carta_maestro(cartas, carta_id):
    for carta in cartas:
        if carta["id"] == carta_id:
            return carta
    raise NotFoundError(f"Carta {carta_id} no existe")


def update_carta_maestro(carta_id, **cambios):
    cartas = load_cartas_maestro()
    carta = _find_carta_maestro(cartas, carta_id)
    for campo, valor in cambios.items():
        if valor is not None:
            carta[campo] = valor
    _save_cartas_maestro(cartas)
    return carta


def set_carta_maestro_productos(carta_id, productos):
    """Reemplaza el listado de productos asociados a la carta.

    `productos` es una lista de {"code": ..., "integrable": bool}: los
    productos que no vengan en la lista quedan desasociados de la carta.
    """
    cartas = load_cartas_maestro()
    carta = _find_carta_maestro(cartas, carta_id)
    carta["productos"] = [
        {"code": str(p.get("code")), "integrable": bool(p.get("integrable", True))}
        for p in productos
        if p.get("code")
    ]
    _save_cartas_maestro(cartas)
    return carta


# ------------------------------------------------------------------ #
# Orden de preguntas (grupos de combo / subgrupos de condimentos) dentro
# de la pestaña "Opciones / Preguntas" de un producto. El grupo principal
# (obligatorio) puede venir incluido en la lista, pero el front nunca lo
# deja moverse: siempre se vuelve a colocar primero al resolver el orden.
# ------------------------------------------------------------------ #
def load_preguntas_orden():
    """dict: {codigo_producto (str): [codigo_pregunta, ...]}"""
    return _read_json(PREGUNTAS_ORDEN_PATH, {})


def get_pregunta_orden(code):
    return load_preguntas_orden().get(str(code), [])


def set_pregunta_orden(code, orden):
    data = load_preguntas_orden()
    data[str(code)] = [str(c) for c in orden]
    _write_json(PREGUNTAS_ORDEN_PATH, data)
    return data[str(code)]


# ------------------------------------------------------------------ #
# Estados del producto (ver flujo de atención):
#
#  - "vistos": marca qué códigos ya aparecieron alguna vez en el catálogo
#    de un agregador, para distinguir "NUEVO" (recién detectado en STS)
#    de "PENDIENTE_DATOS" (ya visto, falta completar). El resto del
#    progreso (datos completos / ordenado en carta / integrado) se
#    deriva de las stores que ya existen (producto_campos, carta) más
#    el flag de integración de acá abajo.
#
#  - "estado": por (codigo, agregador) guarda si el producto está
#    integrado y dos fotos ("snapshots") para detectar cambios:
#      - stsSnapshot: cómo era el producto en Oracle STS la última vez
#        que se revisó, para avisar si Oracle lo cambió después.
#      - integracionSnapshot: cómo estaban los datos comerciales/orden
#        al momento de integrar, para avisar si hay cambios sin publicar.
# ------------------------------------------------------------------ #
def load_vistos():
    """dict: {agregador: [codigo_producto, ...]}"""
    return _read_json(VISTOS_PATH, {})


def marcar_vistos(agregador, codigos):
    data = load_vistos()
    vistos = set(data.get(agregador, []))
    nuevos = [str(c) for c in codigos if str(c) not in vistos]
    if nuevos:
        vistos.update(nuevos)
        data[agregador] = sorted(vistos)
        _write_json(VISTOS_PATH, data)
    return data.get(agregador, [])


def es_visto(agregador, code):
    return str(code) in load_vistos().get(agregador, [])


ESTADO_DEFAULT = {
    "integrado": False,
    "integradoEn": None,
    "stsSnapshot": None,
    "integracionSnapshot": None,
}


def load_estado():
    """dict: {codigo_producto: {agregador: {integrado, integradoEn, stsSnapshot, integracionSnapshot}}}"""
    return _read_json(ESTADO_PATH, {})


def _save_estado(data):
    _write_json(ESTADO_PATH, data)


def get_estado_producto(code, agregador):
    data = load_estado()
    return data.get(str(code), {}).get(agregador, dict(ESTADO_DEFAULT))


def set_sts_snapshot(code, agregador, snapshot):
    data = load_estado()
    producto = data.setdefault(str(code), {})
    actual = producto.setdefault(agregador, dict(ESTADO_DEFAULT))
    actual["stsSnapshot"] = snapshot
    _save_estado(data)
    return actual


def set_integrado(code, agregador, sts_snapshot, integracion_snapshot):
    data = load_estado()
    producto = data.setdefault(str(code), {})
    actual = producto.setdefault(agregador, dict(ESTADO_DEFAULT))
    actual["integrado"] = True
    actual["integradoEn"] = datetime.now().isoformat(timespec="seconds")
    actual["stsSnapshot"] = sts_snapshot
    actual["integracionSnapshot"] = integracion_snapshot
    _save_estado(data)
    return actual


def set_desintegrado(code, agregador):
    data = load_estado()
    producto = data.setdefault(str(code), {})
    actual = producto.setdefault(agregador, dict(ESTADO_DEFAULT))
    actual["integrado"] = False
    actual["integradoEn"] = None
    _save_estado(data)
    return actual
