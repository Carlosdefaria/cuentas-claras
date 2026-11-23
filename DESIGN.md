---
name: Cuentas Claras
description: Gastos compartidos en grupo, al céntimo; PWA en español con el mundo de las participaciones de lotería.
colors:
  papel: "#e9f2ed"
  papel-hondo: "#dbe9e1"
  hoja: "#fbfdfb"
  tinta: "#13261d"
  tinta-suave: "#3d5749"
  tinta-tenue: "#5b7366"
  trazo: "#b9cdc2"
  loteria: "#0d5637"
  loteria-hondo: "#0a4029"
  loteria-claro: "#cfe6d8"
  sello: "#b3302a"
  sello-claro: "#fbe3df"
  favor: "#0f6b44"
  talon-menta: "#d6eedf"
  talon-salmon: "#fadccf"
  talon-cielo: "#d6e7f5"
  talon-mantequilla: "#f3ebbf"
  talon-lila: "#e6dcf2"
typography:
  rotulo-titulo:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.01em"
  rotulo-seccion:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  cifra:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  nota:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  rotulo-hoja:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.01em"
  rotulo-marca:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
  small:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  control: "8px"
  participacion: "12px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primario:
    backgroundColor: "{colors.loteria}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-primario-hover:
    backgroundColor: "{colors.loteria-hondo}"
  button-peligro:
    backgroundColor: "#ffffff"
    textColor: "{colors.sello}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
  button-peligro-hover:
    backgroundColor: "{colors.sello-claro}"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "48px"
  participacion:
    backgroundColor: "{colors.hoja}"
    rounded: "{rounded.participacion}"
  barra-superior:
    backgroundColor: "{colors.loteria}"
    textColor: "#ffffff"
    height: "56px"
  barra-inferior:
    backgroundColor: "{colors.hoja}"
    textColor: "{colors.tinta-tenue}"
    height: "56px"
---

# Design System: Cuentas Claras

## Overview

**Creative North Star: "La participación de lotería"**

Repartir dinero entre amigos ya tiene un objeto en España: la participación de lotería, el boleto que
se divide en partes y se reparte en el grupo. Cuentas Claras toma de él solo lo que sirve a una app de
trabajo: el papel de color de cada talón, la línea troquelada que separa talón y cuerpo, la grotesca
condensada de los rótulos y la disciplina de los números. La estructura es la de cualquier buena app
móvil: barra superior, barra inferior de secciones, formularios y botones estándar.

Es una superficie Operate: la herramienta desaparece en la tarea (apuntar un gasto, ver quién debe a
quién). El mundo aporta tipo, paleta, densidad y un gesto propio, nunca la navegación ni los controles.
Se usa con una mano en una terraza, un taxi o el súper, casi siempre de día: modo claro.

**Key Characteristics:**
- Fondo de papel verde agua pálido, nunca crema.
- Barra de app en verde lotería con el nombre en grotesca condensada.
- Cada bloque principal es una participación: talón de color arriba, línea troquelada con muescas, cuerpo claro.
- Interfaz y cifras en la sans del sistema, con números tabulares.
- Rojo sello solo para «debes», errores y acciones destructivas; verde para «te deben».

## Colors

Estrategia Restrained con barra comprometida: neutros tintados de verde, un acento (verde lotería) que
pinta la barra de la app y las acciones principales, y talones de colores suaves que identifican personas.

