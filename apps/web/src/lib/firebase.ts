import { initializeApp } from 'firebase/app'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

// Configuración reutilizada de inventory-system
// Configuración reutilizada de inventory-system (Funcionando)
const firebaseConfig = {
    apiKey: "AIzaSyC0d3Zph-2UhZS0FdaDR0HOIOrFXVN_c20",
    authDomain: "inventory-system-fed7f.firebaseapp.com",
    projectId: "inventory-system-fed7f",
    storageBucket: "inventory-system-fed7f.firebasestorage.app",
    messagingSenderId: "97541456020",
    appId: "1:97541456020:web:c68a40674a126a61257481",
    measurementId: "G-99VLXTLCB3"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Storage
export const storage = getStorage(app)

// Initialize Auth (Optional for now)
export const auth = getAuth(app)

export default app
