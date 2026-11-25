# PólizaWeb 🚚📄

Aplicación web para **subir y consultar las pólizas de la flotilla** desde cualquier
lugar y en cualquier momento. Los PDF se guardan en la nube (MongoDB Atlas / GridFS)
y la app lee automáticamente el **N.º de serie, placa, CIS, empleado y vigencias**
de las carátulas de Inbursa.

## Reglas clave

| Situación | Comportamiento |
|---|---|
| Serie **nueva** | Se crea la unidad |
| Serie **ya existe** | 🔄 **Renovación**: el registro y el PDF anterior se reemplazan (último subido gana) |
| Misma serie 2 veces en un mismo PDF | Gana la última en orden de páginas (ambas se marcan en el preview) |
| Fila **sin serie legible** | ❌ Se rechaza, con aviso, y el resto del lote sí se guarda |

## Estructura

```
polizaweb/
├── app/
│   ├── page.jsx              # tablero: buscador de unidades
│   ├── login/page.jsx
│   ├── subir/page.jsx        # drag & drop → preview → confirmar
│   ├── facturas/page.jsx     # última factura de cada proveedor de gas
│   ├── tarjetas/page.jsx     # tarjetas de circulación: subir, ver y compartir
│   ├── unidades/[id]/page.jsx# detalle + PDF embebido
│   ├── admin/page.jsx        # usuarios + todas las unidades + exportar CSV
│   └── api/
│       ├── auth/{login,logout,me}
│       ├── unidades(/, /[id], /[id]/pdf)
│       ├── policies/{preview,confirm}
│       ├── facturas(/, /preview, /[proveedor]/pdf)
│       ├── tarjetas(/, /preview, /[id], /[id]/pdf)
│       ├── usuarios(/, /[id])
│       └── export            # CSV (admin)
├── lib/
│   ├── parser.js             # extracción de carátulas (portado del script Python)
│   ├── pdf.js                # unpdf + parser
│   ├── policies.js           # preparar filas y marcar estados de renovación
│   ├── tarjetas.js           # lectura de tarjetas de circulación (OCR)
│   ├── db.js                 # Mongo/GridFS helpers
│   ├── jwt.js / session.js   # sesiones (cookie firmada, bcrypt)
│   └── util.js
├── middleware.js             # protege rutas (excepto /login y /api/auth)
└── scripts/seed.mjs          # migración inicial + primer admin
```

## De dónde salen los datos iniciales

El proyecto anterior separó `placas/CARATULA_16211 20016322.pdf` (303 páginas,
**101 pólizas**) en `placas/por_serie/{SERIE}_{PLACA}.pdf` y generó
`placas/inventario.csv`. El seed sube esos 101 PDF y sus datos.

## Puesta en marcha local

1. **MongoDB Atlas (gratis)**
   - Crea cuenta en [mongodb.com/atlas](https://www.mongodb.com/atlas) → Cluster M0 (region más cercana)
   - *Database Access*: crea usuario + contraseña
   - *Network Access*: añade `0.0.0.0/0` (acceso desde cualquier IP) o la IP de tu modem
   - Copia el **connection string** de *Connect → Drivers*

2. **Configura** `polizaweb/.env.local`:
   ```
   MONGODB_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=polizaweb
   AUTH_SECRET=<una-cadena-larga-al-azar>
   ```

3. **Migra tus 101 pólizas + crea tu usuario admin**:
   ```
   npm run seed -- --admin --email=tucorreo@x.com --pass=TU_CONTRASEÑA
   ```

4. **Corre local**:
   ```
   npm run dev      # http://localhost:3000
   ```
   (otro usuario de prueba lo agregas luego desde /admin, o con el seed)

## Tarjetas de circulación 🪪

Cada unidad puede tener su **tarjeta de circulación** en PDF. La app la lee (placa, N.º de serie,
folio, propietario, marca, año, REPUVE, fecha de expedición y vigencia) y la puede **compartir por
WhatsApp** con el mismo flujo que las pólizas:

| Situación | Comportamiento |
|---|---|
| Serie (VIN) o placa nueva | Se crea la tarjeta |
| Ya existe esa serie/placa | 🔄 Se reemplaza el registro y el PDF anterior (último gana) |
| PDF ilegible o sin datos | Se marca en la tabla del preview para corregir antes de guardar |

- Pantalla: **Tarjetas** (barra superior). Se pueden soltar **varios PDF a la vez** y corregir
  placas, serie, folio, propietario, fecha o vigencia antes de guardar.
- Compartir: en móvil adjunta el PDF directo con la hoja nativa; en PC descarga el PDF y abre
  WhatsApp Web con el mensaje listo (placas · serie · vigencia).
- Si la póliza de una unidad ya está cargada, el detalle muestra el bloque
  **🪪 Tarjeta de circulación** para verla o enviarla sin buscar en otra pantalla.

### Carga masiva de una carpeta

```bash
npm run seed:tarjetas -- --dir="C:\ruta\a\las\tarjetas"
```

Lee todos los `.pdf` de la carpeta, extrae los datos y los guarda en MongoDB/GridFS
(bucket `tarjetas_pdf`). Regla: por serie o placa, la última sustituye a la anterior.
Para probar el lector sin escribir en la base:

```bash
npm run test:tarjetas -- --dir="C:\ruta\a\las\tarjetas"
```

## Despliegue en línea (gratis)

1. Sube el proyecto a un repo de GitHub (sin `.env.local`, ya está en `.gitignore`).
2. En [vercel.com](https://vercel.com): *Add New Project* → importa el repo.
3. En *Environment Variables* agrega `MONGODB_URI`, `MONGODB_DB` y `AUTH_SECRET`.
4. Deploy → tendrás `tu-proyecto.vercel.app` con HTTPS.
   - *Network Access* de Atlas debe permitir `0.0.0.0/0` (Vercel usa IPs dinámicas).

## API rápida

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/unidades?q=` | busca (placa/serie/CIS/póliza/descripción); admin: todas, usuario: propias |
| GET | `/api/unidades/[id]/pdf` | PDF embebido (`?download=1` para descargar) |
| POST | `/api/policies/preview` | multipart `files`: analiza sin guardar |
| POST | `/api/policies/confirm` | multipart `files`: guarda con regla de renovación |
| GET | `/api/tarjetas?q=&serie=` | lista/busca tarjetas de circulación |
| POST | `/api/tarjetas/preview` | multipart `files`: lee placas/serie/folio… sin guardar |
| POST | `/api/tarjetas` | multipart `file` + datos: guarda y reemplaza por serie/placa |
| GET | `/api/tarjetas/[id]/pdf` | PDF de la tarjeta (`?download=1` para descargar) |
| DELETE | `/api/tarjetas/[id]` | borra registro y PDF (admin o quien la subió) |
| GET/POST | `/api/usuarios` | alta/listado (admin) |
| GET | `/api/export` | CSV con todas las unidades (admin) |

## Notas técnicas

- Parser validado contra el PDF real: **101 pólizas/303 páginas**, incluye
  series cortas antiguas (`TM189189`, 8 car.), placas `S/N` y la serie truncada
  de Inbursa (`1GB3W9E75NF33667`) tal cual aparecen en el documento.
- Duplicado del PDF original (NV5124A en 2 CIS): el seed mantiene la última
  (empleado 101) por la regla "último gana"; la otra la emitiría una nueva subida
  si Inbursa la re-ampara con otra vigencia.
- Sesiones: JWT HS256 en cookie `HttpOnly` (7 días), contraseñas con bcrypt.
