const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Directorios y Archivos
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Crear directorio data si no existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Hashing Nativo de Contraseñas
const SALT = 'avicola_pro_salt_v40_5_2026';
function hashPassword(password) {
    return crypto.pbkdf2Sync(password, SALT, 10000, 64, 'sha512').toString('hex');
}
function verifyPassword(password, hash) {
    return hashPassword(password) === hash;
}

// Gestor Atómico de Archivos JSON
function atomicWriteJson(filePath, data) {
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultUsers = [
            {
                id: 'usr_admin_default',
                username: 'admin',
                passwordHash: hashPassword('admin123'),
                role: 'admin', // 'admin', 'operator', 'read'
                name: 'Administrador General',
                createdAt: new Date().toISOString()
            }
        ];
        atomicWriteJson(USERS_FILE, defaultUsers);
        return defaultUsers;
    }
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("Error leyendo users.json:", e);
        return [];
    }
}

function loadDb() {
    const defaultStructure = { e: [], p: [], c: [], m: [], eq: [], notas: [], cashPayments: [], finReports: [] };
    if (!fs.existsSync(DB_FILE)) {
        atomicWriteJson(DB_FILE, defaultStructure);
        return defaultStructure;
    }
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...defaultStructure, ...parsed };
    } catch (e) {
        console.error("Error leyendo db.json:", e);
        return defaultStructure;
    }
}

// Carga Inicial de Datos
let users = loadUsers();
let dbData = loadDb();

// Sistema de Sesiones en Memoria
const sessions = new Map();

function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    return list;
}

function getSessionUser(req) {
    const cookies = parseCookies(req);
    const sid = cookies.sid;
    if (sid && sessions.has(sid)) {
        return sessions.get(sid);
    }
    return null;
}

function createSession(user, res) {
    const sid = crypto.randomBytes(32).toString('hex');
    const sessionData = {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        mustChangePassword: !!user.mustChangePassword
    };
    sessions.set(sid, sessionData);
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
    return sessionData;
}

function destroySession(req, res) {
    const cookies = parseCookies(req);
    if (cookies.sid) {
        sessions.delete(cookies.sid);
    }
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

// Helper para parsear JSON Body
function getJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('JSON no válido'));
            }
        });
        req.on('error', reject);
    });
}

// Helper de Respuestas JSON
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

// MIME Types para archivos estáticos
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