### Primary
- **Verde lotería** (`loteria` #0d5637): barra superior, botón principal, enlaces, foco, pestaña activa.
  Hover/pulsado: `loteria-hondo` #0a4029. Fondo de esqueleto/acción suave: `loteria-claro` #cfe6d8.

### Secondary
- **Rojo sello** (`sello` #b3302a): errores, «debes» y acciones destructivas (cerrar sesión).
  Fondo de alerta: `sello-claro` #fbe3df.
- **Verde a favor** (`favor` #0f6b44): «te deben».

### Tertiary
- **Talones** (`talon-salmon`, `talon-cielo`, `talon-menta`, `talon-mantequilla`, `talon-lila`): papel del
  talón de una participación. Hoy: salmón en Entrar, cielo en Crear cuenta y en los pagos. En grupos, uno por persona.

### Neutral
- `papel` #e9f2ed (fondo de página), `papel-hondo` #dbe9e1 (segunda capa, esqueletos), `hoja` #fbfdfb
  (cuerpo de participaciones y tarjetas, barra inferior), `trazo` #b9cdc2 (bordes y troquel).
- Tinta: `tinta` #13261d (texto), `tinta-suave` #3d5749 (secundario, ≥4.5:1 sobre papel), `tinta-tenue`
  #5b7366 (pestañas inactivas, notas).

### Named Rules
**The Red Means Money Rule.** El rojo sello solo marca deuda, error o destrucción; nunca decoración.
**The Paper Not Cream Rule.** Los fondos son verdes pálidos o blancos tintados de verde; el crema queda fuera.

## Typography

Una sans del sistema para toda la interfaz (SF en iOS) con números tabulares por defecto; Barlow
Condensed (autoalojada con @fontsource, pesos 600/700) solo para rótulos en mayúsculas: marca, título de
participación y título de sección. Escala fija en rem; inputs a ≥16 px para que iOS no haga zoom.

### Hierarchy
- **Marca** (`rotulo-marca`): 1.375rem / 700 / mayúsculas / tracking 0.04em, blanco sobre verde lotería.
- **Título de sección** (`rotulo-seccion`): 2rem / 700 / mayúsculas.
- **Título de participación** (`rotulo-titulo`): 1.875rem / 700 / mayúsculas. En una hoja inferior, compacta
  (`rotulo-hoja`): 1.5rem.
- **Cifra** (`cifra`): 2.75rem / 700 / tabular, en la sans del sistema (nunca en condensada): el importe de un gasto.
  Saldo destacado («Tu saldo»): 1.875rem / 700. **Nota** (`nota`): 0.8125rem para «te toca X» y céntimos sobrantes.
- **Cuerpo** (`body`): 1rem / 1.5. **Etiqueta** (`label`): 0.9375rem / 600. **Pequeño** (`small`): 0.875rem.

### Named Rules
**The Condensed Is For Signs Rule.** La condensada nunca va en etiquetas, botones, campos ni cifras.

## Layout

Columna única de máximo 28rem (`max-w-md`) centrada, con 16 px de margen lateral. Barra superior de
56 px más `env(safe-area-inset-top)`; barra inferior fija de 56 px más `env(safe-area-inset-bottom)` y el
contenido reserva ese hueco. `viewport-fit=cover`. Separación: 20 px entre campos, 24–32 px entre bloques.
En escritorio la misma columna centrada.

## Elevation & Depth

Plano con una sola elevación: las participaciones y tarjetas flotan levemente sobre el papel.

### Shadow Vocabulary
- **participacion**: `0 1px 2px rgb(19 38 29 / 0.08), 0 8px 24px -12px rgb(19 38 29 / 0.25)`.
- **tarjeta-plana**: `0 1px 2px rgb(19 38 29 / 0.08)`.
- **foco de campo**: `0 0 0 3px rgb(13 86 55 / 0.18)` más borde verde lotería.

## Shapes

Radios contenidos: 8 px en controles, 12 px en participaciones y tarjetas. La única forma del mundo es el
troquel: punteado de 2 px en `trazo` y dos muescas semicirculares de 12 px de radio que muerden el borde.

## Components

### Buttons
- **Primario**: 48 px de alto, ancho completo, verde lotería, texto blanco 600; hover/pulsado verde hondo;
  deshabilitado al 60 %; cargando con icono giratorio y texto en gerundio («Entrando…»).
- **Peligro**: blanco con borde rojo al 40 % y texto rojo; hover fondo `sello-claro`.
- **Destructivo**: rojo sello lleno, texto blanco. Solo para la confirmación final de un borrado («Borrar gasto»).

### Cards / Containers
- **Tarjeta plana** (`hoja`, 12 px, sombra plana) para datos de cuenta.
- **Estado vacío**: borde discontinuo de 2 px en `trazo`, texto centrado, explica qué hacer primero.

### Inputs / Fields
Etiqueta visible encima (600), campo de 48 px blanco con borde `trazo`, foco con borde verde y halo
suave, error con borde y texto en rojo sello (`aria-invalid` + `aria-describedby`). Contraseña con botón
de mostrar/ocultar de 48 px.

### Navigation
- **Barra superior** verde con la marca; en pantallas secundarias, botón «‹ Volver» (≥44 px) a la izquierda.
- **Barra inferior** blanca con borde superior: pestañas con icono (lucide, trazo 1.75; 2.25 activo) y
  etiqueta; activa en verde lotería.

### Código de un solo uso (verificación y recuperación)
Un único campo de 60 px (no seis casillas): cifras de 1.875rem con tracking 0.35em, tabulares y centradas;
`inputmode="numeric"` y `autocomplete="one-time-code"` (iOS sugiere el código de Mail); al pegar se limpia
a 6 cifras y al completarlas se envía solo. Talón **menta** en las pantallas de código y **mantequilla** en
«Recupera tu contraseña». Bajo la participación: «Reenviar código (0:59)» con cuenta atrás y «Cambiar email».
Recuperar va en **dos pasos** (variante C, elegida por el usuario): «Paso 1 de 2» (código, comprobado al momento)
y «Paso 2 de 2» con «✓ Código correcto» en verde a favor y la contraseña nueva; al terminar se entra directamente.

### Avisos de la app
Franja a ancho completo bajo la barra superior (sin tapar contenido, `aria-live="polite"`):
- **Sin conexión**: fondo `papel-hondo`, icono `WifiOff` y «Sin conexión. Cuando vuelva, podrás seguir.»
  Nunca se muestran datos de caché: la pantalla dice qué no se ha podido cargar y ofrece Reintentar.
- **Versión nueva**: fondo `loteria-claro`, «Hay una versión nueva.» y botón «Actualizar» (44 px, verde lotería).
  La app no se recarga sola: espera a que la persona pulse.

### Ayuda de instalación (iOS)
Tarjeta plana (`hoja`, 12 px) solo en iOS sin instalar (no en navegadores dentro de otras apps).
- **Entrar / Registro**: compacta y descartable (✕ de 44 px): «Instálala en tu iPhone», por qué hacerlo
  antes de entrar y dos pasos con número en círculo `loteria-claro` e icono lucide (`Share`, `SquarePlus`).
  No debe empujar el botón principal fuera de la primera pantalla.
- **Cuenta**: completa, sin descartar, con el tercer paso (volver a entrar en la app instalada).

### Icono de la app
«Talones en abanico»: tres participaciones (cielo, menta y salmón delante) abiertas sobre verde lotería,
con troquel y muescas reales, y «CC» en Barlow Condensed en la del frente. Fuente en `design/icon/*.svg`;
los PNG (192, 512, maskable 512 con el motivo en el 80 % central, `apple-touch-icon` 180 opaco) se generan con
`npm run icons`. El favicon (`public/favicon.svg`) es el mismo abanico sin texto.

### Grupos (variante C de 3, elegida por el usuario: «Acción primero, hoja inferior»)
- **Acciones de inicio**: dos baldosas de 88 px a dos columnas bajo el título «Grupos»: «Nuevo grupo» en verde
  lotería (icono `Plus`) y «Unirme con un enlace» en `hoja` con sombra plana (icono `Link2`). Son enlaces.
- **Lista de grupos**: tarjeta plana con filas de ≥64 px separadas por `papel-hondo`; cada fila lleva una marca de
  40 px (radio 8 px) en el talón del grupo (estable por id) con la inicial en condensada, nombre (600), «n miembros»
  y chevron. Vacío: caja discontinua; carga: esqueleto de tres filas; error: tarjeta con Reintentar.
- **Detalle**: nombre en condensada 2rem, «n miembros · Euro (€)» y botón «Invitar» (44 px, verde lotería,
  `UserPlus`); control segmentado Gastos · Saldos · Miembros (`papel-hondo`, pestaña activa en `hoja`, 44 px, flechas
  del teclado). Miembros: filas con círculo de 36 px en el talón de su orden de llegada (nunca dos seguidos iguales),
  «Tú» y «Administra» a la derecha.
- **Hoja inferior** (`<dialog>` modal): fondo `hoja`, radio 16 px arriba, asa decorativa y ✕ de 44 px; sube con un
  ease-out exponencial de 280 ms sobre un velo de tinta al 38 %. «Invitar» lleva una participación compacta en menta
  («Invita a <grupo>», enlace en un campo de solo lectura) y «Compartir enlace» (hoja nativa, solo si existe) sobre
  «Copiar enlace»; el aviso «Enlace copiado.» va en verde a favor con `aria-live`.
- **Invitación** (`/unirse/:code`): sin sesión, participación menta «Te han invitado» con «Crear cuenta y unirme» y
  «Ya tengo cuenta: entrar»; con sesión, título «Invitación», tarjeta plana con la marca del grupo (56 px), nombre y
  miembros, y «Unirme al grupo» + «Ahora no». Al unirse, franja `loteria-claro` «Ya estás en «…».».
- **Nuevo grupo** y **Unirme con un enlace**: participación (mantequilla y menta) con un campo y el botón principal;
  la moneda se muestra como texto fijo sobre `papel`.

### Gastos y saldos (variante A de 3, elegida por el usuario: «Boleto»)
- **Añadir gasto**: el gasto es una participación. Talón mantequilla con «Importe» y la cifra (2.75rem, el «€» pegado
  detrás: el campo mide lo que su texto) y el concepto en un campo blanco translúcido; troquel; cuerpo con Pagó
  (select) | Fecha (`type="date"` nativo) a dos columnas y «A partes iguales entre» con una fila de ≥52 px por persona
  (casilla nativa en verde lotería, círculo de su talón, nombre, cuota en vivo) separadas por punteado; «Todos /
  Ninguno» a la derecha; nota de céntimos sobrantes. Error del importe: anillo rojo sello. Salir con el gasto a
  medio escribir pide confirmación.
- **Pestaña Gastos** (por defecto; pestaña en la URL `?seccion=`): botón principal «Añadir gasto»; días («Hoy · 22
  nov», «Ayer · 21 nov», «20 nov») con su total a la derecha; filas con el círculo del pagador, concepto, «Pagó X»,
  importe en negrita y «te toca X» / «no participas» en nota. «Invitar» pasa a botón secundario.
- **Pestaña Saldos**: participación compacta menta «Tu saldo» con «Te deben 301,82 €» (verde a favor) / «Debes …»
  (rojo sello) / «Estás en paz» y el desglose «Has pagado X y te tocan Y» (+ «Has hecho / recibido pagos por Z»);
  debajo «Para saldar cuentas» y «Todo el grupo» (acreedores primero).
- **Detalle del gasto**: igual que el formulario: cifra y concepto en el talón; quién pagó, la fecha y el reparto
  (mismo orden que el formulario) bajo el troquel.
- **Grupos**: línea «En total te deben / debes …» bajo «Tus grupos» y el saldo en cada fila, bajo «n miembros».

### Editar, borrar y actividad (variante A de 3, elegida por el usuario: «Pie del boleto»)
- **Detalle del gasto**: bajo el boleto, nota «Lo añadió X» / «Lo añadiste tú» (+ « · editado hoy a las 21:14»). Solo
  quien lo añadió ve dos botones a medias: «Editar» (secundario, `Pencil`) y «Borrar» (peligro, `Trash2`). Los demás
  leen «Solo X puede editarlo o borrarlo, porque lo añadió.».
- **Editar**: el mismo boleto relleno, botón «Guardar cambios» («Guardando…»); salir con cambios pide confirmación. Si
  otro cambio llegó antes: aviso y «Ver la versión nueva» en lugar del botón principal.
- **Borrar**: hoja inferior (como «Invitar») con «¿Borrar este gasto?» en condensada 1.5rem, tarjeta blanca con concepto
  e importe, qué pasa con los saldos, «Borrar gasto» (destructivo) y «Cancelar» (con el foco inicial). Al terminar,
  vuelve al grupo con la franja `loteria-claro` «Gasto borrado: «…».».
- **Actividad**: cuarta pestaña del control segmentado (por debajo de 360 px, etiquetas a 0.8125rem). Días como en
  Gastos (sin total) y tarjeta plana con filas de ≥56 px: círculo del autor, «**Nombre** verbo «concepto»» (con «Tú»,
  verbo en segunda persona), línea de detalle en `tinta-suave` (importe; cambios «36,00 € → 42,50 € · antes «Cena» ·
  entra Marta»; borrado con el importe tachado y quién pagó) y la hora a la derecha. Las filas de un gasto vivo abren
  su detalle. «Ver más» (secundario) cada 50.

### Tipos de reparto (variante B de 3, elegida por el usuario: «Frase y hoja»)
Principio del usuario: lo más minimalista posible y sin fricción al apuntar un gasto.
- **Frase**: en lugar de «A partes iguales entre», «Se reparte **a partes iguales** ▾» (la opción en verde lotería,
  subrayada, 44 px de zona táctil). Por defecto el formulario es el de siempre; «Todos / Ninguno» solo a partes iguales.
- **Hoja «¿Cómo se reparte?»**: tres opciones con radio nativo, título y una línea de explicación; elegir cierra la hoja
  al momento (sin botón de confirmar).
- **Por importes / por porcentajes**: sin casillas; cada fila lleva un campo blanco de 44 px a la derecha (importe
  7.25rem con «€», % 5.75rem con «%»), relleno con el reparto igual entre quienes participaban; vacío o 0 = no participa.
  En porcentajes, bajo el nombre, lo que le toca en euros cuando ya suman 100 %.
- **Línea de suma** bajo las filas: «110,00 € de 120,00 € · Faltan 10,00 €» / «83,33 % de 100 % · Faltan 16,67 %» en
  `papel`; «✓ Cuadra» en `loteria-claro`; en `sello-claro` solo tras intentar guardar sin cuadrar.
- **Detalle**: «Reparto · por porcentajes» y el % de cada fila en nota antes del importe.

### Pagos y saldar cuentas (variante A de 3, elegida por el usuario: «Saldar en Saldos»)
- **Para saldar cuentas · n pagos** (pestaña Saldos, bajo «Tu saldo»): tarjeta plana con una fila de ≥60 px por pago
  mínimo: círculo de quien paga → (flecha `ArrowRight` en `tinta-tenue`) → círculo de quien cobra, «Pagas a Ana» /
  «Marta te paga» / «Marta paga a Ana» y el importe en negrita; en los pagos en que participas, botón «Registrar»
  (44 px, verde lotería). Sin pagos pendientes, la sección no aparece.
- **Registrar pago**: hoja inferior con participación compacta **cielo** («Registrar pago»): quién → quién, importe
  (cifra 2.75rem, relleno con lo sugerido y editable) y fecha a la derecha; nota «Regístralo cuando el pago ya esté
  hecho…»; si el importe supera lo sugerido, aviso en `tinta-suave` (no bloquea). Al terminar, franja `loteria-claro`
  «Pago registrado: 12,50 € a Ana.» y la pantalla se actualiza sin recargar.
- **En Gastos**: fila propia con círculo `loteria-claro` y flecha, «Pago a Ana» / «Pago a ti», «Pagaste tú» / «Pagó X» e
  importe; no suma al total del día.
- **Detalle del pago**: boleto con talón cielo (importe y «Pago a Ana»), bajo el troquel quién → quién y la fecha; «Lo
  registraste tú» y «Borrar pago» (peligro, hoja de confirmación) solo para quien lo registró.
- **Actividad**: «Tú pagaste 12,50 € a Ana», «Bea te pagó 10,00 €», «Ana registró un pago de Marta: 27,50 €», «Luis borró
  un pago» (importe tachado · de X a Y).

### Participación (componente propio)
Talón superior en papel de color con el título en condensada, línea troquelada con muescas y cuerpo en
`hoja` con el contenido. Es el contenedor de formularios clave y, más adelante, de cada parte de un gasto.

## Do's and Don'ts

### Do:
- Do usar una participación para el bloque principal de una pantalla de tarea.
- Do reservar el rojo sello para deuda, errores y acciones destructivas.
- Do mostrar carga (esqueleto), vacío (qué hacer) y error (con Reintentar) en cada pantalla.
- Do mantener zonas táctiles ≥44 px e inputs ≥16 px.

### Don't:
- Don't usar la condensada en etiquetas, botones o cifras.
- Don't añadir texturas de papel, guilloches ni sellos falsos: el mundo entra por color, tipo y troquel.
- Don't usar fondos crema ni acentos neón.
- Don't poner antetítulos (kickers) sobre los títulos.
