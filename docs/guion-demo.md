# Guion de demostración — 10 minutos

Usar exclusivamente usuarios ficticios A, B y una cuenta administradora; suministrar accesos por canal privado. Todos los casos públicos están pendientes hasta desplegar y registrar evidencia real.

1. **Arquitectura (1 min):** navegador → Vercel `/api` → Express en Render → PostgreSQL en Supabase. Explicar TLS, dónde se descifra y por qué no es cifrado de extremo a extremo. Pendiente: verificar infraestructura pública.
2. **Uso normal (2 min):** A inicia sesión, crea, edita y borra una nota, recarga la página y cierra sesión. Pendiente: ejecución en navegador contra el despliegue.
3. **Tres intentos bloqueados (4 min):** B intenta leer, modificar y borrar la nota de A (404 e integridad); A envía escritura sin CSRF válido (403 y fila intacta); contador de login preparado devuelve 429 y luego permite acceso legítimo. La integración local comprueba los primeros dos casos y un 429 preparado; falta la demostración en navegador y la recuperación fuera del límite en producción.
4. **Datos y evidencia (2 min):** mostrar fila saneada cifrada, eventos administrativos y reportes auténticos. Localmente se comprobó que el texto no aparece en la fila y se generó alerta; faltan reportes públicos ZAP, SecurityHeaders y SSL Labs.
5. **Riesgos restantes (1 min):** confianza en proxy, correo real, límites y recuperación, llave de datos y respaldo, pruebas de navegador y despliegue condicionado. Mostrar `informe-seguridad.md` y responsables de cierre.
