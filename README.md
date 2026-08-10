# Avícola Pro v40.5 - Sistema Multiusuario de Pagos y Gestión Financiera

Aplicación web profesional para la gestión integral de proveedores, clientes, cuentas corrientes, control de E-CHEQ, pagos por cash y balances financieros con **Control de Acceso Basado en Roles (RBAC)** y **Edición de Movimientos**.

---

## 🚀 Novedades de esta Versión

1. **Multiusuario con Autenticación y Roles**:
   - **👑 Administrador General**: Control total. Crea y administra usuarios, gestiona empresas/proveedores/clientes con renombrado en cascada, purga de historial y todas las operaciones.
   - **🛠️ Operador**: Carga y edición de movimientos, registro de pagos por cash, e-cheqs, notas y generación de reportes PDF.
   - **👁️ Lectura**: Solo consulta de tableros, balances e informes PDF. No puede agregar, modificar ni borrar datos.
2. **Edición Completa de Movimientos (NUEVO)**:
   - En la vista del Mayor (`ledgerView`), ahora cada renglón cuenta con un botón de edición (ícono de lápiz ✏️).
   - Permite modificar la fecha, el concepto, el monto de pago (Debe) y la factura (Haber).
   - Al guardar, el sistema recalcula los saldos de la cuenta corriente y la antigüedad de la deuda automáticamente.
3. **Servidor Autónomo Cero-Dependencias**:
   - Desarrollado con módulos nativos de Node.js (`http`, `fs`, `path`, `crypto`).
   - **No requiere ejecutar `npm install`**. Funciona inmediatamente con cualquier versión de Node.js en Windows, Linux o la Nube.

---

## 🔑 Credenciales de Acceso Iniciales

Al iniciar el servidor por primera vez, el sistema creará automáticamente el usuario Administrador principal:

- **Usuario**: `admin`
- **Contraseña**: `admin123`

*(Se recomienda cambiar la contraseña o agregar nuevos usuarios desde la pestaña **Configuración y Usuarios** iniciando sesión como Administrador).*

---

## 💻 Instrucciones de Uso Local

1. Abrir una terminal o consola de comandos en esta carpeta (`C:\Users\Agustin\.gemini\antigravity\scratch\avicola-pro`).
2. Ejecutar el servidor con Node.js:
   ```bash
   node server.js
   ```
3. Abrir el navegador e ingresar a:
   - En la misma PC: `http://localhost:3000`
   - Desde otras PCs de la misma red de oficina: `http://<IP-DE-TU-PC>:3000` (Ejemplo: `http://192.168.1.50:3000`).

---

## ☁️ Despliegue en la Nube (Disponibilidad 24/7 sin depender de tu PC)

Para que los operadores y la administración puedan usar la app en cualquier momento del año (incluso si tu PC de trabajo está apagada), la aplicación está lista para desplegarse gratis en la nube en pocos minutos:

### Opción Recomendada: Render.com (Gratis)
1. Subir esta carpeta a un repositorio privado en **GitHub**.
2. Crear una cuenta gratuita en [Render.com](https://render.com).
3. Seleccionar **New Web Service** y conectar el repositorio de GitHub.
4. En **Build Command**, dejarlo en blanco o poner `echo ok`.
5. En **Start Command**, colocar: `node server.js`.
6. Hacer clic en **Create Web Service**.

¡Listo! Obtendrás un enlace seguro `https://tu-app.onrender.com` al que podrás ingresar con usuario y contraseña 24/7 desde cualquier computadora o celular.

---

## 📁 Estructura del Proyecto

```
avicola-pro/
├── server.js              # Servidor HTTP autónomo con API REST y autenticación
├── package.json           # Configuración del paquete Node.js
├── README.md              # Documentación y manual de uso
├── data/
│   ├── db.json            # Base de datos JSON con escritura atómica concurrente
│   └── users.json         # Usuarios y contraseñas (encriptación PBKDF2/SHA512)
└── public/
    └── index.html         # Interfaz web de alta fidelidad (Frontend SPA)
```