// Servidor HTTP Principal
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Manejo CORS Pre-flight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        });
        return res.end();
    }

    // ---------------------------------------------------------
    // RUTAS DE API REST
    // ---------------------------------------------------------
    
    // 1. Autenticación: POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
        try {
            const { username, password } = await getJsonBody(req);
            if (!username || !password) {
                return sendJson(res, 400, { error: 'Ingrese usuario y contraseña.' });
            }

            users = loadUsers();
            const cleanUser = username.trim().toLowerCase();
            const user = users.find(u => u.username.toLowerCase() === cleanUser);

            if (!user || !verifyPassword(password, user.passwordHash)) {
                return sendJson(res, 401, { error: 'Usuario o contraseña incorrectos.' });
            }

            const sessionUser = createSession(user, res);
            return sendJson(res, 200, { success: true, user: sessionUser });
        } catch (e) {
            return sendJson(res, 400, { error: 'Petición no válida.' });
        }
    }

    // 2. Autenticación: POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
        destroySession(req, res);
        return sendJson(res, 200, { success: true });
    }

    // 3. Autenticación: GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
        const user = getSessionUser(req);
        if (user) {
            return sendJson(res, 200, { loggedIn: true, user });
        }
        return sendJson(res, 200, { loggedIn: false });
    }

    // 4. Autenticación: POST /api/auth/change-password
    if (pathname === '/api/auth/change-password' && method === 'POST') {
        const currentUser = getSessionUser(req);
        if (!currentUser) {
            return sendJson(res, 401, { error: 'No autorizado. Inicie sesión.' });
        }
        try {
            const { oldPassword, newPassword } = await getJsonBody(req);
            if (!newPassword || newPassword.trim().length < 4) {
                return sendJson(res, 400, { error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
            }
            users = loadUsers();
            const userIdx = users.findIndex(u => u.id === currentUser.id);
            if (userIdx === -1) {
                return sendJson(res, 404, { error: 'Usuario no encontrado.' });
            }
            const user = users[userIdx];

            // Si NO es cambio obligatorio inicial, requerir contraseña anterior
            if (!user.mustChangePassword) {
                if (!oldPassword || !verifyPassword(oldPassword, user.passwordHash)) {
                    return sendJson(res, 400, { error: 'La contraseña actual es incorrecta.' });
                }
            }

            user.passwordHash = hashPassword(newPassword.trim());
            user.mustChangePassword = false;
            users[userIdx] = user;
            atomicWriteJson(USERS_FILE, users);

            currentUser.mustChangePassword = false;
            return sendJson(res, 200, { success: true });
        } catch (e) {
            return sendJson(res, 400, { error: 'Error al cambiar contraseña.' });
        }
    }

    // Proteger todas las siguientes rutas /api con autenticación
    if (pathname.startsWith('/api/')) {
        const currentUser = getSessionUser(req);
        if (!currentUser) {
            return sendJson(res, 401, { error: 'No autorizado. Inicie sesión.' });
        }

        // GET /api/db (Todos los roles autenticados)
        if (pathname === '/api/db' && method === 'GET') {
            dbData = loadDb();
            return sendJson(res, 200, dbData);
        }

        // POST /api/db (Admin y Operadores)
        if (pathname === '/api/db' && method === 'POST') {
            if (currentUser.role === 'read') {
                return sendJson(res, 403, { error: 'El perfil de Lectura no puede modificar la base de datos.' });
            }
            try {
                const newDb = await getJsonBody(req);
                if (!newDb || typeof newDb !== 'object') {
                    return sendJson(res, 400, { error: 'Datos no válidos.' });
                }

                // Restauración de Usuarios opcional si vienen en el respaldo (Solo Admin)
                if (newDb.users && Array.isArray(newDb.users) && currentUser.role === 'admin') {
                    const currentUsers = loadUsers();
                    const restoredUsers = newDb.users.map(u => {
                        const existing = currentUsers.find(cu => cu.username.toLowerCase() === u.username.toLowerCase());
                        return {
                            id: u.id || ('usr_' + Date.now() + Math.random().toString(36).substring(2, 5)),
                            username: u.username.toLowerCase(),
                            passwordHash: u.passwordHash || (existing ? existing.passwordHash : hashPassword('123456')),
                            role: u.role || 'operator',
                            name: u.name || u.username,
                            createdAt: u.createdAt || new Date().toISOString()
                        };
                    });

                    // Garantizar presencia de usuario admin
                    if (!restoredUsers.some(u => u.username === 'admin')) {
                        const adminUser = currentUsers.find(u => u.username === 'admin') || {
                            id: 'usr_admin_default',
                            username: 'admin',
                            passwordHash: hashPassword('admin123'),
                            role: 'admin',
                            name: 'Administrador General',
                            createdAt: new Date().toISOString()
                        };
                        restoredUsers.unshift(adminUser);
                    }

                    users = restoredUsers;
                    atomicWriteJson(USERS_FILE, users);
                    delete newDb.users;
                } else if (newDb.users) {
                    delete newDb.users;
                }

                dbData = newDb;
                atomicWriteJson(DB_FILE, dbData);
                return sendJson(res, 200, { success: true });
            } catch (e) {
                return sendJson(res, 400, { error: 'Error procesando datos.' });
            }
        }

        // POST /api/add-mov (Admin y Operadores)
        if (pathname === '/api/add-mov' && method === 'POST') {
            if (currentUser.role === 'read') {
                return sendJson(res, 403, { error: 'Acceso denegado.' });
            }
            try {
                const { nuevos, insertIdx } = await getJsonBody(req);
                if (!nuevos || !Array.isArray(nuevos)) {
                    return sendJson(res, 400, { error: 'Movimientos no válidos.' });
                }
                dbData = loadDb();
                if (!dbData.m) dbData.m = [];

                const nuevosProcesados = nuevos.map(m => ({ ...m, u: m.u || currentUser.name }));

                if (insertIdx !== null && insertIdx !== undefined && insertIdx >= 0 && insertIdx <= dbData.m.length) {
                    dbData.m.splice(insertIdx, 0, ...nuevosProcesados);
                } else {
                    dbData.m.push(...nuevosProcesados);
                }

                atomicWriteJson(DB_FILE, dbData);
                return sendJson(res, 200, { success: true });
            } catch (e) {
                return sendJson(res, 400, { error: 'Error procesando datos.' });
            }
        }

        // PUT /api/update-mov (EDICIÓN DE MOVIMIENTO EXISTENTE - Admin y Operadores)
        if (pathname === '/api/update-mov' && method === 'PUT') {
            if (currentUser.role === 'read') {
                return sendJson(res, 403, { error: 'Acceso denegado.' });
            }
            try {
                const { index, updatedMov } = await getJsonBody(req);
                dbData = loadDb();
                if (!dbData.m || index < 0 || index >= dbData.m.length) {
                    return sendJson(res, 400, { error: 'Movimiento no encontrado.' });
                }

                dbData.m[index] = {
                    ...dbData.m[index],
                    ...updatedMov,
                    u: currentUser.name // Estampar nombre del usuario que editó
                };

                atomicWriteJson(DB_FILE, dbData);
                return sendJson(res, 200, { success: true, updatedMov: dbData.m[index] });
            } catch (e) {
                return sendJson(res, 400, { error: 'Error al actualizar movimiento.' });
            }
        }

        // GESTIÓN DE USUARIOS (Solo Administrador)
        if (pathname === '/api/users' && method === 'GET') {
            if (currentUser.role !== 'admin') {
                return sendJson(res, 403, { error: 'Acceso exclusivo para Administradores.' });
            }
            users = loadUsers();
            const safeUsers = users.map(({ passwordHash, ...u }) => u);
            return sendJson(res, 200, safeUsers);
        }

        if (pathname === '/api/users' && method === 'POST') {
            if (currentUser.role !== 'admin') {
                return sendJson(res, 403, { error: 'Acceso exclusivo para Administradores.' });
            }
            try {
                const { username, password, role, name } = await getJsonBody(req);
                if (!username || !password || !role || !name) {
                    return sendJson(res, 400, { error: 'Todos los campos son requeridos.' });
                }
                users = loadUsers();
                const cleanUser = username.trim().toLowerCase();
                if (users.some(u => u.username.toLowerCase() === cleanUser)) {
                    return sendJson(res, 400, { error: `El usuario "${username}" ya existe.` });
                }

                const newUser = {
                    id: 'usr_' + Date.now(),
                    username: cleanUser,
                    passwordHash: hashPassword(password),
                    role: ['admin', 'operator', 'read'].includes(role) ? role : 'operator',
                    name: name.trim(),
                    mustChangePassword: true, // Forzar cambio de clave en primer ingreso
                    createdAt: new Date().toISOString()
                };

                users.push(newUser);
                atomicWriteJson(USERS_FILE, users);

                const { passwordHash, ...safeUser } = newUser;
                return sendJson(res, 200, { success: true, user: safeUser });
            } catch (e) {
                return sendJson(res, 400, { error: 'Error creando usuario.' });
            }
        }

        if (pathname === '/api/users/reset-password' && method === 'POST') {
            if (currentUser.role !== 'admin') {
                return sendJson(res, 403, { error: 'Acceso exclusivo para Administradores.' });
            }
            try {
                const { userId, newPassword } = await getJsonBody(req);
                if (!userId || !newPassword || newPassword.trim().length < 4) {
                    return sendJson(res, 400, { error: 'Ingrese una contraseña válida (mín. 4 caracteres).' });
                }
                users = loadUsers();
                const targetUser = users.find(u => u.id === userId);
                if (!targetUser) {
                    return sendJson(res, 404, { error: 'Usuario no encontrado.' });
                }
                targetUser.passwordHash = hashPassword(newPassword.trim());
                targetUser.mustChangePassword = true; // Exigir cambio en primer ingreso tras reseteo
                atomicWriteJson(USERS_FILE, users);

                return sendJson(res, 200, { success: true, username: targetUser.username });
            } catch (e) {
                return sendJson(res, 400, { error: 'Error al resetear contraseña.' });
            }
        }

        if (pathname.startsWith('/api/users/') && method === 'DELETE') {
            if (currentUser.role !== 'admin') {
                return sendJson(res, 403, { error: 'Acceso exclusivo para Administradores.' });
            }
            const userId = pathname.replace('/api/users/', '');
            if (currentUser.id === userId) {
                return sendJson(res, 400, { error: 'No puede eliminar su propio usuario activo.' });
            }
            users = loadUsers();
            users = users.filter(u => u.id !== userId);
            atomicWriteJson(USERS_FILE, users);
            return sendJson(res, 200, { success: true });
        }

        return sendJson(res, 404, { error: 'Ruta API no encontrada' });
    }

    // ---------------------------------------------------------
    // SERVIDOR DE ARCHIVOS ESTÁTICOS (Frontend)
    // ---------------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Evitar ataques de Directory Traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Acceso denegado');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            filePath = path.join(PUBLIC_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                res.writeHead(500);
                res.end('Error interno del servidor');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });
});

// Iniciar servidor HTTP
server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` Avícola Pro v40.5 - Servidor Multiusuario Nativo`);
    console.log(` Estado: Activo y listo para usar en local o nube`);
    console.log(` Puerto: ${PORT}`);
    console.log(` Acceso Local: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
