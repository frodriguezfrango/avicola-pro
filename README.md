# Avícola Pro v40.5 - Sistema Multiusuario de Pagos y Gestión Financiera

Aplicación web profesional para la gestión integral de proveedores, clientes, cuentas corrientes, control de E-CHEQ, pagos por cash y balances financieros con **Control de Acceso Basado en Roles (RBAC)**, **Edición de Movimientos** y **Persistencia Multinube (Firebase / MongoDB Atlas)**.

---

## 🚀 Novedades de esta Versión

1. **Persistencia en la Nube con Firebase o MongoDB Atlas (NUEVO)**:
   - Soporta **Firebase Cloud Firestore** (usando tu cuenta existente de Firebase).
   - Soporta **MongoDB Atlas** (Cluster Gratuito M0).
   - **Solución al reinicio en Render.com**: Evita que los datos se borren al entrar en reposo o reiniciar.
   - **Modo Híbrido e Offline**: Si no se configuran variables de nube, el servidor funciona 100% offline con archivos JSON locales (`data/users.json` y `data/db.json`).
   - **Migración Automática**: Al conectar la nube por primera vez, el servidor sube tus datos locales automáticamente a la nube.
2. **Multiusuario con Autenticación y Roles**:
   - **👑 Administrador General**: Control total de usuarios, movimientos, cascada y purga.
   - **🛠️ Operador**: Carga/edición de movimientos, e-cheqs, notas y reportes PDF.
   - **👁️ Lectura**: Solo consulta de tableros, balances e informes PDF.
3. **Edición Completa de Movimientos**:
   - Edición de fecha, concepto, debe y haber directamente en la tabla del Mayor con recalculación automática.

---

## 🔒 ¿Es seguro el almacenamiento de datos?

- **Cifrado de Contraseñas**: Las contraseñas reales de tus usuarios **NUNCA se guardan en texto plano**. Se encriptan en el servidor usando un hash matemático nativo `PBKDF2` con algoritmo `SHA-512` y sal (`SALT`).
- **Seguridad en la Nube**: Tanto Firebase (Google Cloud) como MongoDB Atlas utilizan conexiones cifradas mediante SSL/TLS (`https`). Nadie puede interceptar tus datos en tránsito.

---

## ☁️ Opciones para conectar a la Nube en Render.com

Puedes usar **Firebase** (si ya tienes cuenta) o **MongoDB Atlas**. Ambas tienen plan gratuito ilimitado.

### 🟡 Opción 1: Usar Firebase Cloud Firestore (Recomendado si ya tienes cuenta)

1. En la consola de Firebase ([console.firebase.google.com](https://console.firebase.google.com)), abre tu proyecto.
2. Ve a **Configuración del proyecto** ⚙️ -> **Cuentas de servicio** (Service Accounts).
3. Haz clic en **Generar nueva clave privada**. Se descargará un archivo `.json`.
4. Abre ese archivo `.json` con el Bloc de notas y copia todo su contenido.
5. En tu panel de **Render.com** -> **Environment**:
   - **Key**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: *(Pega todo el contenido del JSON que copiaste)*
6. Guarda cambios. ¡Listo!

---

### 🟢 Opción 2: Usar MongoDB Atlas (Gratis 512 MB)

1. Crea una cuenta en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) y crea un cluster **M0 Free**.
2. En **Database Access**, crea un usuario/contraseña.
3. En **Network Access**, agrega la IP `0.0.0.0/0`.
4. En **Connect -> Drivers**, copia la cadena de conexión:
   `mongodb+srv://usuario:<PASSWORD>@cluster0.xxxxx.mongodb.net/avicola_db?retryWrites=true&w=majority`
5. En tu panel de **Render.com** -> **Environment**:
   - **Key**: `MONGODB_URI`
   - **Value**: *(Pega tu enlace de MongoDB Atlas)*
6. Guarda cambios. ¡Listo!

---

## 📁 Estructura del Proyecto

```
avicola-pro/
├── server.js              # Servidor HTTP con API REST y Capa Multinube (Firebase / MongoDB / JSON)
├── package.json           # Configuración de dependencias (firebase-admin, mongodb, express)
├── README.md              # Documentación y manual de uso
├── data/                  # Almacenamiento local fallback (JSON)
│   ├── db.json
│   └── users.json
└── public/
    └── index.html         # Interfaz web SPA (Frontend)
```
