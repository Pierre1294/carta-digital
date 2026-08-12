#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cliente STS (Oracle Simphony) para la POC de Carta Digital.

Reutiliza la misma lógica de conexión y aplanado jerárquico que
STS/extractor_menu_sts.py, pero:
  - la configuración de conexión (incluido el token) se guarda en un
    JSON editable desde el front (sts_config.json), sembrado a partir
    de STS/config_extractor_menu_sts.json la primera vez.
  - en vez de generar un Excel, arma un árbol JSON (combo -> grupos ->
    items -> condimentos) e incluye el canal (extensions.NGR_Canal)
    de cada producto/combo de nivel 1 para poder filtrar por agregador.
"""

import json
import os
import time
from pathlib import Path

import requests

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
RUNTIME_CONFIG_PATH = BACKEND_DIR / "sts_config.json"
SEED_CONFIG_PATH = PROJECT_DIR / "STS" / "config_extractor_menu_sts.json"

CHANNEL_EXTENSION_KEY = "NGR_Carta"

DEFAULT_AGGREGATORS = ["RAPPI", "DIDI", "PEDIDOSYA", "LLAMAFOOD"]

# NGR_Carta usa abreviaturas propias del ERP (ej. "PEYA" para PedidosYa).
# Un producto SIN NGR_Carta no se publica en ningún agregador (no aplica a delivery).
AGGREGATOR_ALIASES = {
    "RAPPI": ["RAPPI"],
    "DIDI": ["DIDI"],
    "PEDIDOSYA": ["PEDIDOSYA", "PEYA"],
    "LLAMAFOOD": ["LLAMAFOOD"],
}


class STSError(Exception):
    """Error de negocio (config inválida, 401, 404, timeout, etc.)."""


# ------------------------------------------------------------------ #
# Configuración de conexión (editable desde el front)
# ------------------------------------------------------------------ #
def _config_from_seed():
    with open(SEED_CONFIG_PATH, "r", encoding="utf-8") as f:
        seed = json.load(f)

    api = seed.get("api", {})
    menu_id = seed.get("menuId", {})
    idiomas = seed.get("idiomas", {})

    return {
        "base_url": api.get("base_url", ""),
        "endpoint": api.get("endpoint", "/api/v1/menus/{menuId}"),
        "org": api.get("org", ""),
        "timeout": api.get("timeout", 30),
        "max_retries": api.get("max_retries", 3),
        "token": api.get("auth", {}).get("token", ""),
        "org_short_name": api.get("headers_adicionales", {}).get("Simphony-OrgShortName", ""),
        "env_locRef": menu_id.get("env_locRef", ""),
        "locRef": menu_id.get("locRef", ""),
        "idioma_es": idiomas.get("nombre_espanol", "es-MX"),
        "idioma_en": idiomas.get("nombre_ingles", "en-US"),
        "aggregators": list(DEFAULT_AGGREGATORS),
    }


def load_config():
    if RUNTIME_CONFIG_PATH.exists():
        with open(RUNTIME_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
    else:
        config = _config_from_seed()
        save_config(config)

    # El token nunca se versiona en git (ver config_extractor_menu_sts.json):
    # si no hay uno guardado en el archivo runtime, se completa con la
    # variable de entorno STS_TOKEN. Así sobrevive a los reinicios del
    # servidor en plataformas con disco efímero (ej. Render free tier) sin
    # tener que volver a pegarlo a mano en el panel de conexión.
    if not config.get("token"):
        env_token = os.environ.get("STS_TOKEN")
        if env_token:
            config["token"] = env_token

    return config


def save_config(config):
    with open(RUNTIME_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    return config


def public_config(config):
    """Config para exponer al front: enmascara el token."""
    safe = dict(config)
    token = safe.get("token", "") or ""
    if token:
        safe["token"] = ("*" * max(len(token) - 6, 0)) + token[-6:]
    safe["token_configured"] = bool(token)
    return safe


# ------------------------------------------------------------------ #
# Llamada al API
# ------------------------------------------------------------------ #
def _build_menu_id(config):
    return f"{config['org']}:{config['env_locRef']}:{config['locRef']}"


def _build_url(config, menu_id):
    endpoint = config["endpoint"].format(menuId=menu_id)
    return f"{config['base_url']}{endpoint}"


def _build_headers(config):
    headers = {"Content-Type": "application/json"}
    token = (config.get("token") or "").strip()
    if not token:
        raise STSError("No hay token configurado. Configúralo en el panel de conexión.")
    headers["Authorization"] = f"Bearer {token}"
    headers["Simphony-OrgShortName"] = config.get("org_short_name", "")
    headers["Simphony-LocRef"] = str(config.get("env_locRef", ""))
    headers["Simphony-RvcRef"] = str(config.get("locRef", ""))
    return headers


def fetch_menu_raw(config):
    menu_id = _build_menu_id(config)
    url = _build_url(config, menu_id)
    headers = _build_headers(config)
    timeout = config.get("timeout", 30)
    max_retries = max(config.get("max_retries", 3), 1)

    last_error = None
    for intento in range(1, max_retries + 1):
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
        except requests.exceptions.Timeout:
            last_error = STSError("Timeout consultando STS.")
            time.sleep(1 * intento)
            continue
        except requests.exceptions.RequestException as e:
            raise STSError(f"Error de red consultando STS: {e}")

        if response.status_code == 200:
            return response.json()
        if response.status_code == 401:
            raise STSError("401 Unauthorized: el token está vencido o mal configurado.")
        if response.status_code == 404:
            raise STSError("404 Not Found: revisa org / env_locRef / locRef.")
        raise STSError(f"Error HTTP {response.status_code}: {response.text[:300]}")

    raise last_error or STSError("No se pudo consultar STS.")


# ------------------------------------------------------------------ #
# Aplanado jerárquico -> árbol JSON con canal por producto/combo
# ------------------------------------------------------------------ #
def _nombre(obj, idioma_es, idioma_en):
    nombres = (obj or {}).get("name") or {}
    return nombres.get(idioma_es) or nombres.get(idioma_en, "") or ""


def _precio_seq1(precios):
    for p in precios or []:
        if p.get("priceSequence") == 1:
            return p.get("price", None)
    return None


def _extensions(item):
    definiciones = (item or {}).get("definitions", [])
    if not definiciones:
        return {}
    return definiciones[0].get("extensions") or {}


def _canal(item):
    return str(_extensions(item).get(CHANNEL_EXTENSION_KEY, "")).strip()


def build_catalog_tree(data, config):
    idioma_es = config.get("idioma_es", "es-MX")
    idioma_en = config.get("idioma_en", "en-US")

    menu_items = {str(i.get("menuItemId")): i for i in data.get("menuItems", [])}
    cond_groups = {str(g.get("condimentGroupId")): g for g in data.get("condimentGroups", [])}
    cond_items = {str(c.get("condimentId")): c for c in data.get("condimentItems", [])}

    def _condimentos(item):
        salida = []
        for definicion in (item or {}).get("definitions", []):
            for regla in definicion.get("condimentGroupRules", []):
                ref_grupo = str(regla.get("condimentGroupRef", ""))
                grupo_cond = cond_groups.get(ref_grupo)
                subpregunta = _nombre(grupo_cond, idioma_es, idioma_en)
                for cref in (grupo_cond.get("condimentItemRefs", []) if grupo_cond else []):
                    cond = cond_items.get(str(cref))
                    definiciones_c = (cond or {}).get("definitions", [{}])
                    precio_c = _precio_seq1(definiciones_c[0].get("prices", []) if definiciones_c else [])
                    salida.append({
                        "code": cref,
                        "name": _nombre(cond, idioma_es, idioma_en),
                        "price": precio_c,
                        "min": regla.get("minimumCount"),
                        "max": regla.get("maximumCount"),
                        "subgroup_code": ref_grupo,
                        "subgroup_name": subpregunta,
                    })
        return salida

    tree = []
    combos = data.get("comboMeals", [])
    refs_combo = set()

    for combo in combos:
        ref_cab = str(combo.get("menuItemRef", ""))
        refs_combo.add(ref_cab)
        cabecera = menu_items.get(ref_cab)
        definiciones_cab = (cabecera or {}).get("definitions", [])
        precio_cab = _precio_seq1(definiciones_cab[0].get("prices", []) if definiciones_cab else [])
        nombre_cab = _nombre(cabecera, idioma_es, idioma_en) or combo.get("name", "")

        grupos = []
        for grupo in combo.get("comboGroups", []):
            items_grupo = []
            for mi in grupo.get("menuItems", []):
                ref = str(mi.get("menuItemRef", ""))
                item = menu_items.get(ref)
                items_grupo.append({
                    "code": ref,
                    "name": _nombre(item, idioma_es, idioma_en),
                    "price": _precio_seq1(mi.get("prices", [])),
                    "condiments": _condimentos(item),
                })
            grupos.append({
                "code": grupo.get("comboGroupId", ""),
                "name": grupo.get("name", ""),
                "principal": bool(grupo.get("isMainGroup")),
                "items": items_grupo,
            })

        tree.append({
            "code": combo.get("comboMealId", ""),
            "type": "COMBO",
            "name": nombre_cab,
            "price": precio_cab,
            "canal": _canal(cabecera),
            "groups": grupos,
            "condiments": [],
        })

    for codigo, item in menu_items.items():
        if codigo in refs_combo:
            continue
        definiciones_i = item.get("definitions", [])
        precio_i = _precio_seq1(definiciones_i[0].get("prices", []) if definiciones_i else [])
        tree.append({
            "code": codigo,
            "type": "PRODUCTO",
            "name": _nombre(item, idioma_es, idioma_en),
            "price": precio_i,
            "canal": _canal(item),
            "groups": [],
            "condiments": _condimentos(item),
        })

    return tree


def distinct_channels(tree):
    return sorted({p["canal"] for p in tree if p.get("canal")})


def matches_channel(product_canal, aggregator_name):
    """Un producto SIN NGR_Carta no aplica a ningún agregador (opción B)."""
    if not product_canal:
        return False
    canal_norm = product_canal.strip().upper()
    aliases = AGGREGATOR_ALIASES.get(aggregator_name.strip().upper(), [aggregator_name.strip().upper()])
    return any(alias in canal_norm for alias in aliases)


def filter_by_aggregator(tree, aggregator_name):
    return [p for p in tree if matches_channel(p.get("canal", ""), aggregator_name)]


def distinct_questions(tree):
    """Preguntas (comboGroups) únicas del catálogo, con su nombre nativo de Oracle Simphony."""
    preguntas = {}
    for producto in tree:
        for grupo in producto.get("groups", []):
            code = str(grupo.get("code", "")).strip()
            if code and code not in preguntas:
                preguntas[code] = grupo.get("name", "")
    return sorted(
        ({"code": code, "name": name} for code, name in preguntas.items()),
        key=lambda p: p["name"],
    )
