const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

// Directorios y Archivos
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Crear directorio data si no existe (para fallback local)
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

// ---------------------------------------------------------
// CAPA DE ALMACENAMIENTO MULTI-NUBE (Firebase / MongoDB / JSON Local)
// ---------------------------------------------------------
let admin = null;
let firestoreDb = null;
let mongoClient = null;
let mongoDb = null;
let activeDbMode = 'local'; // 'firebase', 'mongodb', 'local'

// Gestor Atómico de Archivos JSON (Local)
function atomicWriteJson(filePath, data) {
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function loadUsersLocal() {
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
        console.error("Error leyendo users.json local:", e);
        return [];
    }
}

function loadDbLocal() {
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
        console.error("Error leyendo db.json local:", e);
        return defaultStructure;
    }
}

// Inicializar almacenamiento al arrancar
async function initStorage() {
    // 1. Probar Firebase Firestore si existe FIREBASE_SERVICE_ACCOUNT
    const firebaseAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (firebaseAccountRaw) {
        try {
            console.log('[DB] Conectando a Firebase Cloud Firestore...');
            admin = require('firebase-admin');
            const serviceAccount = typeof firebaseAccountRaw === 'string' && firebaseAccountRaw.startsWith('{') 
                ? JSON.parse(firebaseAccountRaw) 
                : require(path.resolve(firebaseAccountRaw));
                
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            firestoreDb = admin.firestore();
            activeDbMode = 'firebase';
            console.log('[DB] ✅ Conexión exitosa a Firebase Cloud Firestore');

            const usersSnap = await firestoreDb.collection('users').get();
            if (usersSnap.empty) {
                console.log('[DB] Firestore "users" vacía. Inicializando usuarios...');
                const initialUsers = loadUsersLocal();
                for (const u of initialUsers) {
                    await firestoreDb.collection('users').doc(u.id).set(u);
                }
            }

            const dataDocRef = firestoreDb.collection('app_data').doc('main_db');
            const dataSnap = await dataDocRef.get();
            if (!dataSnap.exists) {
                console.log('[DB] Firestore "app_data/main_db" no encontrado. Inicializando base de datos...');
                const initialDb = loadDbLocal();
                await dataDocRef.set({ ...initialDb, updatedAt: new Date().toISOString() });
            }
            return;
        } catch (err) {
            console.error('[DB] ❌ Error conectando a Firebase:', err.message);
        }
    }

    // 2. Probar MongoDB Atlas si existe MONGODB_URI
    if (MONGODB_URI) {
        try {
            console.log('[DB] Conectando a MongoDB Atlas...');
            const { MongoClient } = require('mongodb');
            mongoClient = new MongoClient(MONGODB_URI, {
                connectTimeoutMS: 10000,
                serverSelectionTimeoutMS: 10000
            });
            await mongoClient.connect();
            mongoDb = mongoClient.db();
            activeDbMode = 'mongodb';
            console.log('[DB] ✅ Conexión exitosa a MongoDB Atlas');

            const usersColl = mongoDb.collection('users');
            const userCount = await usersColl.countDocuments();
            if (userCount === 0) {
                console.log('[DB] MongoDB "users" vacía. Inicializando usuarios...');
                const initialUsers = loadUsersLocal();
                if (initialUsers.length > 0) {
                    await usersColl.insertMany(initialUsers.map(u => ({ ...u })));
                }
            }

            const dataColl = mongoDb.collection('app_data');
            const dataDoc = await dataColl.findOne({ _id: 'main_db' });
            if (!dataDoc) {
                console.log('[DB] MongoDB "app_data/main_db" no encontrado. Inicializando base de datos...');
                const initialDb = loadDbLocal();
                await dataColl.updateOne(
                    { _id: 'main_db' },
                    { $set: { ...initialDb, updatedAt: new Date().toISOString() } },
                    { upsert: true }
                );
            }
            return;
        } catch (err) {
            console.error('[DB] ❌ Error conectando a MongoDB Atlas:', err.message);
        }
    }

    // 3. Fallback a Archivos JSON Locales
    console.log('[DB] MONGODB_URI ni FIREBASE_SERVICE_ACCOUNT detectados. Utilizando almacenamiento JSON local.');
    activeDbMode = 'local';
}

async function getUsers() {
    if (activeDbMode === 'firebase' && firestoreDb) {
        try {
            const snap = await firestoreDb.collection('users').get();
            const list = [];
            snap.forEach(doc => list.push(doc.data()));
            return list;
        } catch (e) {
            console.error('[DB] Error leyendo usuarios de Firebase:', e);
            return loadUsersLocal();
        }
    }
    if (activeDbMode === 'mongodb' && mongoDb) {
        try {
            const list = await mongoDb.collection('users').find({}).toArray();
            return list.map(({ _id, ...u }) => u);
        } catch (e) {
            console.error('[DB] Error leyendo usuarios de MongoDB:', e);
            return loadUsersLocal();
        }
    }
    return loadUsersLocal();
}

