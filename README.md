# ✂️ Barbería Promo — Sistema de seguimiento de clientes

Rastreá cuándo le vence la promo a cada cliente (15 días desde el último corte).

---

## Stack
- React + Vite
- Firebase Firestore (base de datos)
- Vercel (deploy)

---

## Paso a paso para arrancar

### 1. Crear el proyecto en Firebase
1. Entrá a [console.firebase.google.com](https://console.firebase.google.com)
2. Creá un proyecto nuevo → llamalo `barberia-promo`
3. Andá a **Firestore Database** → Crear base de datos → modo producción
4. Andá a **Configuración del proyecto** (⚙️) → **Tus apps** → Agregar app web
5. Copiá las credenciales que te da Firebase

### 2. Configurar variables de entorno
1. Copiá el archivo `.env.example` y renombralo a `.env`
2. Pegá tus credenciales de Firebase:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Reglas de Firestore
En Firebase → Firestore → Reglas, pegá esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clientes/{id} {
      allow read, write: if true;
    }
  }
}
```

### 4. Correr localmente
```bash
npm install
npm run dev
```

### 5. Subir a GitHub
```bash
git init
git add .
git commit -m "inicial: barberia-promo"
git remote add origin https://github.com/TU_USUARIO/barberia-promo.git
git push -u origin main
```

### 6. Deploy en Vercel
1. Entrá a [vercel.com](https://vercel.com) → New Project → importá el repo
2. En **Environment Variables** agregá las mismas variables del `.env`
3. Deploy 🚀

---

## Lógica de la promo
- Corte normal: **$15.000**
- Si vuelve dentro de los **15 días**: **$12.000**
- El sistema muestra cuántos días le quedan a cada cliente y te avisa quién necesita contacto urgente
