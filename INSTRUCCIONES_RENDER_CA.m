RESUMEN PARA WORK - CERTIFICADO CA DE SUPABASE EN RENDER

HALLAZGO

El backend utiliza DATABASE_CA_PEM como ruta a un archivo: lee el contenido
con readFileSync y lo entrega al cliente PostgreSQL como autoridad de
certificación. En backend/.env la variable apunta a un archivo de Windows;
esa ruta no existe dentro del servidor Linux de Render. Por tanto, no se debe
pegar el texto del certificado directamente en VALUE de DATABASE_CA_PEM con
el código actual.

El certificado local comprobado es una CA X.509 vigente y no contiene una
llave privada. El backend mantiene rejectUnauthorized: true. La validación
de la cadena y del nombre del servidor debe conservarse.

SOLUCIÓN EN RENDER

1. Abrir el servicio del backend y entrar a Environment > Secret Files > Add file.
2. Escribir supabase-ca.crt en File name.
3. En Contents, pegar el contenido completo del certificado CA descargado de
   Supabase, incluidas las líneas BEGIN CERTIFICATE y END CERTIFICATE y todos
   los saltos de línea originales. No pegar contraseñas ni llaves privadas.
4. En Environment Variables, crear o actualizar:

   KEY:   DATABASE_CA_PEM
   VALUE: /etc/secrets/supabase-ca.crt

   El valor es una ruta de una sola línea, sin comillas. El nombre de archivo
   en la ruta debe coincidir exactamente con el creado en Secret Files.
5. Guardar la configuración. Usar Save only mientras el despliegue no esté
   listo; desplegar el commit correspondiente una vez superado CI.
6. Después del despliegue, consultar /health. HTTP 200 indica que la API pudo
   consultar la base en ese momento. Revisar errores sin imprimir variables,
   credenciales ni contenidos de archivos secretos en los logs.

PARA COPIAR EL CERTIFICADO DESDE WINDOWS

En PowerShell, este comando copia el archivo CA al portapapeles conservando
sus saltos de línea. Luego pegarlo en Contents del archivo de Render:

Get-Content -Raw -LiteralPath 'C:\Users\HP8D1\Downloads\prod-ca-2021.crt' | Set-Clipboard

No pegar el contenido del archivo en la variable DATABASE_CA_PEM y no subir
el archivo .env al repositorio. Tampoco agregar parámetros SSL a DATABASE_URL
que puedan reemplazar la configuración TLS del controlador.

ESTADO DE VERIFICACIÓN

- Localmente: el backend pudo leer la CA y se comprobó que la validación TLS
  permanece activada. Las cuatro pruebas unitarias pasaron; la prueba de
  integración se omitió en esa ejecución porque requería una base desechable.
- Render: la carga del certificado, el despliegue y la conexión aún no se han
  verificado. La URL pública y la configuración efectiva deben comprobarse.
- La guía del proyecto está en docs/despliegue.md.

Documentación oficial:
https://render.com/docs/configure-environment-variables
https://supabase.com/docs/guides/platform/ssl-enforcement
