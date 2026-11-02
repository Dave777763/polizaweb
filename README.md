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
│   ├── unidades/[id]/page.jsx# detalle + PDF embebido
│   ├── admin/page.jsx        # usuarios + todas las unidades + exportar CSV
│   └── api/
│       ├── auth/{login,logout,me}
│       ├── unidades(/, /[id], /[id]/pdf)
│       ├── policies/{preview,confirm}
│       ├── usuarios(/, /[id])
│       └── export            # CSV (admin)
├── lib/
│   ├── parser.js             # extracción de carátulas (portado del script Python)
│   ├── pdf.js                # unpdf + parser
│   ├── policies.js           # preparar filas y marcar estados de renovación
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
