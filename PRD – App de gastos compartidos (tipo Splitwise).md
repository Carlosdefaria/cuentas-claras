# docs/PRD.md

Nov 16, 2026 · @Carlos

## 1. Resumen y visión

Una microapp web para registrar gastos compartidos en grupo y saber, en cualquier momento, quién debe cuánto a quién, con el mínimo de pagos para saldar.

**Problema:** en viajes, pisos o cenas, apuntar gastos en un chat o una hoja de cálculo genera errores, olvidos y discusiones.

**Propuesta de valor:** crear un grupo, añadir un gasto en menos de 15 segundos y ver saldos claros y actualizados.

**Diferenciación (hipótesis):** sin límites de gastos diarios ni anuncios, interfaz mínima y en español, entrada sin fricción por enlace de invitación.

*Nota: los datos del documento son supuestos iniciales; ajusta lo que no encaje.*

## 2. Objetivos y métricas de éxito

| Objetivo | Métrica | Meta MVP |
| --- | --- | --- |
| Registrar gastos rápido | Tiempo medio para añadir un gasto | < 15 s |
| Que los grupos se usen | Grupos con ≥ 3 gastos en la 1.ª semana | ≥ 40 % |
| Que se salden deudas | Grupos con al menos un pago registrado | ≥ 30 % |
| Entrada sin fricción | Invitados que se unen tras abrir el enlace | ≥ 60 % |
| Fiabilidad de cálculos | Errores de saldo reportados | 0 |

## 3. Usuarios objetivo

- **Viajeros en grupo** (amigos, pareja): muchos gastos en poco tiempo, pagan personas distintas.
- **Compañeros de piso**: gastos recurrentes (alquiler, luz, compra) durante meses.
- **Organizadores de eventos** (cenas, regalos): un pagador adelanta y los demás reembolsan.

Todos comparten una necesidad: transparencia y cero fricción; los invitados no deberían tener que instalar nada.

## 4. Alcance del MVP

| Dentro (MVP) | Fuera (v2+) |
| --- | --- |
| Registro e inicio de sesión (email) | Login social (Google, Apple) |
| Grupos e invitación por enlace | App móvil nativa |
| Gastos con reparto igual, por importes o por porcentajes | Gastos recurrentes automáticos |
| Saldos por persona y por grupo | OCR de tickets |
| Simplificación de deudas | Multidivisa con conversión automática |
| Registrar pagos (liquidaciones) | Pagos integrados (Bizum, PayPal) |
| Historial de actividad y editar/borrar gastos | Invitados sin cuenta, notificaciones push, exportar a CSV/PDF |

## 5. Historias de usuario y requisitos funcionales

| ID | Como… | Quiero… | Criterio de aceptación |
| --- | --- | --- | --- |
| RF-01 | Usuario | Registrarme e iniciar sesión con email | Cuenta creada y sesión persistente |
| RF-02 | Usuario | Crear un grupo con nombre y moneda | El grupo aparece en mi lista |
| RF-03 | Miembro | Invitar por enlace | Quien abre el enlace entra tras identificarse |
| RF-04 | Miembro | Añadir un gasto (descripción, importe, pagador, participantes, fecha) | Aparece en el historial y actualiza saldos |
| RF-05 | Miembro | Elegir cómo se reparte: igual, importes exactos o porcentajes | La suma del reparto coincide con el total |
| RF-06 | Miembro | Editar o borrar un gasto | Saldos recalculados; queda registro en la actividad |
| RF-07 | Miembro | Ver cuánto debo y me deben, por grupo y total | Saldos coinciden con el historial |
| RF-08 | Miembro | Ver los pagos mínimos para saldar el grupo | Lista "A paga X a B" |
| RF-09 | Miembro | Registrar un pago entre dos personas | Reduce la deuda entre ambos |
| RF-10 | Miembro | Ver el historial de actividad del grupo | Orden cronológico con autor y fecha |
| RF-11 | Admin del grupo | Quitar miembros o borrar el grupo | Solo si no tiene saldos pendientes (o con aviso) |

## 6. Reglas de negocio

**Saldo de una persona** = lo que ha pagado − lo que le corresponde + pagos recibidos − pagos realizados. Positivo = le deben; negativo = debe.

