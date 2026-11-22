---
version: 1
slug: "src-screens-auth"
primary_target: "src/screens/auth"
related_targets: ["src/components/AppShell.tsx"]
---

# Superficie: acceso (entrar, registro) y armazón de la app

Modo: Operate. Construcción: code-led (sin generación de imágenes).
Alcance: pantallas /entrar y /registro, armazón autenticado (barra superior, barra inferior Grupos/Cuenta),
pantalla Grupos vacía y Cuenta con cerrar sesión. Primera superficie de un mundo nuevo.
Usuario y tarea: alguien de un grupo cerrado que abre la PWA en el iPhone, con una mano, para entrar o crear
cuenta en segundos y llegar a sus grupos. Estados: comprobando sesión, error de credenciales, sin conexión,
cuenta ya existente, enviando.
Restricciones: controles estándar (inputs, botones, enlaces, barra de pestañas), ≥44 px, inputs ≥16 px,
safe-area, español con tú cercano, sin datos de usuario en caché.
Decisiones abiertas: modo oscuro (de momento claro).
Decidido: icono de la PWA «Talones en abanico» (variante C de 4, elegida por el usuario); ayuda de instalación
iOS compacta sobre la participación de Entrar/Registro y completa en Cuenta; avisos de sin conexión y versión
nueva bajo la barra superior. Pantallas de código (verificar email, recuperar contraseña en dos pasos: variante
C de 3, elegida por el usuario) con un único campo de código, talón menta, y «Recupera tu contraseña» en mantequilla.

## Direction contract

THESIS: Repartir dinero entre amigos ya tiene un objeto en España: la participación de lotería. Cada parte de
un gasto es una participación con su talón. Rechaza la app de finanzas genérica de tarjetas blancas con acento verde.

OWN-WORLD: Fondo de papel verde agua muy pálido (no crema), tinta verde casi negra, barra de app en verde
lotería profundo, sello rojo para «debes» y errores, verde intenso para «te deben». Talones en papeles de
colores suaves (menta, salmón, cielo, mantequilla, lila), uno por persona. Borde troquelado (línea punteada con
muescas) como única ornamentación. Rótulos en una grotesca condensada; interfaz y cifras en la sans del sistema
con números tabulares.

STORY: Entiende al instante que es su app de cuentas del grupo, entra o se registra sin pensar, y aterriza en
Grupos, que le explica qué hacer primero.

FIRST VIEWPORT: Barra superior verde con el nombre en grotesca condensada; debajo, una participación centrada: talón
superior con el título «Entra en tu cuenta», línea troquelada, y debajo email, contraseña y el botón principal a
ancho completo; enlace para crear cuenta bajo la tarjeta. Gesto propio: la línea troquelada que separa talón y cuerpo.

FORM: Participaciones de lotería, posición 1 de mi lista (pick elegido por el usuario; la tirada asignó la 3).
seed:283e85cff5b3f60b

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
