// Pastikan apiKey diganti dengan nilai PERSIS dari Firebase Console.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8tcfOZ4hl7mBImcfTtrU2OtKq9aWJC9s",
  authDomain: "mutabaah-upa-test.firebaseapp.com",
  projectId: "mutabaah-upa-test",
  storageBucket: "mutabaah-upa-test.firebasestorage.app",
  messagingSenderId: "154416733757",
  appId: "1:154416733757:web:dc4e727429df8a3d4f1454"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
