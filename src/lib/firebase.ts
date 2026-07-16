import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCL40y_iexNwjq8BOcYyOhdCbfAN-SZ7xo",
  authDomain: "electronicsstore-bf494.firebaseapp.com",
  projectId: "electronicsstore-bf494",
  storageBucket: "electronicsstore-bf494.firebasestorage.app",
  messagingSenderId: "995732566002",
  appId: "1:995732566002:web:bb060c536a83b6e09a456b",
  measurementId: "G-TRZN9SFJXV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
