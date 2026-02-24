import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- Firebase Configuration 設定區 ---
// ⚠️ 請記得將下方的 "請在此填入..." 換成你真實的 Firebase 設定
const firebaseConfig = {
    apiKey: "AIzaSyCrvR0Ir8xttLtwEJz2K3bhXKAFyyDk5RA",
    authDomain: "jetenv-a82bc.firebaseapp.com",
    projectId: "jetenv-a82bc",
    storageBucket: "jetenv-a82bc.firebasestorage.app",
    messagingSenderId: "816919171168",
    appId: "1:816919171168:web:77d028486a01cb40597305",
    measurementId: "G-THZB1LZ7DK"
};

// 初始化 Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'jietai-prod';

export default app;
