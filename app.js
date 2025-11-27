// app.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore, collection, addDoc, onSnapshot,
  updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* =====================
   YOUR FIREBASE CONFIG
   (kamu kirimkan, sudah aku paste)
   ===================== */
const firebaseConfig = {
  apiKey: "AIzaSyA1hFfXW4Equz-kGkFJ4pM1joyy7DYPet0",
  authDomain: "mywapblog-7de53.firebaseapp.com",
  projectId: "mywapblog-7de53",
  storageBucket: "mywapblog-7de53.firebasestorage.app",
  messagingSenderId: "1795132528",
  appId: "1:1795132528:web:920742ad86518d3ff438b5",
  measurementId: "G-K5ZFJDEWNS"
};

/* INIT */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* DOM */
const authPage = document.getElementById("authPage");
const dashboard = document.getElementById("dashboard");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const logoutBtn = document.getElementById("logoutBtn");
const addForm = document.getElementById("addForm");
const tableBody = document.getElementById("tableBody");
const totalHarianEl = document.getElementById("totalHarian");
const totalBulananEl = document.getElementById("totalBulanan");
const monthFilter = document.getElementById("monthFilter");

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const cancelEdit = document.getElementById("cancelEdit");

let chart = null;
let unsubscribe = null;
let localData = []; // semua transaksi user
let selectedMonthKey = "all"; // filter

/* Helper: format rupiah ID with titik */
function formatRp(num){
  if (!num && num !== 0) return "Rp 0";
  const n = Number(num) || 0;
  // id locale uses dot as thousand separator:
  return "Rp " + n.toLocaleString("id-ID");
}

/* Helper: parse Firestore timestamp safely */
function parseDate(ts){
  if (!ts) return new Date();
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

/* AUTH: Login */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (err) {
    alert(err.message);
  }
});

/* AUTH: Register */
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = registerForm.email.value.trim();
  const password = registerForm.password.value.trim();

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    registerForm.reset();
    alert("Akun berhasil dibuat. Silakan login.");
  } catch (err) {
    alert(err.message);
  }
});

/* Logout */
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

/* On Auth State Changed */
onAuthStateChanged(auth, (user) => {
  if (user) {
    authPage.classList.add("hidden");
    dashboard.classList.remove("hidden");
    startRealtime(user.uid);
  } else {
    // show auth
    authPage.classList.remove("hidden");
    dashboard.classList.add("hidden");
    if (unsubscribe) unsubscribe();
    localData = [];
    renderTable([]);
    updateChart([]);
    populateMonthFilter([]);
  }
});

/* Start realtime listener for user */
function startRealtime(uid){
  const q = query(collection(db, "users", uid, "records"), orderBy("tanggalUpload", "desc"));
  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(q, (snap) => {
    const arr = [];
    snap.forEach(docSnap => {
      arr.push({ id: docSnap.id, ...docSnap.data() });
    });
    localData = arr;
    // update UI
    populateMonthFilter(localData);
    applyFilterAndRender();
  }, (err) => {
    console.error("Firestore listener error:", err);
    localData = [];
    renderTable([]);
  });
}

/* ADD transaction */
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return alert("User belum login");

  const kategori = addForm.kategori.value.trim();
  const jumlah = Number(addForm.jumlah.value);
  const tipe = addForm.tipe.value;

  if (!kategori || !jumlah || isNaN(jumlah)) return alert("Isi kategori & jumlah benar");

  await addDoc(collection(db, "users", user.uid, "records"), {
    kategori,
    jumlah,
    tipe,
    tanggalUpload: serverTimestamp()
  });

  addForm.reset();
});

