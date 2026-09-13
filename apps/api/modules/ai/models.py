"""v7 (Fase 5): modelos del AI Gateway.

El gateway es un PROXY hacia el motor de IA Local: no persiste datos propios,
por eso este modulo no declara tablas todavia.

Se mantiene el archivo (vacio de tablas) a proposito para que `main.py` pueda
importarlo de forma incondicional. Esto respeta la regla del Incidente 16.3:
todo modulo con modelos debe importarse en `main.py` antes de crear tablas, de
lo contrario SQLAlchemy no los conoce y el arranque entra en crash loop.

Cuando la Fase 7 agregue persistencia (ej. auditoria de inferencias), las
tablas se declararan aqui y quedaran automaticamente registradas.
"""

# Sin tablas por ahora. Ver docstring.
