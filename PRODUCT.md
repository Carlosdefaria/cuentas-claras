# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA instalable en la pantalla de inicio del móvil (modo `standalone`). **iOS primero** (Safari y app
instalada); Android más adelante. Mobile web sigue siendo `web`: no se imita el lenguaje de diseño nativo.

## Users

Grupos cerrados de personas que comparten gastos, en tres situaciones que pesan **por igual**:

- **Viajeros en grupo** (amigos, pareja): muchos gastos en pocos días, pagan personas distintas y se apuntan
  desde el móvil al momento.
- **Compañeros de piso**: gastos recurrentes durante meses (alquiler, luz, compra); consultan el saldo de vez en cuando.
- **Organizadores de cenas, regalos o eventos**: una persona adelanta el dinero y las demás le reembolsan.

El trabajo común: apuntar un gasto rápido y saber en cualquier momento quién debe cuánto a quién, sin discusiones.
Uso personal / grupo cerrado; no se comercializa.

## Product Purpose

Registrar gastos compartidos y calcular saldos claros, con el mínimo de pagos para saldar el grupo.
Éxito (PRD §2): añadir un gasto en menos de 15 s, grupos con ≥ 3 gastos en la primera semana, grupos que
registran al menos un pago, invitados que se unen tras abrir el enlace y **cero errores de saldo**.

## Positioning

Hipótesis del PRD: sin límites de gastos diarios ni anuncios, interfaz mínima y en español, y entrada sin
fricción por enlace de invitación. Los cálculos son exactos al céntimo (enteros, reparto determinista).

## Operating Context

- Se usa con una mano, de pie o en movimiento (terraza, taxi, supermercado), en pantallas estrechas.
- Los invitados entran por un enlace de invitación y se registran con email.
- Flujo principal: entrar → crear grupo y compartir enlace → los demás se unen → añadir gastos →
  ver saldos → "Saldar cuentas" y registrar pagos.
- La base de datos se duerme cuando no se usa: la primera acción tras un rato debe funcionar igual.

## Capabilities and Constraints

- MVP (PRD §4): registro/login por email, grupos con invitación por enlace, gastos con reparto igual,
  por importes o por porcentajes, saldos por persona y grupo, simplificación de deudas, pagos, historial de
  actividad y editar/borrar gastos (borrado lógico).
- Fuera del MVP: login social, app nativa, recurrentes, OCR, multidivisa, pagos integrados, invitados sin
  cuenta, notificaciones push, exportar.
- Moneda única **EUR**; importes en céntimos enteros; formato español (`1.234,56 €`).
- Verificación de email y recuperación de contraseña **por código**, nunca por enlace (la PWA de iOS no
  comparte sesión con Safari).
- Terminología: grupo, gasto, pagador, participantes, reparto, saldo, "le deben" / "debe", pago, saldar cuentas.
- Stack y reglas técnicas: ver `CLAUDE.md`.

## Brand Commitments

- Nombre: **Cuentas Claras**.
- Voz: **tú, cercana y clara**. Frases directas ("Añade un gasto", "Te deben 12,50 €"), sin bromas forzadas.
- Idioma: español (textos centralizados, preparados para i18n).
- No hay logo, icono ni colores de marca previos: la identidad y el icono de la PWA están por diseñar.

## Evidence on Hand

- `docs/PRD.md`: requisitos, métricas y reglas de negocio.
- No hay usuarios reales, testimonios, capturas ni datos de uso: no inventarlos.

## Product Principles

1. **Rapidez antes que opciones**: apuntar un gasto es la acción reina; todo lo demás no estorba.
2. **Saldos que no se discuten**: cada cifra cuadra con el historial y se entiende quién debe a quién.
3. **Cero fricción para entrar**: un enlace y un registro por email bastan; nada que instalar salvo la PWA.
4. **Una mano, cualquier sitio**: pensada para el móvil en movimiento, con iOS como referencia.
5. **Honestidad en los estados**: carga, vacío y error siempre visibles; nunca datos de otro usuario ni de caché.

## Accessibility & Inclusion

- WCAG AA (PRD §9); zonas táctiles ≥ 44 px; inputs ≥ 16 px; zoom del navegador siempre permitido.
- Respetar el tamaño de texto del sistema y safe-area (notch, barra de inicio).