/* Populate month filter based on data (unique month-year) */
function populateMonthFilter(data){
  // build set of "YYYY-MM" keys
  const set = new Set();
  data.forEach(d => {
    const dt = parseDate(d.tanggalUpload);
    set.add(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`);
  });

  // convert to array sorted desc
  const keys = Array.from(set).sort((a,b)=> b.localeCompare(a));
  // build options: "all" + readable label
  monthFilter.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "Semua Bulan";
  monthFilter.appendChild(optAll);

  keys.forEach(k => {
    const [y,m] = k.split("-");
    const date = new Date(Number(y), Number(m)-1, 1);
    const label = date.toLocaleString("id-ID",{ month: "long", year: "numeric" });
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = label;
    monthFilter.appendChild(opt);
  });

  // keep selection if still valid
  if (!keys.includes(selectedMonthKey) && selectedMonthKey !== "all") selectedMonthKey = "all";
  monthFilter.value = selectedMonthKey;
}

/* month filter change */
monthFilter.addEventListener("change", (e) => {
  selectedMonthKey = e.target.value;
  applyFilterAndRender();
});

/* Apply filter and render table + totals + chart */
function applyFilterAndRender(){
  let filtered = localData.slice(); // copy

  if (selectedMonthKey !== "all") {
    filtered = filtered.filter(d=>{
      const dt = parseDate(d.tanggalUpload);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
      return key === selectedMonthKey;
    });
  }

  renderTable(filtered);
  renderTotals(filtered);
  updateChart(filtered);
}

/* Render table (tbody) */
function renderTable(data){
  tableBody.innerHTML = "";
  data.forEach(item => {
    const tr = document.createElement("tr");

    const tdKat = document.createElement("td");
    tdKat.textContent = item.kategori;

    const tdJumlah = document.createElement("td");
    const sign = (item.tipe === "masuk") ? "+" : "-";
    tdJumlah.textContent = `${sign} ${formatRp(item.jumlah)}`;

    const tdTgl = document.createElement("td");
    const dt = parseDate(item.tanggalUpload);
    tdTgl.textContent = dt.toLocaleString("id-ID");

    const tdAksi = document.createElement("td");
    tdAksi.className = "actions";
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn outline";
    btnEdit.textContent = "Edit";
    btnEdit.addEventListener("click", ()=> openEditModal(item));

    const btnHapus = document.createElement("button");
    btnHapus.className = "btn";
    btnHapus.textContent = "Hapus";
    btnHapus.addEventListener("click", ()=> hapusData(item.id));

    tdAksi.appendChild(btnEdit);
    tdAksi.appendChild(btnHapus);

    tr.appendChild(tdKat);
    tr.appendChild(tdJumlah);
    tr.appendChild(tdTgl);
    tr.appendChild(tdAksi);

    tableBody.appendChild(tr);
  });

  if (data.length === 0){
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#777;padding:18px">Belum ada transaksi.</td></tr>`;
  }
}

/* Render totals: hari ini & bulan terpilih */
function renderTotals(data){
  const now = new Date();
  const todayKey = now.toLocaleDateString("id-ID");
  let totalHarian = 0;
  let totalBulanan = 0;

  data.forEach(d => {
    const dt = parseDate(d.tanggalUpload);
    const isToday = dt.toLocaleDateString("id-ID") === todayKey;
    if (isToday) totalHarian += (d.tipe === "masuk") ? d.jumlah : -d.jumlah;
    totalBulanan += (d.tipe === "masuk") ? d.jumlah : -d.jumlah;
  });

  totalHarianEl.textContent = formatRp(totalHarian);
  totalBulananEl.textContent = formatRp(totalBulanan);
}

/* Edit modal */
let editingId = null;
function openEditModal(item){
  editingId = item.id;
  editForm.kategori.value = item.kategori;
  editForm.jumlah.value = item.jumlah;
  editForm.tipe.value = item.tipe;
  editModal.classList.remove("hidden");
}

/* Cancel edit */
cancelEdit.addEventListener("click", ()=>{
  editingId = null;
  editModal.classList.add("hidden");
});

/* Submit edit */
editForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const user = auth.currentUser;
  if (!user || !editingId) return;

  const kategori = editForm.kategori.value.trim();
  const jumlah = Number(editForm.jumlah.value);
  const tipe = editForm.tipe.value;

  if (!kategori || isNaN(jumlah)) return alert("Isi data dengan benar");

  const ref = doc(db, "users", user.uid, "records", editingId);
  await updateDoc(ref, { kategori, jumlah, tipe });

  editingId = null;
  editModal.classList.add("hidden");
});

/* Hapus data */
async function hapusData(id){
  const user = auth.currentUser;
  if (!user) return;
  if (!confirm("Yakin ingin menghapus?")) return;
  await deleteDoc(doc(db, "users", user.uid, "records", id));
}

/* Chart rendering: simple aggregated per day within filtered data */
function updateChart(data){
  // Aggregate by date label (dd MMM)
  const map = {};
  data.slice().reverse().forEach(d=>{
    const dt = parseDate(d.tanggalUpload);
    const label = dt.toLocaleDateString("id-ID");
    if (!map[label]) map[label] = 0;
    map[label] += (d.tipe === "masuk") ? d.jumlah : -d.jumlah;
  });

  const labels = Object.keys(map);
  const values = labels.map(l => map[l]);

  const ctx = document.getElementById("myChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Arus (Rp)",
        data: values,
        backgroundColor: labels.map(v => (v ? "rgba(75,141,224,0.8)" : "rgba(75,141,224,0.6)"))
      }]
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { callback: (val)=> val.toLocaleString("id-ID") } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* utility: render empty table initially */
function renderTableEmpty(){
  tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#777;padding:18px">Memuat...</td></tr>`;
}
renderTableEmpty();