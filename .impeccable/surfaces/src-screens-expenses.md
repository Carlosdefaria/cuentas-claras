---
version: 1
slug: "src-screens-expenses"
primary_target: "src/screens/expenses"
related_targets: ["src/screens/groups/GroupDetail.tsx","src/screens/groups/Groups.tsx"]
---

# Superficie: gastos y saldos (añadir gasto, pestañas Gastos y Saldos, detalle de gasto, saldo en Grupos)

Modo: Operate. Construcción: code-led (variantes en imagen; el usuario eligió la A de 3, «Boleto»).
Alcance: `/grupos/:id/gastos/nuevo`, `/grupos/:id/gastos/:expenseId`, pestañas Gastos y Saldos de `/grupos/:id`
(`?seccion=`), saldo por grupo y total en `/`. Desde RF-06/RF-10: `/grupos/:id/gastos/:expenseId/editar`, borrar con hoja
inferior y pestaña Actividad (`?seccion=actividad`); editar/borrar solo quien añadió el gasto. Sin UI de pagos.
Usuario y tarea: alguien del grupo apunta un gasto con una mano en < 15 s y ve al momento quién debe cuánto.
Estados: cargando, vacío, error con Reintentar, validación por campo, enviando, sin conexión.
Restricciones: céntimos enteros; reparto igual con resto determinista por user_id (splitEqual); saldos calculados
solo con computeBalances; euros con Intl es-ES y tabular-nums; rojo solo para «debes»; inputs ≥ 16 px.

## Direction contract

THESIS: Un gasto es una participación de lotería: el talón dice cuánto y de qué; bajo el troquel, cómo se reparte,
persona a persona, al céntimo. Rechaza el formulario genérico de campos apilados con el reparto escondido.

OWN-WORLD: El del sistema (DESIGN.md). Talón mantequilla con el importe grande en la sans del sistema (tabular,
700) y el concepto; troquel; cuerpo `hoja` con Pagó y Fecha a dos columnas y una fila por participante (casilla,
círculo de su talón, nombre, cuota) separadas por punteado de troquel. Verde a favor / rojo sello en saldos.

STORY: Escribe el importe y el concepto, ve cuánto toca a cada uno mientras escribe, guarda; vuelve a Gastos con el
gasto arriba y en Saldos entiende su situación de un vistazo («Te deben 301,82 €»).

FIRST VIEWPORT: Añadir gasto: participación a todo el ancho; talón con «Importe» y la cifra a 2.75rem, campo de
concepto; bajo el troquel Pagó | Fecha y la lista de participantes con cuotas en vivo y la nota de céntimos
sobrantes; botón «Añadir gasto» debajo. Gastos: botón principal «Añadir gasto» bajo las pestañas, días con total y
filas (círculo del pagador, concepto, «Pagó X», importe, «te toca Y»). Saldos: participación menta «Tu saldo» con la
cifra grande y el desglose; debajo «Todo el grupo».

FORM: «Boleto», posición 5 de mi lista (tirada 5, 7, 3; el usuario eligió la 5). seed:1b2f6c356a5e399b (tirada
degradada, sin retadores).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Editar, borrar y actividad (RF-06, RF-10)

FORM: «Pie del boleto», variante A de 3 (B «Editar en la barra», C «Talón con acciones»); el usuario eligió la A y
fijó que solo quien añadió el gasto puede editarlo o borrarlo.

CRITIQUE (⚠️ DEGRADED: single-context, sin sub-agentes por política de la sesión): detector limpio en las cinco
pantallas tocadas; revisión visual en WebKit (iPhone 15 y 320 px). Arreglado: las pestañas «Miembros» y «Actividad» se
tocaban a 320 px. Pendiente menor: a 320 px la pestaña activa «Actividad» queda justa contra su borde.

## Pagos y saldar cuentas (RF-08, RF-09)

FORM: «Saldar en Saldos», variante A de 3 (B «Pantalla Saldar cuentas», C «Un toque desde Tu saldo»). Reglas del usuario:
registra quien paga o quien cobra; borra quien lo registró.

CRITIQUE (⚠️ DEGRADED: single-context, sin sub-agentes por política de la sesión): detector limpio tras pasar la cifra
de la hoja a la escala de DESIGN.md (2.75rem/1.875rem); revisión visual en WebKit (iPhone 15). Arreglado: el desglose de
«Tu saldo» no cuadraba con la cifra tras un pago (ahora suma los pagos hechos y recibidos).
