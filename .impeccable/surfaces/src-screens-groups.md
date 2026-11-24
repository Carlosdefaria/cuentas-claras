---
version: 1
slug: "src-screens-groups"
primary_target: "src/screens/groups"
related_targets: ["src/components/AppShell.tsx"]
---

# Superficie: grupos (lista, nuevo grupo, detalle con miembros, invitar y unirse)

Modo: Operate. Construcción: code-led (variantes en imagen; el usuario eligió la C de 3).
Alcance: `/` (Grupos), `/grupos/nuevo`, `/grupos/:id` (detalle, pestañas Gastos · Saldos · Miembros; hoy solo
Miembros tiene contenido) con la hoja «Invitar», y `/unirse/:code` (pública, con y sin sesión).
Usuario y tarea: quien organiza crea el grupo y comparte el enlace desde el iPhone; quien lo recibe se registra,
confirma el email y se une con un toque. Estados: cargando, vacío, error con Reintentar, enlace no válido, ya
eres miembro, sin conexión.
Restricciones: controles estándar, ≥44 px, inputs ≥16 px, nada de datos en caché, hoja nativa de compartir
(`navigator.share`) con «Copiar enlace» de respaldo. La invitación sin sesión no muestra el nombre del grupo
(la Data API exige JWT). En iOS, unirse en Safari antes de instalar; en la app, «Unirme con un enlace» pegando.
Decisiones abiertas: saldo por grupo en la lista (llega con los gastos).

## Direction contract

THESIS: La pantalla de grupos es un punto de partida: las dos acciones que mueven el producto (crear y unirse)
arriba, la lista compacta debajo. Rechaza el tablero de tarjetas decorativas donde la acción queda al fondo.

OWN-WORLD: El del sistema (DESIGN.md): papel verde agua, barra verde lotería, talones de color por grupo y por
persona; troquel en las participaciones de las pantallas de tarea (Nuevo grupo, Unirme con un enlace, invitación
sin sesión) y en la de la hoja «Invitar», en el talón del grupo. Lista en tarjeta plana con filas de 64 px y un
monograma en cuadro del talón del grupo (sustituye a la tira vertical de la maqueta: la tira apenas se veía).

STORY: Ve sus grupos y sabe qué hacer en un segundo; crea uno, lo comparte con la hoja nativa y los demás
aparecen como miembros. Quien recibe el enlace se une sin perderse en el registro.

FIRST VIEWPORT: Título «Grupos» en condensada; debajo dos acciones de 88 px a dos columnas (Nuevo grupo en verde
lotería, Unirme con un enlace en hoja); después «Tus grupos» y la lista. En el detalle: nombre en condensada,
«n miembros · Euro (€)», control segmentado Gastos · Saldos · Miembros y botón Invitar; la hoja inferior lleva
una participación menta «Invita a <grupo>» y los botones Compartir enlace / Copiar enlace.

FORM: «Acción primero, hoja inferior», posición 7 de mi lista (repartida por la tirada: 5, 1, 7; el usuario eligió
la 7). seed:5cc768e3e5ed981f (tirada degradada, sin retadores).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Quitar miembros y borrar el grupo (RF-11)

FORM: «Ficha de persona», variante C de 3 (A «Quitar en la fila», B «Saldo a la vista»). Reglas del usuario: solo quien
administra; quitar solo con saldo 0; borrar solo con todos en paz; quien ya no está no vuelve con el enlace y lo suyo queda
de solo lectura. Fuera: salir por iniciativa propia, más administradores, recuperar un grupo borrado.

CRITIQUE (⚠️ DEGRADED: single-context, sin sub-agentes por política de la sesión): detector limpio (regex) en los ficheros
tocados; revisión visual en WebKit (iPhone 15) de la lista, las dos fichas, las dos hojas de borrar, Gastos, detalle de solo
lectura, Actividad, invitación rechazada y aviso en Grupos; web-design-guidelines sin hallazgos. Fiel a la maqueta C; la nota
«Toca a alguien…» solo sale si hay a quién tocar.
