// js/api.js

// 1. 파이어베이스 라이브러리 로드 (CDN 방식)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// 2. 파이어베이스 설정 
const firebaseConfig = {
  apiKey: "AIzaSyDfM4zUHipTiWf5GlSij5CsWnh6W8zKFLM",
  authDomain: "kang-biseo.firebaseapp.com",
  projectId: "kang-biseo",
  storageBucket: "kang-biseo.firebasestorage.app",
  messagingSenderId: "367524528112",
  appId: "1:367524528112:web:b93350e80b9ec2c428a735",
  measurementId: "G-Z29RMHZMZV"
};

// 3. 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 4. 서비스별 인스턴스 생성 및 'export' (밖에서 쓸 수 있게 내보내기)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// 로그아웃 후 재로그인 시 항상 계정 선택 화면 표시
googleProvider.setCustomParameters({ prompt: 'select_account' });