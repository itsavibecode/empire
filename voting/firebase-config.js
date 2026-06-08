/* Shared Firebase Web SDK init for the Empire X voting subsystem.
   Used by:
     - /voting/                  (voter page + admin panel)
     - /voting/overlay/          (poll widget OBS source)
     - /voting/overlay/voters/   (live-voters ticker OBS source)
     - /voting/auth/callback/    (Kick OAuth landing page)

   The apiKey here is a Firebase Web client identifier, NOT a secret.
   Security is enforced by Firestore rules in /voting/firestore.rules
   (e.g. votes can be CREATED by signed-in users but never UPDATED or
   DELETED, polls can only be opened/closed by the empire-worker via
   service-account JWT, etc.). Public-safe to commit.

   Project: empire-voting (us-central1, created 2026-06-08)
   Console: https://console.firebase.google.com/project/empire-voting
*/
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAtLK0X8WtV88Aenq8UN3Za_4JbPzRY9vE',
  authDomain: 'empire-voting.firebaseapp.com',
  projectId: 'empire-voting',
  storageBucket: 'empire-voting.firebasestorage.app',
  messagingSenderId: '963377985849',
  appId: '1:963377985849:web:aef9416141d7b1455f50e8',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
