# Pruebas de la PWA en iPhone (iOS)

Lista para comprobar en un iPhone real antes de dar por buena cada fase. **iOS es la prioridad**;
Android queda para más adelante (sección final).

Se prueba siempre contra el **despliegue de prueba con HTTPS** (Vercel Preview), que usa la rama
`test` de Neon. Production no se usa para pruebas.

Apunta en cada prueba: modelo de iPhone, versión de iOS, dónde (Safari o app instalada) y resultado
(OK / falla + captura).

## 0. Preparación

- [ ] Abrir en **Safari** la URL estable del despliegue de prueba (la de la rama, no la de un commit concreto).
- [ ] Carga por **HTTPS** (candado) y sin avisos de certificado.
- [ ] Ajustes → Safari: sin bloqueadores de contenido raros (anotar si usas alguno).

## 1. En Safari (antes de instalar)

- [ ] La web carga y se ve bien en vertical; nada queda bajo el notch o la isla dinámica.
- [ ] Registrarse con un email nuevo → entra (o pide el código de verificación si está activado).
- [ ] Recargar la página → **sigue con la sesión iniciada**.
- [ ] Cerrar la pestaña, abrir otra con la misma URL → sigue con la sesión iniciada.
- [ ] Cerrar sesión → vuelve a la pantalla de entrada.
- [ ] Entrar con contraseña incorrecta → mensaje claro en español ("Email o contraseña incorrectos").
- [ ] Al tocar un campo de texto **no hace zoom**, pero se puede ampliar con dos dedos.
- [ ] En Entrar/Registro aparece la **ayuda de instalación** compacta («Instálala en tu iPhone»,
      Compartir → "Añadir a pantalla de inicio") y **el botón Entrar sigue visible sin hacer scroll**.
- [ ] La ✕ oculta la ayuda y no vuelve a salir al recargar. En Cuenta sigue disponible (versión completa).
- [ ] Los pasos coinciden con lo que ve Safari en tu versión de iOS (Compartir puede estar en el menú ···).

## 2. Instalación

- [ ] Compartir → "Añadir a pantalla de inicio". El nombre propuesto es el corto de la app.
- [ ] El icono de la pantalla de inicio es el de la app («talones en abanico» sobre verde), no una captura de la web,
      y el nombre bajo el icono es «Cuentas».
- [ ] Abrir desde el icono: **sin barra de Safari** (modo standalone) y barra de estado legible.
- [ ] Pantalla de arranque sin destellos blancos largos (no hay `apple-touch-startup-image` a propósito; si se ve
      un destello blanco molesto, anotarlo y se añaden).
- [ ] Dentro de la app instalada, la ayuda de instalación **ya no aparece**.

## 3. Sesión dentro de la app instalada (lo más delicado)

- [ ] La primera vez hay que **iniciar sesión de nuevo**: la app instalada no comparte sesión con Safari
      (es lo esperado en iOS).
- [ ] Iniciar sesión → entra.
- [ ] Cerrar la app del todo (deslizar hacia arriba en el multitarea) y reabrirla → **sigue con la sesión iniciada**.
- [ ] Bloquear el móvil 10 minutos, desbloquear y abrir → sigue con la sesión iniciada y los datos cargan.
- [ ] Reiniciar el iPhone y abrir la app → sigue con la sesión iniciada.
- [ ] Al día siguiente → sigue con la sesión iniciada.
- [ ] Tras unas horas sin usarla, la **primera acción** (p. ej. crear un grupo) funciona a la primera,
      sin "No autenticado" ni listas vacías (la base de datos estaba dormida).
- [ ] Cerrar sesión → pantalla de entrada. Reabrir la app → sigue sin sesión.

### Verificación de email y recuperación de contraseña (por código)
- [ ] Al registrarse llega un email con un **código** (no un enlace).
- [ ] Al escribir el código en la app, el teclado es numérico y iOS **sugiere el código** encima del teclado.
- [ ] Recuperar contraseña: llega un código, se introduce en la app y se entra con la nueva contraseña,
      **sin salir de la app**.
- [ ] Si se abre el email en Mail, ningún enlace saca al usuario de la app para completar el proceso.

## 4. Navegación y diseño (app instalada)

- [ ] Barra inferior visible y **no tapada** por la barra de inicio de iOS (la raya de abajo).
- [ ] Nada bajo el notch o la isla dinámica, ni en vertical ni en horizontal.
- [ ] El botón **Volver** aparece en todas las pantallas secundarias y funciona (no hay gesto de volver).
- [ ] Todo se puede usar **con una mano**; ningún botón es difícil de pulsar (zonas de ≥ 44 px).
- [ ] Al tocar un campo no hace zoom; el teclado no tapa el botón de enviar.
- [ ] Importes alineados (números tabulares) y en formato español: `1.234,56 €`.
- [ ] Cada pantalla muestra bien sus estados: **cargando**, **vacía** (con texto útil) y **error** (con opción de reintentar).
- [ ] Modo oscuro del sistema (si la app lo soporta): textos legibles.
- [ ] Tamaño de texto grande (Ajustes → Pantalla y brillo → Tamaño del texto): nada se corta ni se solapa.

## 5. Sin conexión y actualizaciones

- [ ] Con la app abierta, activar el modo avión → aviso de sin conexión, no una pantalla en blanco.
- [ ] Abrir la app en modo avión → carga la interfaz y avisa de que no hay conexión
      (los datos del usuario **no** deben mostrarse desde caché).
- [ ] Tras publicar una versión nueva, al volver a la app aparece «Hay una versión nueva · Actualizar»;
      la app **no se recarga sola**. Al pulsar Actualizar recarga con la versión nueva.

## 6. Qué anotar si algo falla

- Modelo de iPhone y versión de iOS (Ajustes → General → Información).
- Si pasa en la app instalada, en Safari o en ambos.
- Captura de pantalla o grabación de pantalla.
- Hora aproximada (para buscar en los registros de Neon Auth y Vercel).

---

## Android (más adelante)

Cuando toque, en Chrome: el banner o menú ⋮ → **Instalar app** (no solo "Añadir a pantalla de inicio"),
icono adaptado (maskable), modo standalone con color de tema, botón atrás del sistema y las mismas
pruebas de sesión, diseño y sin conexión de las secciones 3–5.
