# Informe de seguridad y evidencia

Fecha local: 25 de noviembre de 2026. Versión: archivos y lockfiles presentes en el espacio de trabajo, sin commit Git inicial. Entorno: Node 24.14.0 en Windows y PostgreSQL 17 temporal local, con rol de aplicación separado. No se ha verificado producción ni se han usado datos personales reales. Los resultados de integración están en [integracion-local.txt](evidencias/integracion-local.txt); los casos y aserciones están en `backend/test/integration.test.js`. Tres pruebas unitarias en `backend/test/crypto.test.js` pasaron localmente.

| OWASP 2025 | Riesgo y control / ubicación | Evidencia observada y riesgo o acción pendiente |
|---|---|---|
| A01 Control de acceso | Consultas por ID y dueño; autenticación y rol en `backend/src/app.js`. | En integración local B recibió 404 al leer, cambiar y borrar nota de A y la nota permaneció intacta; B no la listó. Usuario normal recibió 403 en administración. Pendiente: comprobar en navegador y producción. |
| A02 Configuración | Helmet en API; CSP y cabeceras de HTML previstas en `frontend/vercel.json.example`. | Pendiente: plantilla aún no es configuración activa, topología de proxy y cabeceras públicas; SecurityHeaders y objetivo A o superior. |
| A03 Cadena de suministro | Lockfiles npm, `npm ci`, Dependabot y auditoría en CI. | `npm audit` local el 25/11/2026: cero hallazgos de cualquier nivel en [backend](evidencias/npm-audit-backend.json) y [frontend](evidencias/npm-audit-frontend.json). Pendiente: CI real y nueva auditoría del commit final. |
| A04 Criptografía | Argon2id (19.456 KiB, 2 iteraciones, paralelismo 1); AES-256-GCM en `crypto.js`; TLS configurado para validar CA en producción. | Unitarias: dos cifrados distintos, alteración y clave incorrecta rechazadas. Integración: texto de nota no aparece en la fila. Pendiente: SSL Labs, validación TLS real y revisión del mecanismo de CA del endpoint. |
| A05 Inyección | Consultas parametrizadas y Zod; React renderiza texto. | En integración se guardó y recuperó una nota con apóstrofo y marcas HTML como texto. Pendiente: observar render literal en navegador, probar entradas inválidas sin cambio de filas y comprobar CSP efectiva. |
| A06 Diseño | Tabla de amenazas en `diseno.md`; máximo de 10.000 caracteres y 100 notas; bloqueo de fila del usuario para cuota. | En PostgreSQL temporal, dos creaciones simultáneas con 99 notas produjeron 201 y 429 y quedaron 100. Pendiente: prueba de carga razonable y revisión del diseño. |
| A07 Autenticación | Regeneración de sesión; límite absoluto e inactividad; contadores en PostgreSQL, bloqueo temporal por cuenta y red; Argon2id. | Integración: login, logout, expiración absoluta, vencimiento de sesión preparado en base y cookie con firma alterada rechazados; estado preparado produjo 429. Pendiente: comprobar renovación y transcurso real de inactividad, acceso posterior al bloqueo con reloj controlado y atribución de clientes tras proxies. Los contadores pueden ocasionar denegación temporal a una red compartida. |
| A08 Integridad | Cookie de `express-session` firmada; assets compilados propios; workflow de CI. | Firma alterada rechazada localmente. JWT y SRI para CDN no aplican: no se usan JWT ni scripts CDN. Pendiente: ejecución real de CI y bloqueo efectivo de despliegues fallidos. |
| A09 Logs y alertas | Pino JSON y tabla de eventos para logins, denegación administrativa, CSRF/origen y cambio de rol; alerta al quinto fallo. | Integración generó evento de acceso denegado y alerta con datos ficticios. Pendiente: comprobar visualización en navegador, evento real del comando de promoción y logs de Render; ampliar y revisar cobertura de otras denegaciones relevantes. |
| A10 Excepciones | Error público genérico con ID; timeout de base y correo; cierre por fallos no recuperables; `/health` devuelve 503 si falla consulta. | Valor cifrado corrupto produjo 500 genérico y log correlacionado en prueba local. Pendiente: probar indisponibilidad y cierre en proceso real y en producción. |

## Decisiones y riesgos

La cookie es HttpOnly, SameSite=Lax, host-only y Secure en producción; el token CSRF se obtiene de `/api/auth/csrf`, se envía en escrituras y se renueva al iniciar sesión. Se valida el origen exacto. El almacén es PostgreSQL, no memoria. La firma del identificador de `express-session` protege su integridad; GCM ya autentica los datos cifrados y no se agrega otro HMAC. El teléfono completo se cifra y el API devuelve solo la máscara. Express sí puede descifrar los datos: no es cifrado de extremo a extremo.

El token de recuperación tiene 32 bytes aleatorios, se guarda SHA-256, vence a los 15 minutos y se consume transaccionalmente. El enlace usa fragmento y la aplicación elimina el fragmento al cargar; no se registra el enlace. La prueba usa un transporte aislado que captura el enlace en memoria, no un correo real. Se limitan solicitudes por cuenta y red; la prueba local confirma el límite y que solo uno de dos enlaces distintos simultáneos funciona. **Pendiente:** comprobar diferencias de tiempo que puedan revelar cuentas y entrega real. No declarar recuperación lista para producción hasta resolverlo.

La versión `v1` describe el formato, no habilita varias llaves. La pérdida de la llave sin respaldo hace ilegibles los datos. Pendiente: gestión segura de respaldos, implementación y ensayo de rotación con doble lectura, recifrado y verificación; no se ha rotado ninguna llave.

## Reportes y límites

* **npm audit:** resultados locales reales enlazados arriba; no hay commit todavía. Repetir tras cualquier cambio de dependencias.
* **OWASP ZAP baseline:** Pendiente: dominio propio desplegado y autorizado; ejecución pasiva y archivo saneado.
* **SecurityHeaders:** Pendiente: dominio público propio con cabeceras efectivas, verificar HTML y API.
* **SSL Labs:** Pendiente: dominio público propio y certificado desplegado.

La compilación de React pasó localmente. Pendiente: recorrido de React en navegador contra API real; el navegador automatizable no estaba disponible en este entorno. Pendiente: verificar correo, cookies a través de Vercel, TLS y conexión Render–Supabase, CI real, disponibilidad y controles públicos. La configuración de despliegue en `despliegue.md` es una guía, no evidencia de ejecución.
