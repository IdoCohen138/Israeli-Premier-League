import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
     apiKey: "AIzaSyC7J1ejM1WFHgWGm7WknjPCHUkuV18oMQ8",
     authDomain: "israeli-premier-league.firebaseapp.com",
     projectId: "israeli-premier-league",
     storageBucket: "israeli-premier-league.firebasestorage.app",
     messagingSenderId: "423207457242",
     appId: "1:423207457242:web:74e542b38de32f8ae430e3",
     measurementId: "G-L0SS43M63H"
   };
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider(); 