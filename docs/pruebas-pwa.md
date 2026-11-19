# Pruebas de la PWA en móviles reales

Lista para comprobar en un iPhone y en un Android antes de dar por buena cada fase.
Se prueba siempre contra un **despliegue de prueba con HTTPS** (Vercel Preview) que usa la rama
`test` de Neon. Production no se usa para pruebas.

Apunta en cada prueba: dispositivo, versión del sistema, navegador y resultado (OK / falla + captura).

## 0. Preparación

- [ ] Abrir la URL del despliegue de prueba (la URL estable de la rama, no la de un commit concreto).
- [ ] Comprobar que carga por **HTTPS** (candado) y sin avisos de certificado.
- [ ] Tener a mano una cuenta de prueba en la rama `test` o crear una nueva durante la prueba.

## 1. Instalación

### Android (Chrome)
- [ ] Al abrir la web, Chrome ofrece **"Instalar app"** (banner o menú ⋮ → Instalar app).
      Si solo ofrece "Añadir a pantalla de inicio" (acceso directo), el manifest o el service worker fallan.
- [ ] Instalar. El icono aparece en el cajón de apps y en la pantalla de inicio, **con forma adaptada**
      (icono maskable: sin bordes blancos ni recortes raros).
- [ ] Al abrirla: **sin barra de direcciones** (modo standalone) y con el color de tema en la barra de estado.
- [ ] Pantalla de arranque (splash) con el color de fondo y el icono.

### iOS (Safari)
- [ ] La web muestra la **ayuda de instalación**: Compartir → "Añadir a pantalla de inicio"
      (iOS no tiene botón de instalar automático). No debe aparecer en Android ni si ya está instalada.
- [ ] Seguir los pasos. El icono de la pantalla de inicio es el `apple-touch-icon` (no una captura de la web).
- [ ] Al abrirla: **sin barra de Safari**, con la barra de estado correcta y sin contenido bajo el notch.

## 2. Sesión (lo más delicado en iOS)

Hacer estas pruebas **dentro de la app instalada**, no en el navegador.

- [ ] Registrarse con un email nuevo. Entra directamente (o pide el código de verificación si está activado).
- [ ] Cerrar la app del todo (deslizar en el multitarea) y volver a abrirla → **sigue con la sesión iniciada**.
- [ ] Reiniciar el móvil y abrir la app → sigue con la sesión iniciada.
- [ ] Volver a probar al día siguiente → sigue con la sesión iniciada.
- [ ] Cerrar sesión → vuelve a la pantalla de entrada. Reabrir la app → sigue sin sesión.
- [ ] Entrar con contraseña incorrecta → mensaje claro en español ("Email o contraseña incorrectos").
- [ ] iOS: la sesión de la app instalada es **independiente** de Safari. Iniciar sesión en Safari
      no debe iniciarla en la app ni al revés (es lo esperado; anotarlo si no es así).

### Verificación y recuperación por código (si están activadas)
- [ ] Al registrarse llega un email con un **código** (no un enlace).
- [ ] Escribir el código en la app: el teclado es numérico y iOS ofrece **autocompletar el código** desde Mail.
- [ ] Recuperar contraseña: llega un código, se introduce en la app y se puede entrar con la nueva contraseña,
      todo **sin salir de la app**.

## 3. Navegación y diseño

- [ ] Barra inferior visible y **no tapada** por la barra de gestos de iOS/Android.
- [ ] Nada queda bajo el notch o la isla dinámica (safe-area), ni en vertical ni en horizontal.
- [ ] El botón **Volver** aparece en todas las pantallas secundarias y funciona (en iOS standalone no hay gesto).
- [ ] Botón atrás del sistema en Android: vuelve a la pantalla anterior, no cierra la app de golpe.
- [ ] Todo se puede usar **con una mano**; ningún botón es difícil de pulsar (zonas de ≥ 44 px).
- [ ] Al tocar un campo de texto **no hace zoom** (fuente ≥ 16 px), pero se puede hacer zoom con dos dedos.
- [ ] Importes alineados (números tabulares) y en formato español: `1.234,56 €`.
- [ ] Cada pantalla muestra bien sus estados: **cargando**, **vacía** (con texto útil) y **error** (con opción de reintentar).
- [ ] Modo oscuro del sistema (si la app lo soporta): textos legibles.

## 4. Sin conexión y actualizaciones

- [ ] Con la app abierta, activar el modo avión → aparece un aviso de sin conexión, no una pantalla en blanco.
- [ ] Abrir la app en modo avión → carga la interfaz (service worker) y avisa de que no hay conexión.
- [ ] Tras publicar una versión nueva, al reabrir la app se actualiza (o avisa de que hay versión nueva).

## 5. Qué anotar si algo falla

- Dispositivo, sistema y versión (p. ej. iPhone 13, iOS 19.1).
- Si pasa en la app instalada, en el navegador o en ambos.
- Captura de pantalla o vídeo.
- Hora aproximada (para buscar en los registros de Neon Auth y Vercel).