1. Los importes se guardan en **céntimos (enteros)**, nunca en decimales flotantes.
2. En un reparto igual, el resto de céntimos se asigna de forma determinista (p. ej. al pagador o por orden de ID).
3. La suma de los saldos de un grupo siempre es 0.
4. **Simplificación de deudas:** algoritmo voraz que empareja al mayor deudor con el mayor acreedor hasta saldar; resultado ≤ n−1 pagos.
5. Un gasto borrado se marca como eliminado (*soft delete*) para conservar el historial.
6. Moneda única en el MVP: euros (EUR) para todos los grupos.

## 7. Flujos y pantallas clave

**Flujo principal:**

1. Registro / login.
2. Crear grupo y copiar enlace de invitación.
3. Los miembros se unen con el enlace.
4. Añadir gasto → saldos se actualizan al instante.
5. Ver "Saldar cuentas" → registrar pago.

**Pantallas MVP:**

- Login / registro
- Lista de grupos (con saldo por grupo)
- Detalle de grupo: pestañas *Gastos*, *Saldos*, *Miembros*
- Formulario de gasto (modal o página)
- Saldar cuentas (pagos sugeridos + botón "Registrar pago")
- Perfil / ajustes

## 8. Modelo de datos

| Entidad | Campos principales | Relaciones |
| --- | --- | --- |
| User | id, nombre, email, created\_at | Pertenece a N grupos |
| Group | id, nombre, moneda, created\_by, invite\_code | Tiene N miembros, N gastos |
| Membership | user\_id, group\_id, rol (admin/miembro) | Une User y Group |
| Expense | id, group\_id, descripción, importe\_cent, paid\_by, fecha, deleted\_at | Tiene N repartos |
| ExpenseShare | expense\_id, user\_id, importe\_cent | Cuota que debe cada participante |
| Settlement | id, group\_id, from\_user, to\_user, importe\_cent, fecha | Pago entre dos miembros |
| Activity | id, group\_id, actor, tipo, payload, created\_at | Registro de cambios |

Los saldos **no se almacenan**: se calculan a partir de Expense, ExpenseShare y Settlement.

## 9. Requisitos no funcionales

- **Rendimiento:** carga inicial < 2 s; cálculo de saldos < 200 ms para grupos de hasta 50 miembros y 5.000 gastos.
- **Seguridad:** HTTPS, contraseñas con hash (bcrypt/argon2), acceso a datos solo para miembros del grupo (RLS o comprobación en backend).
- **Privacidad:** uso personal/grupo cerrado: datos mínimos y borrado de cuenta bajo petición; revisar RGPD completo si se hace público.
- **Usabilidad:** *mobile-first*, responsive, accesible (WCAG AA).
- **Fiabilidad:** copias de seguridad diarias; operaciones de gasto atómicas.
- **Idioma:** español en el MVP; textos preparados para i18n.

## 10. Stack técnico propuesto

Propuesta ligera para una microapp; es una sugerencia, no una decisión cerrada.

| Capa | Opción | Motivo |
| --- | --- | --- |
| Frontend | React + Vite (o Next.js) + Tailwind | Rápido de montar, responsive |
| Backend / BD | Supabase (Postgres + Auth + RLS) | Auth y BD incluidas, plan gratuito |
| Alternativa | Flask/FastAPI + PostgreSQL (descartada) | Se elige Supabase |
| Despliegue | Vercel&#32; | Despliegue desde GitHub |
| Tests | Vitest/Pytest sobre la lógica de saldos | El cálculo es el núcleo del producto |

## 11. Roadmap, riesgos y preguntas abiertas

**Fases:**

1. **Fase 1 – Núcleo:** auth, grupos, gastos con reparto igual, saldos.
2. **Fase 2 – Liquidación:** reparto por importes/porcentajes, simplificación de deudas, pagos, historial.
3. **Fase 3 – Pulido:** invitaciones, edición/borrado, responsive, tests, despliegue.
4. **Después:** multidivisa, recurrentes, notificaciones, exportación.

**Riesgos:**

| Riesgo | Mitigación |
| --- | --- |
| Errores de redondeo en saldos | Céntimos enteros + tests unitarios |
| Fuga de datos entre grupos | RLS / permisos por membresía + tests |
| Alcance que crece | Respetar la tabla Dentro/Fuera del MVP |

**Decisiones tomadas:**

- **Uso:** personal / grupo cerrado; no se comercializa, el código estará en GitHub.
- **Acceso:** registro obligatorio con email en el MVP; invitados sin cuenta en v2.
- **Stack:** Supabase (Postgres + Auth + RLS).
- **Moneda:** única, euros (EUR), por ahora.