async function saveUsers(usersList) {
    if (activeDbMode === 'firebase' && firestoreDb) {
        try {
            const batch = firestoreDb.batch();
            const snap = await firestoreDb.collection('users').get();
            snap.forEach(doc => batch.delete(doc.ref));
            for (const u of usersList) {
                const ref = firestoreDb.collection('users').doc(u.id || ('usr_' + Date.now()));
                batch.set(ref, u);
            }
            await batch.commit();
            return;
        } catch (e) {
            console.error('[DB] Error guardando usuarios en Firebase:', e);
        }
    }
    if (activeDbMode === 'mongodb' && mongoDb) {
        try {
            const usersColl = mongoDb.collection('users');
            await usersColl.deleteMany({});
            if (usersList.length > 0) {
                await usersColl.insertMany(usersList.map(u => ({ ...u })));
            }
            return;
        } catch (e) {
            console.error('[DB] Error guardando usuarios en MongoDB:', e);
        }
    }
    atomicWriteJson(USERS_FILE, usersList);
}

async function getDbData() {
    const defaultStructure = { e: [], p: [], c: [], m: [], eq: [], notas: [], cashPayments: [], finReports: [] };
    if (activeDbMode === 'firebase' && firestoreDb) {
        try {
            const snap = await firestoreDb.collection('app_data').doc('main_db').get();
            if (snap.exists) {
                const { updatedAt, ...data } = snap.data();
                return { ...defaultStructure, ...data };
            }
        } catch (e) {
            console.error('[DB] Error leyendo dbData de Firebase:', e);
            return loadDbLocal();
        }
    }
    if (activeDbMode === 'mongodb' && mongoDb) {
        try {
            const doc = await mongoDb.collection('app_data').findOne({ _id: 'main_db' });
            if (doc) {
                const { _id, updatedAt, ...data } = doc;
                return { ...defaultStructure, ...data };
            }
        } catch (e) {
            console.error('[DB] Error leyendo dbData de MongoDB:', e);
            return loadDbLocal();
        }
    }
    return loadDbLocal();
}

async function saveDbData(dataObj) {
    if (activeDbMode === 'firebase' && firestoreDb) {
        try {
            await firestoreDb.collection('app_data').doc('main_db').set({
                ...dataObj,
                updatedAt: new Date().toISOString()
            });
            return;
        } catch (e) {
            console.error('[DB] Error guardando dbData en Firebase:', e);
        }
    }
    if (activeDbMode === 'mongodb' && mongoDb) {
        try {
            await mongoDb.collection('app_data').updateOne(
                { _id: 'main_db' },
                { $set: { ...dataObj, updatedAt: new Date().toISOString() } },
                { upsert: true }
            );
            return;
        } catch (e) {
            console.error('[DB] Error guardando dbData en MongoDB:', e);
        }
    }
    atomicWriteJson(DB_FILE, dataObj);
}

// ---------------------------------------------------------
// SISTEMA DE SESIONES EN MEMORIA
// ---------------------------------------------------------
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

            const users = await getUsers();
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
            const users = await getUsers();
            const userIdx = users.findIndex(u => u.id === currentUser.id);
            if (userIdx === -1) {
                return sendJson(res, 404, { error: 'Usuario no encontrado.' });
            }
            const user = users[userIdx];

            if (!user.mustChangePassword) {
                if (!oldPassword || !verifyPassword(oldPassword, user.passwordHash)) {
                    return sendJson(res, 400, { error: 'La contraseña actual es incorrecta.' });
                }
            }

            user.passwordHash = hashPassword(newPassword.trim());
            user.mustChangePassword = false;
            users[userIdx] = user;
            await saveUsers(users);

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
            const dbData = await getDbData();
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
                    const currentUsers = await getUsers();
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

                    await saveUsers(restoredUsers);
                    delete newDb.users;
                } else if (newDb.users) {
                    delete newDb.users;
                }

                await saveDbData(newDb);
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
                const dbData = await getDbData();
                if (!dbData.m) dbData.m = [];

                const nuevosProcesados = nuevos.map(m => ({ ...m, u: m.u || currentUser.name }));

                if (insertIdx !== null && insertIdx !== undefined && insertIdx >= 0 && insertIdx <= dbData.m.length) {
                    dbData.m.splice(insertIdx, 0, ...nuevosProcesados);
                } else {
                    dbData.m.push(...nuevosProcesados);
                }

                await saveDbData(dbData);
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
                const dbData = await getDbData();
                if (!dbData.m || index < 0 || index >= dbData.m.length) {
                    return sendJson(res, 400, { error: 'Movimiento no encontrado.' });
                }

                dbData.m[index] = {
                    ...dbData.m[index],
                    ...updatedMov,
                    u: currentUser.name
                };

                await saveDbData(dbData);
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
            const users = await getUsers();
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
                const users = await getUsers();
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
                    mustChangePassword: true,
                    createdAt: new Date().toISOString()
                };

                users.push(newUser);
                await saveUsers(users);

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
                const users = await getUsers();
                const targetUser = users.find(u => u.id === userId);
                if (!targetUser) {
                    return sendJson(res, 404, { error: 'Usuario no encontrado.' });
                }
                targetUser.passwordHash = hashPassword(newPassword.trim());
                targetUser.mustChangePassword = true;
                await saveUsers(users);

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
            let users = await getUsers();
            users = users.filter(u => u.id !== userId);
            await saveUsers(users);
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

// Iniciar servidor HTTP tras conectar almacenamiento
(async () => {
    await initStorage();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`====================================================`);
        console.log(` Avícola Pro v40.5 - Servidor Multiusuario`);
        console.log(` Modo de Base de Datos Activo: [${activeDbMode.toUpperCase()}]`);
        console.log(` Puerto: ${PORT}`);
        console.log(` Acceso Local: http://localhost:${PORT}`);
        console.log(`====================================================`);
    });
})();
