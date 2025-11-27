import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    getFirestore, collection, addDoc, onSnapshot,
    updateDoc, deleteDoc, doc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// --------------------
// CONFIG FIREBASE
// --------------------

const firebaseConfig = {
  apiKey: "AIzaSyA1hFfXW4Equz-kGkFJ4pM1joyy7DYPet0",
  authDomain: "mywapblog-7de53.firebaseapp.com",
  projectId: "mywapblog-7de53",
  storageBucket: "mywapblog-7de53.firebasestorage.app",
  messagingSenderId: "1795132528",
  appId: "1:1795132528:web:920742ad86518d3ff438b5",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// --------------------
// DOM SELECTOR
// --------------------

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const logoutBtn = document.getElementById("logoutBtn");
const addForm = document.getElementById("addForm");
const tableBody = document.getElementById("tableBody");
const totalHarianEl = document.getElementById("totalHarian");
const totalBulananEl = document.getElementById("totalBulanan");

const authPage = document.getElementById("authPage");
const dashboard = document.getElementById("dashboard");


// --------------------
// LOGIN
// --------------------

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login Berhasil!");
    } catch (err) {
        alert(err.message);
    }
});


// --------------------
// REGISTER
// --------------------

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = registerForm.email.value;
    const password = registerForm.password.value;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Berhasil daftar!");
    } catch (err) {
        alert(err.message);
    }
});


// --------------------
// LOGOUT
// --------------------

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
});


// --------------------
// AUTH STATE
// --------------------

let unsubscribe = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        authPage.style.display = "none";
        dashboard.style.display = "block";
        loadData(user.uid);
    } else {
        authPage.style.display = "block";
        dashboard.style.display = "none";
        if (unsubscribe) unsubscribe();
    }
});


// --------------------
// TAMBAH DATA
// --------------------

addForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) return;

    const kategori = addForm.kategori.value;
    const jumlah = Number(addForm.jumlah.value);
    const tipe = addForm.tipe.value;

    await addDoc(collection(db, "users", user.uid, "records"), {
        kategori,
        jumlah,
        tipe,
        tanggalUpload: new Date()
    });

    addForm.reset();
});


// --------------------
// LOAD DATA REALTIME
// --------------------

function loadData(uid) {

    const q = query(
        collection(db, "users", uid, "records"),
        orderBy("tanggalUpload", "desc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        let data = [];
        tableBody.innerHTML = "";

        snapshot.forEach((docx) => {
            const item = { id: docx.id, ...docx.data() };
            data.push(item);

            let tgl = new Date(item.tanggalUpload.seconds * 1000).toLocaleString();

            tableBody.innerHTML += `
                <tr>
                    <td>${item.kategori}</td>
                    <td>${item.tipe === "masuk" ? "+" : "-"} Rp ${item.jumlah}</td>
                    <td>${tgl}</td>
                    <td>
                        <button onclick="editData('${item.id}', '${item.kategori}', '${item.jumlah}', '${item.tipe}')">Edit</button>
                        <button onclick="hapusData('${item.id}')">Hapus</button>
                    </td>
                </tr>
            `;
        });

        hitungRekap(data);
        updateChart(data);
    });
}


// --------------------
// EDIT DATA
// --------------------

window.editData = async (id, kategori, jumlah, tipe) => {
    const user = auth.currentUser;

    let kategoriBaru = prompt("Kategori:", kategori);
    let jumlahBaru = prompt("Jumlah:", jumlah);

    if (!kategoriBaru || !jumlahBaru) return;

    await updateDoc(doc(db, "users", user.uid, "records", id), {
        kategori: kategoriBaru,
        jumlah: Number(jumlahBaru),
        tipe
    });
};


// --------------------
// HAPUS DATA
// --------------------

window.hapusData = async (id) => {
    const user = auth.currentUser;

    if (confirm("Yakin hapus data ini?")) {
        await deleteDoc(doc(db, "users", user.uid, "records", id));
    }
};


// --------------------
// REKAP KEUANGAN
// --------------------

function hitungRekap(data) {
    const today = new Date().toLocaleDateString();
    const month = new Date().getMonth();

    let totalHarian = 0;
    let totalBulanan = 0;

    data.forEach((d) => {
        const tgl = new Date(d.tanggalUpload.seconds * 1000);

        if (tgl.toLocaleDateString() === today) {
            totalHarian += d.tipe === "masuk" ? d.jumlah : -d.jumlah;
        }

        if (tgl.getMonth() === month) {
            totalBulanan += d.tipe === "masuk" ? d.jumlah : -d.jumlah;
        }
    });

    totalHarianEl.innerText = "Rp " + totalHarian.toLocaleString();
    totalBulananEl.innerText = "Rp " + totalBulanan.toLocaleString();
}


// --------------------
// GRAFIK
// --------------------

let chart;

function updateChart(data) {
    const ctx = document.getElementById("myChart");

    const labels = data.map((d) =>
        new Date(d.tanggalUpload.seconds * 1000).toLocaleDateString()
    );

    const values = data.map((d) => (d.tipe === "masuk" ? d.jumlah : -d.jumlah));

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Grafik Keuangan",
                    data: values
                }
            ]
        }
    });
}