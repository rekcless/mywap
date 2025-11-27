// app.js (v2)
// Firebase core + helper functions (modular CDN imports)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, startAfter, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, where, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1hFfXW4Equz-kGkFJ4pM1joyy7DYPet0",
  authDomain: "mywapblog-7de53.firebaseapp.com",
  projectId: "mywapblog-7de53",
  storageBucket: "mywapblog-7de53.firebasestorage.app",
  messagingSenderId: "1795132528",
  appId: "1:1795132528:web:920742ad86518d3ff438b5",
  measurementId: "G-K5ZFJDEWNS"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// --------- Auth helpers ----------
export async function signIn(email, password){ return signInWithEmailAndPassword(auth, email, password); }
export async function signOutNow(){ return signOut(auth); }
export async function registerUser(email,password){ return createUserWithEmailAndPassword(auth, email, password); }
export function onAuth(cb){ return onAuthStateChanged(auth, cb); }

// --------- Pagination & posts helpers ----------
/**
 * getPostsPage({limit: 10, startAfterDoc: null, category: ''})
 * returns {docs, lastDoc}
 */
export async function getPostsPage({pageSize=6, startAfterDoc=null, category='' } = {}){
  let q;
  if(category){
    // note: make sure you index category + createdAt in Firestore if needed
    q = query(collection(db,'posts'), where('published','==', true), where('category','==', category), orderBy('createdAt','desc'), limit(pageSize));
  } else {
    q = query(collection(db,'posts'), where('published','==', true), orderBy('createdAt','desc'), limit(pageSize));
  }
  if(startAfterDoc) q = query(collection(db,'posts'), orderBy('createdAt','desc'), startAfter(startAfterDoc), limit(pageSize));

  // simpler approach: if startAfterDoc provided, use getDocs on a query with startAfter
  // but modular SDK doesn't allow combining easily; we'll build two code paths:
  if(!startAfterDoc){
    const snap = await getDocs(q);
    const docs = snap.docs;
    const last = docs.length ? docs[docs.length-1] : null;
    return { docs, lastDoc: last };
  }else{
    // fetch ordered query with startAfter
    const q2 = query(collection(db,'posts'), where('published','==', true), orderBy('createdAt','desc'), startAfter(startAfterDoc), limit(pageSize));
    const snap = await getDocs(q2);
    const docs = snap.docs;
    const last = docs.length ? docs[docs.length-1] : null;
    return { docs, lastDoc: last };
  }
}

export async function getPostById(id){
  const ref = doc(db,'posts',id);
  const s = await getDoc(ref);
  return s.exists() ? { id: s.id, data: s.data() } : null;
}

export async function createPost({title, body, category, fileUrl='', thumbnailUrl='', published=true}){
  const docRef = await addDoc(collection(db,'posts'), {
    title, body, category, downloadUrl: fileUrl||'', thumbnailUrl: thumbnailUrl||'', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), views: 0, published
  });
  return docRef.id;
}

export async function updatePost(id, payload){
  const refDoc = doc(db,'posts',id);
  await updateDoc(refDoc, {...payload, updatedAt: serverTimestamp()});
}

export async function deletePost(id){
  await deleteDoc(doc(db,'posts',id));
}

// --------- Storage helpers ----------
export async function uploadFileInput(file) {
  if(!file) return '';
  const fname = Date.now() + "-" + file.name;
  const sref = ref(storage, 'uploads/' + fname);
  await uploadBytes(sref, file);
  return await getDownloadURL(sref);
}

// delete storage object by full URL (best-effort)
export async function deleteStorageByUrl(url){
  if(!url) return;
  try{
    // derive path after bucket root
    const base = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/`;
    if(url.startsWith(base)){
      const pathAndToken = url.substring(base.length);
      const path = decodeURIComponent(pathAndToken.split('?')[0]);
      const sref = ref(storage, path);
      await deleteObject(sref);
    }
  }catch(e){ console.warn('deleteStorageByUrl failed', e); }
}

// --------- Views counter (transaction simple)
import { runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export async function incrementViews(id){
  const refDoc = doc(db,'posts',id);
  try{
    await runTransaction(db, async (t) => {
      const snap = await t.get(refDoc);
      if(!snap.exists()) return;
      const cur = snap.data().views || 0;
      t.update(refDoc, { views: cur + 1 });
    });
  }catch(e){ console.warn('incViews err', e); }
}

// --------- Comments helpers ----------
export async function postComment(postId, name, text){
  return await addDoc(collection(db,'comments',postId,'items'), { name, text, createdAt: serverTimestamp() });
}

// --------- Dashboard stats ----------
export async function getDashboardStats(){
  // total posts (published or not)
  const postsCol = collection(db,'posts');
  const snapAll = await getCountFromServer(postsCol);
  const totalPosts = snapAll.data().count || 0;

  // total views (sum requires reading docs — safe for small counts)
  const q = query(collection(db,'posts'));
  const docs = await getDocs(q);
  let totalViews = 0;
  docs.forEach(d=> totalViews += (d.data().views || 0));

  // total comments (count subcollections)
  // Firestore doesn't have cross-subcollection count. We'll sum by scanning each post's comments count (if you store commentCount on post it's faster).
  let totalComments = 0;
  for(const d of docs){
    const postId = d.id;
    const cCol = collection(db,'comments',postId,'items');
    const cnt = await getCountFromServer(cCol);
    totalComments += (cnt.data().count || 0);
  }

  return { totalPosts, totalViews, totalComments };
}

// Export everything default
export default {
  db, auth, storage,
  signIn, signOutNow, registerUser, onAuth,
  getPostsPage, getPostById, createPost, updatePost, deletePost,
  uploadFileInput, incrementViews, postComment, getDashboardStats, deleteStorageByUrl
};