const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://nihongo-journey-default-rtdb.firebaseio.com/", // Ganti dengan URL database Anda
});

// Get database reference
const db = admin.database();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Auth middleware
const authenticateUser = async (req, res, next) => {
  try {
    const sessionCookie = req.cookies.session || "";

    if (!sessionCookie) {
      throw new Error("No session cookie found");
    }

    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
    req.user = decodedClaims;
    next();
  } catch (error) {
    res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>403 Access Denied</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-800 flex items-center justify-center min-h-screen">
        <div class="text-center">
          <h1 class="text-4xl font-bold text-gray-400 mb-4">403 - Access Denied</h1>
          <p class="text-gray-200 mb-6">Anda harus login untuk mengakses halaman ini.</p>
          <a href="/" class="inline-block text-blue-600 font-bold">Kembali</a>
        </div>
      </body>
      </html>
    `);
  }
};

// Function to save user data to Realtime Database
const saveUserData = async (user) => {
  try {
    const userRef = db.ref(`users/${user.uid}`);

    // Check if user already exists
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      // New user - create with default data
      await userRef.set({
        uid: user.uid,
        email: user.email,
        name: user.name || user.email.split("@")[0],
        picture: user.picture || "",
        createdAt: admin.database.ServerValue.TIMESTAMP,
        lastLogin: admin.database.ServerValue.TIMESTAMP,
      });
    } else {
      // Existing user - update last login and basic info
      await userRef.update({
        lastLogin: admin.database.ServerValue.TIMESTAMP,
        name: user.name || snapshot.val().name,
        picture: user.picture || snapshot.val().picture,
      });
    }
  } catch (error) {
    console.error("Error saving user data:", error);
    throw error;
  }
};
// HANDLING ENDPOINT LOGIN BY GOOGLE
// Routes
app.post("/api/auth/signin", async (req, res) => {
  try {
    const { idToken } = req.body;

    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Create session cookie (expires in 5 days)
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });

    // Prepare user data
    const userData = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email.split("@")[0],
      picture: decodedToken.picture || "",
    };

    // Save user data to Realtime Database
    await saveUserData(userData);

    // Set secure cookie options
    const options = {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    res.cookie("session", sessionCookie, options);
    res.json({
      success: true,
      user: userData,
    });
  } catch (error) {
    console.error("Sign-in error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
});

app.post("/api/auth/signout", (req, res) => {
  res.clearCookie("session");
  res.json({ success: true });
});
app.get("/api/user/profile", authenticateUser, async (req, res) => {
  try {
    const userRef = db.ref(`users/${req.user.uid}`);
    const snapshot = await userRef.once("value");

    if (snapshot.exists()) {
      const userData = snapshot.val();
      res.json({
        uid: userData.uid,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
      });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

//ROUTES
app.use("/Dashboard", authenticateUser, express.static(path.join(__dirname, "public", "Dashboard")));

app.get("/Dashboard/user", authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard", "user.html"));
});
app.get("/Dashboard/roadmap", authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard", "roadmap.html"));
});
app.get("/Dashboard/flashcards", authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard", "flashcards.html"));
});
app.get("/Dashboard/conversation", authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard", "conversation.html"));
});
app.get("/Dashboard/kanji", authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard", "kanji.html"));
});
// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// GEMINI LESSONS & QUIZ FUNCTION
async function generateGeminiContent(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract and clean the response
    let content = data.candidates[0].content.parts[0].text;

    // Try to extract JSON if it's wrapped in markdown
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      content = jsonMatch[1];
    }

    // Clean any remaining markdown or extra characters
    content = content.replace(/```json|```/g, "").trim();

    return content;
  } catch (error) {
    console.error("Error generating Gemini content:", error);
    throw error;
  }
}

function formatLessonContent(rawContent) {
  try {
    // Debug: Log raw content

    // Try to parse as JSON first
    const parsed = JSON.parse(rawContent);

    // Debug: Log parsed content

    let html = "";

    if (parsed.title) {
      html += `<h3 class="text-xl font-bold mb-4 text-gray-800">${parsed.title}</h3>`;
    }

    if (parsed.introduction) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-2 text-gray-700">Pengenalan</h4>
        <p class="text-gray-600 leading-relaxed">${parsed.introduction}</p>
      </div>`;
    }

    // PERBAIKAN: Konsistensi struktur vocabulary
    if (parsed.vocabulary && Array.isArray(parsed.vocabulary) && parsed.vocabulary.length > 0) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-3 text-gray-700">Kosakata</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;

      parsed.vocabulary.forEach((item, index) => {
        // Debug setiap item

        const japanese = item.japanese || item.word || "N/A";
        const romaji = item.romaji || item.reading || "";
        const meaning = item.meaning || item.translation || "N/A";

        html += `<div class="bg-gray-50 p-3 rounded-lg">
          <div class="font-medium text-gray-800">${japanese}</div>
          <div class="text-sm text-gray-600">${romaji}</div>
          <div class="text-sm text-blue-600">${meaning}</div>
        </div>`;
      });

      html += `</div></div>`;
    }

    // PERBAIKAN: Konsistensi struktur examples
    if (parsed.examples && Array.isArray(parsed.examples) && parsed.examples.length > 0) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-3 text-gray-700">Contoh Kalimat</h4>
        <div class="space-y-3">`;

      parsed.examples.forEach((example, index) => {
        // Debug setiap example

        const japanese = example.japanese || example.sentence || "N/A";
        const romaji = example.romaji || example.reading || "";
        const meaning = example.meaning || example.translation || "N/A";

        html += `<div class="bg-blue-50 p-3 rounded-lg">
          <div class="font-medium text-gray-800">${japanese}</div>
          <div class="text-sm text-gray-600">${romaji}</div>
          <div class="text-sm text-blue-600">${meaning}</div>
        </div>`;
      });

      html += `</div></div>`;
    }

    // PERBAIKAN: Konsistensi struktur grammar
    if (parsed.grammar && Array.isArray(parsed.grammar) && parsed.grammar.length > 0) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-3 text-gray-700">Tata Bahasa</h4>
        <div class="space-y-3">`;

      parsed.grammar.forEach((rule, index) => {
        const pattern = rule.pattern || rule.title || rule.structure || "N/A";
        const explanation = rule.explanation || rule.description || rule.usage || "";
        const example = rule.example || rule.sample || "";

        html += `<div class="bg-green-50 p-3 rounded-lg">
          <div class="font-medium text-gray-800">${pattern}</div>
          <div class="text-sm text-gray-600">${explanation}</div>
          ${example ? `<div class="text-sm text-green-600 mt-1">${example}</div>` : ""}
        </div>`;
      });

      html += `</div></div>`;
    }

    if (parsed.culturalNotes) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-2 text-gray-700">Catatan Budaya</h4>
        <div class="bg-yellow-50 p-3 rounded-lg">
          <p class="text-gray-600 leading-relaxed">${parsed.culturalNotes}</p>
        </div>
      </div>`;
    }

    // PERBAIKAN: Konsistensi struktur tips
    if (parsed.tips && Array.isArray(parsed.tips) && parsed.tips.length > 0) {
      html += `<div class="mb-6">
        <h4 class="text-lg font-semibold mb-3 text-gray-700">Tips Pembelajaran</h4>
        <ul class="space-y-2">`;

      parsed.tips.forEach((tip, index) => {
        const tipText = typeof tip === "string" ? tip : tip.text || tip.content || "N/A";

        html += `<li class="flex items-start">
          <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div class="text-gray-600">${tipText}</div>
        </li>`;
      });

      html += `</ul></div>`;
    }

    return html;
  } catch (error) {
    console.error("Error parsing lesson content:", error);
    console.error("Raw content that failed to parse:", rawContent);

    // Improved fallback with better formatting
    return `<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <h4 class="text-lg font-semibold text-red-800 mb-2">Error Parsing Content</h4>
      <p class="text-red-600 mb-3">Gagal memparse konten JSON. Menampilkan konten mentah:</p>
      <div class="bg-white p-3 rounded border">
        <pre class="whitespace-pre-wrap text-sm text-gray-700">${rawContent}</pre>
      </div>
    </div>`;
  }
}

app.post("/api/generate-lesson", authenticateUser, async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    // PERBAIKAN: Prompt yang lebih spesifik dan konsisten
    let prompt = "";

    switch (topic.toLowerCase()) {
      case "introduction":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Perkenalan Diri" dalam format JSON yang VALID. 
        
        Format JSON yang HARUS diikuti:
        {
          "title": "string",
          "introduction": "string",
          "vocabulary": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "examples": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string", 
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "grammar": [
            {
              "pattern": "string",
              "explanation": "string",
              "example": "string"
            }
          ],
          "culturalNotes": "string",
          "tips": ["string1", "string2", "string3"]
        }
        
        ATURAN PENTING:
        - introduction, grammar.explanation, dan culturalNotes HARUS murni dalam bahasa Indonesia, tidak boleh ada teks Jepang atau romaji.
        - Gunakan gaya menjelaskan seperti guru ke siswa.
        - Jangan campur kalimat penjelasan dengan huruf Jepang, romaji, atau terjemahan literal.
        - Teks Jepang hanya boleh muncul di bagian vocabulary.japanese, examples.japanese, dan grammar.example.
        - Minimal 8 kosakata dalam hiragana
        - Minimal 5 contoh kalimat dalam hiragana
        - Minimal 3 grammar pattern dalam hiragana
        - Minimal 3 tips
        - Catatan Budaya menggunakan bahasa indonesia
        - Gunakan nama dummy: Tanaka, Suzuki, Yamada
        - Response harus JSON valid tanpa markdown wrapper
        
        Topik: Perkenalan diri termasuk nama, umur, hobi, asal daerah.`;
        break;

      case "family":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Keluarga" dalam format JSON yang VALID.
        
        Format JSON yang HARUS diikuti:
        {
          "title": "string",
          "introduction": "string", 
          "vocabulary": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "examples": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "grammar": [
            {
              "pattern": "string",
              "explanation": "string", 
              "example": "string"
            }
          ],
          "culturalNotes": "string",
          "tips": ["string1", "string2", "string3"]
        }
        
        ATURAN PENTING:
        - introduction, grammar.explanation, dan culturalNotes HARUS murni dalam bahasa Indonesia, tidak boleh ada teks Jepang atau romaji.
        - Gunakan gaya menjelaskan seperti guru ke siswa.
        - Jangan campur kalimat penjelasan dengan huruf Jepang, romaji, atau terjemahan literal.
        - Teks Jepang hanya boleh muncul di bagian vocabulary.japanese, examples.japanese, dan grammar.example.
        - Minimal 8 kosakata dalam hiragana
        - Minimal 5 contoh kalimat dalam hiragana
        - Minimal 3 grammar pattern dalam hiragana
        - Minimal 3 tips
        - Catatan Budaya menggunakan bahasa indonesia
        - JIKA INGIN MENGGUNAKAN KANJI GUNAKAN KANJI DASAR N5-N4 WAJIB!

        - Response harus JSON valid tanpa markdown wrapper
        
        Topik: Anggota keluarga (ayah, ibu, kakak, adik, dll).`;
        break;

      case "greetings":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Salam dan Sapaan" dalam format JSON yang VALID.
        
        Format JSON yang HARUS diikuti:
        {
          "title": "string",
          "introduction": "string",
          "vocabulary": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string", 
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "examples": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "grammar": [
            {
              "pattern": "string",
              "explanation": "string",
              "example": "string"
            }
          ],
          "culturalNotes": "string",
          "tips": ["string1", "string2", "string3"]
        }
        
        ATURAN PENTING:
        - introduction, grammar.explanation, dan culturalNotes HARUS murni dalam bahasa Indonesia, tidak boleh ada teks Jepang atau romaji.
        - Gunakan gaya menjelaskan seperti guru ke siswa.
        - Jangan campur kalimat penjelasan dengan huruf Jepang, romaji, atau terjemahan literal.
        - Teks Jepang hanya boleh muncul di bagian vocabulary.japanese, examples.japanese, dan grammar.example.
        - Minimal 8 kosakata dalam hiragana
        - Minimal 5 contoh kalimat dalam hiragana
        - Minimal 3 grammar pattern dalam hiragana
        - Minimal 3 tips
        - Catatan Budaya menggunakan bahasa indonesia
        - JIKA INGIN MENGGUNAKAN KANJI GUNAKAN KANJI DASAR N5-N4 WAJIB!
        - Response harus JSON valid tanpa markdown wrapper
        
        Topik: Berbagai salam berdasarkan waktu dan situasi.`;
        break;

      case "numbers":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Angka dan Bilangan" dalam format JSON yang VALID.
        
        Format JSON yang HARUS diikuti:
        {
          "title": "string",
          "introduction": "string",
          "vocabulary": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "examples": [
            {
              "japanese": "string (hiragana)", 
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "grammar": [
            {
              "pattern": "string",
              "explanation": "string",
              "example": "string"
            }
          ],
          "culturalNotes": "string",
          "tips": ["string1", "string2", "string3"]
        }
        
        ATURAN PENTING:
        - introduction, grammar.explanation, dan culturalNotes HARUS murni dalam bahasa Indonesia, tidak boleh ada teks Jepang atau romaji.
        - Gunakan gaya menjelaskan seperti guru ke siswa.
        - Jangan campur kalimat penjelasan dengan huruf Jepang, romaji, atau terjemahan literal.
        - Teks Jepang hanya boleh muncul di bagian vocabulary.japanese, examples.japanese, dan grammar.example.
        - JIKA MENGGUNKAN KANJI GUNAKAN HANYA KANJI DASAR N5
        - Minimal 15 kosakata angka (1-20 dan bilangan penting)
        - Minimal 5 contoh kalimat penggunaan angka
        - Minimal 3 grammar pattern
        - Minimal 3 tips (termasuk rumus seperti 1+10=juuichi)
        - Response harus JSON valid tanpa markdown wrapper
        
        Topik: Angka 1-20 dan cara penggunaannya.`;
        break;

      case "birthday":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Tanggal Lahir dan Ulang Tahun" dalam format JSON yang VALID.
        
        Format JSON yang HARUS diikuti:
        {
          "title": "string",
          "introduction": "string",
          "vocabulary": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string",
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "examples": [
            {
              "japanese": "string (hiragana)",
              "romaji": "string", 
              "meaning": "string (bahasa Indonesia)"
            }
          ],
          "grammar": [
            {
              "pattern": "string",
              "explanation": "string",
              "example": "string"
            }
          ],
          "culturalNotes": "string",
          "tips": ["string1", "string2", "string3"]
        }
        
        ATURAN PENTING:
        - introduction, grammar.explanation, dan culturalNotes HARUS murni dalam bahasa Indonesia, tidak boleh ada teks Jepang atau romaji.
        - Gunakan gaya menjelaskan seperti guru ke siswa.
        - Jangan campur kalimat penjelasan dengan huruf Jepang, romaji, atau terjemahan literal.
        - Teks Jepang hanya boleh muncul di bagian vocabulary.japanese, examples.japanese, dan grammar.example.
        - JIKA MENGGUNKAN KANJI GUNAKAN HANYA KANJI DASAR N5
        - Minimal 10 kosakata (hari, bulan, tahun)
        - Minimal 5 contoh kalimat
        - Minimal 3 grammar pattern
        - Minimal 3 tips
        - Response harus JSON valid tanpa markdown wrapper
        
        Topik: Cara menyebutkan tanggal lahir dan ulang tahun.`;
        break;

      case "invitation":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Mengundang dan Merespons Ajakan" dalam format JSON yang VALID.

Format JSON yang HARUS diikuti:
{
  "title": "string",
  "introduction": "string",
  "vocabulary": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string",
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "examples": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string", 
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "grammar": [
    {
      "pattern": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "culturalNotes": "string",
  "tips": ["string1", "string2", "string3"]
}

ATURAN PENTING:
- Topik utama adalah tentang mengundang, menolak, dan menerima ajakan dalam bahasa Jepang, serta penggunaannya dalam situasi nyata.
- Penjelasan pada *introduction*, *grammar.explanation*, dan *culturalNotes* HARUS dalam bahasa Indonesia yang baik dan komunikatif (gaya guru ke siswa).
- TIDAK BOLEH mencampur huruf Jepang atau romaji dalam penjelasan teks (hanya di tempat yang ditentukan).
- Huruf Jepang (hiragana/kanji dasar N5) hanya boleh digunakan di:
  - vocabulary.japanese
  - examples.japanese
  - grammar.example
- WAJIB menyertakan:
  ✅ Minimal **10 kosakata** terkait ajakan & respons (misal: ayo, maukah, bersama, maaf, tidak bisa, dll)
  ✅ Minimal **5 contoh kalimat undangan dan respons**
  ✅ Minimal **3 pola tata bahasa (grammar pattern)**
  ✅ Minimal **3 tips komunikasi dalam konteks mengundang**
- Gunakan gaya menjelaskan seperti guru yang membimbing murid.

Topik: Mengundang dan merespons ajakan dalam kehidupan sehari-hari.`;
        break;
      case "skills":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Menyatakan Kemahiran" dalam format JSON yang VALID.

Format JSON yang HARUS diikuti:
{
  "title": "string",
  "introduction": "string",
  "vocabulary": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string",
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "examples": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string", 
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "grammar": [
    {
      "pattern": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "culturalNotes": "string",
  "tips": ["string1", "string2", "string3"]
}

ATURAN PENTING:
- Topik difokuskan pada cara menyatakan kemahiran atau kemampuan dalam bahasa Jepang, baik secara aktif maupun pasif (misalnya: bisa berenang, mahir bermain gitar, tidak bisa berbicara Inggris).
- Penjelasan pada *introduction*, *grammar.explanation*, dan *culturalNotes* HARUS ditulis dalam bahasa Indonesia murni (tanpa romaji atau huruf Jepang).
- Gunakan gaya mengajar seperti guru ke siswa: jelas, membimbing, dan tidak mencampur dengan istilah asing.
- Huruf Jepang hanya boleh digunakan di:
  - vocabulary.japanese
  - examples.japanese
  - grammar.example
- Romaji hanya boleh muncul di properti romaji.
- Jika menggunakan kanji, gunakan hanya kanji level dasar JLPT N5.
- Modul WAJIB memuat:
  ✅ Minimal **10 kosakata** yang berhubungan dengan kemampuan/kegiatan (misal: berenang, menulis, berbicara, memahami, membaca)
  ✅ Minimal **5 contoh kalimat** yang menyatakan kemahiran dalam bentuk positif dan negatif
  ✅ Minimal **3 pola tata bahasa (grammar pattern)**, termasuk penggunaan ~ことができる atau bentuk potensial
  ✅ Minimal **3 tips belajar komunikasi yang menyatakan kemampuan dengan sopan dan sesuai konteks

Topik: Menyatakan kemahiran atau kemampuan dalam percakapan sehari-hari.`;
        break;
      case "konbini":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Berbelanja di Konbini (Convenience Store)" dalam format JSON yang VALID.

Format JSON yang HARUS diikuti:
{
  "title": "string",
  "introduction": "string",
  "vocabulary": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string",
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "examples": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string", 
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "grammar": [
    {
      "pattern": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "culturalNotes": "string",
  "tips": ["string1", "string2", "string3"]
}

ATURAN PENTING:
- Modul difokuskan untuk percakapan dan situasi nyata di toko konbini (convenience store), seperti membeli makanan/minuman, menanyakan makanan halal, harga, dan melakukan pembayaran.
- *introduction*, *grammar.explanation*, dan *culturalNotes* HARUS murni dalam bahasa Indonesia tanpa romaji atau huruf Jepang.
- Gunakan gaya penjelasan seperti guru ke siswa: sederhana, jelas, dan mudah dipahami.
- Huruf Jepang (hiragana atau kanji N5) hanya digunakan di:
  - vocabulary.japanese
  - examples.japanese
  - grammar.example
- Romaji hanya digunakan di properti romaji.
- WAJIB menyertakan:
  ✅ Minimal **10 kosakata** terkait aktivitas di konbini (misal: onigiri, teh hijau, harga, kasir, halal, dll)
  ✅ Minimal **5 contoh kalimat** seputar bertanya dan membeli di konbini
  ✅ Minimal **3 pola tata bahasa** umum dalam konteks bertanya dan transaksi
  ✅ Minimal **3 tips** praktis untuk menghadapi situasi di konbini

Topik: Percakapan praktis saat berbelanja di konbini di Jepang.`;
        break;
      case "flavour":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Menyatakan Rasa Makanan" dalam format JSON yang VALID.

Format JSON yang HARUS diikuti:
{
  "title": "string",
  "introduction": "string",
  "vocabulary": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string",
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "examples": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string", 
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "grammar": [
    {
      "pattern": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "culturalNotes": "string",
  "tips": ["string1", "string2", "string3"]
}

ATURAN PENTING:
- Modul harus mencakup cara menyatakan rasa makanan secara umum, menyebutkan makanan enak, dan jenis-jenis rasa (manis, asin, pedas, dll).
- introduction, grammar.explanation, dan culturalNotes wajib dalam bahasa Indonesia saja, tidak boleh ada romaji atau huruf Jepang.
- Gunakan gaya mengajar seperti guru ke murid.
- Huruf Jepang (hiragana/kanji N5) hanya untuk:
  - vocabulary.japanese
  - examples.japanese
  - grammar.example
- Gunakan romaji hanya di properti romaji.
- WAJIB mencantumkan:
  ✅ Minimal **10 kosakata** terkait rasa dan makanan
  ✅ Minimal **5 contoh kalimat** menyatakan rasa atau pendapat tentang makanan
  ✅ Minimal **3 pola grammar** yang umum digunakan untuk mendeskripsikan rasa
  ✅ Minimal **3 tips** untuk menyampaikan rasa makanan dengan sopan dan akurat

Topik: Menyatakan rasa dan komentar makanan dalam bahasa Jepang.`;
        break;
      case "rent-bike":
        prompt = `Buatkan modul pembelajaran bahasa Jepang tentang "Menyewa Sepeda" dalam format JSON yang VALID.

Format JSON yang HARUS diikuti:
{
  "title": "string",
  "introduction": "string",
  "vocabulary": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string",
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "examples": [
    {
      "japanese": "string (hiragana atau kanji dasar N5)",
      "romaji": "string", 
      "meaning": "string (bahasa Indonesia)"
    }
  ],
  "grammar": [
    {
      "pattern": "string",
      "explanation": "string",
      "example": "string"
    }
  ],
  "culturalNotes": "string",
  "tips": ["string1", "string2", "string3"]
}

ATURAN PENTING:
- Fokus modul adalah pada aktivitas menyewa sepeda: dari menanyakan ketersediaan, mempersiapkan data/dokumen, hingga proses pembayaran.
- *introduction*, *grammar.explanation*, dan *culturalNotes* HARUS dalam bahasa Indonesia tanpa campuran romaji atau huruf Jepang.
- Gunakan gaya mengajar seperti guru ke siswa, mudah dimengerti dan tidak teknis.
- Huruf Jepang hanya boleh muncul di:
  - vocabulary.japanese
  - examples.japanese
  - grammar.example
- Romaji hanya digunakan dalam properti romaji.
- Modul wajib memuat:
  ✅ Minimal **10 kosakata** terkait penyewaan sepeda dan alat transportasi ringan
  ✅ Minimal **5 contoh kalimat** untuk bertanya, menyewa, dan membayar
  ✅ Minimal **3 grammar pattern** umum dalam transaksi sewa
  ✅ Minimal **3 tips** praktis saat menyewa sepeda di Jepang

Topik: Percakapan sehari-hari saat menyewa sepeda di Jepang.`;
        break;

      default:
        return res.status(400).json({ error: "Unknown topic" });
    }

    const rawContent = await generateGeminiContent(prompt);
    const formattedContent = formatLessonContent(rawContent);

    res.json({
      success: true,
      content: formattedContent,
      topic: topic,
    });
  } catch (error) {
    console.error("Error generating lesson:", error);
    res.status(500).json({
      error: "Failed to generate lesson content",
      details: error.message,
    });
  }
});
function formatQuizContent(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);

    let html = `<div class="quiz-container">`;

    if (parsed.title) {
      html += `<h3 class="text-xl font-bold mb-4 text-gray-800">${parsed.title}</h3>`;
    }

    if (parsed.questions && parsed.questions.length > 0) {
      html += `<div class="space-y-6">`;

      parsed.questions.forEach((question, index) => {
        html += `<div class="question-block bg-gray-50 p-4 rounded-lg">
          <div class="question-header mb-3">
            <span class="text-sm font-medium text-purple-600">Pertanyaan ${index + 1}</span>
            <div class="text-lg font-semibold text-gray-800 mt-1">${question.question}</div>
          </div>
          
          <div class="options space-y-2">`;

        question.options.forEach((option, optIndex) => {
          const optionLetter = String.fromCharCode(65 + optIndex); // A, B, C, D
          html += `<label class="flex items-center p-2 rounded hover:bg-white cursor-pointer">
            <input type="radio" name="question_${index}" value="${optionLetter}" class="mr-3">
            <span class="text-gray-700">${optionLetter}. ${option}</span>
          </label>`;
        });

        html += `</div>
          <div class="answer-feedback hidden mt-3 p-3 rounded" data-correct="${question.correctAnswer}">
            <div class="correct-feedback text-green-700 bg-green-100">
              <strong>Benar!</strong> ${question.explanation || "Jawaban Anda tepat."}
            </div>
            <div class="incorrect-feedback text-red-700 bg-red-100">
              <strong>Salah.</strong> Jawaban yang benar adalah ${question.correctAnswer}. ${question.explanation || ""}
            </div>
          </div>
        </div>`;
      });

      html += `</div>
        <div class="mt-6 flex justify-between items-center">
          <div id="quizScore" class="text-lg font-semibold text-gray-700 hidden">
            Skor: <span class="text-purple-600">0</span>/<span>${parsed.questions.length}</span>
          </div>
          <button onclick="submitQuiz()" class="px-6 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
            Submit Quiz
          </button>
        </div>`;
    }

    return html;
  } catch (error) {
    console.error("Error formatting quiz:", error);
    return `<div class="text-red-500">Error memformat quiz. Silakan coba lagi.</div>`;
  }
}

app.post("/api/generate-quiz", authenticateUser, async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const prompt = `Anda adalah seorang guru bahasa jepang yg hanya menjawab dalam format JSON valid dan bersih (tidak memakai markdown).

Tugas Anda adalah membuat quiz bahasa Jepang dengan topik: "${topic}"

PERHATIKAN ATURAN PENTING BERIKUT:
- Semua pilihan jawaban harus ditulis dalam huruf **hiragana atau romaji** saja. **JANGAN menggunakan kanji.**
- Pertanyaan ditulis dalam **bahasa Indonesia**.
- Gaya soal harus sederhana dan seperti ini: "Juugo bahasa Jepangnya?", "Apa arti 'tabemasu'?", "Manakah bentuk negatif dari 'ikimasu'?", dll.
- Sertakan variasi soal: kosakata, arti kata, bentuk negatif/positif, partikel, dan kalimat sederhana.
- **JANGAN menyimpang dari format atau topik.**
- Buat 10 Soal saja

Jawab dalam format JSON seperti contoh berikut (jangan tambahkan markdown atau penjelasan di luar JSON):

{
  "title": "Quiz Kosakata Angka",
  "questions": [
    {
      "question": "Juugo bahasa Jepangnya?",
      "options": ["じゅうろく", "じゅうよん", "じゅうご", "じゅうなな"],
      "correctAnswer": "C",
      "explanation": "'Juugo' berarti lima belas dalam bahasa Jepang. Ditulis じゅうご."
    },
    {
      "question": "Apa arti 'tabemasu'?",
      "options": ["minum", "makan", "pergi", "datang"],
      "correctAnswer": "B",
      "explanation": "'Tabemasu' berarti 'makan'."
    },
    {
      "question": "Manakah bentuk negatif dari 'ikimasu'?",
      "options": ["ikanai", "ikimashita", "ikemasen", "itte"],
      "correctAnswer": "C",
      "explanation": "'Ikimasu' bentuk negatifnya adalah 'ikemasen'."
    },
    {
      "question": "Partikel untuk objek langsung adalah?",
      "options": ["wa", "ga", "wo", "ni"],
      "correctAnswer": "C",
      "explanation": "Partikel 'wo' digunakan untuk objek langsung dalam kalimat."
    },
    {
      "question": "'Gakkou e ikimasu' artinya?",
      "options": ["Saya pulang ke rumah", "Saya pergi ke sekolah", "Saya makan di sekolah", "Saya tidur di rumah"],
      "correctAnswer": "B",
      "explanation": "'Gakkou e ikimasu' berarti 'Saya pergi ke sekolah'."
    }
  ]
}`;

    const rawContent = await generateGeminiContent(prompt);
    const formattedContent = formatQuizContent(rawContent);

    res.json({
      success: true,
      content: formattedContent,
      topic: topic,
    });
  } catch (error) {
    console.error("Error generating quiz:", error);
    res.status(500).json({ error: "Failed to generate quiz content" });
  }
});
// Fungsi untuk generate konten Gemini

app.post("/api/generateconversation", authenticateUser, async (req, res) => {
  try {
    const { topic, userInput, conversationType, conversationHistory } = req.body;

    // Validasi input
    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    let prompt = "";
    
    // Buat prompt berdasarkan tipe conversation
  switch (topic.toLowerCase()) {
  case "jikoushokai":
    if (conversationType === "start") {
      prompt = `Kamu adalah suzuki sensei. Mulailah percakapan perkenalan diri (jikoushokai) secara alami dalam bahasa Jepang. 
Sapa dia dan mintalah dia untuk memperkenalkan diri. Balas HANYA dalam bahasa Jepang seperti penutur asli.
Gunakan bahasa Jepang tingkat pemula hingga menengah. Maksimal 2-3 kalimat.
Respon kamu harus berupa teks bahasa Jepang murni saja – tanpa penjelasan, tanpa romaji, tanpa bahasa lain dan tanpa emoji.

Contoh format respons: こんにちは！自己紹介させていただきませんか？まず、お名前は何ですか？`;
    } else {
      prompt = `Kamu adalah suzuki sensei bahasa Jepang yang sedang berlatih jikoushokai (perkenalan diri).

Riwayat percakapan:
${conversationHistory || ""}

Murid berkata: "${userInput}"

Balas secara alami dalam bahasa Jepang seperti seorang sensei. Tanyakan pertanyaan lanjutan, seperti 何歳ですか？何が好きですか？どうして日本語を勉強しますか？ 
berikan komentar positif, atau minta detail lebih lanjut. Gunakan bahasa Jepang tingkat pemula-menengah.
Maksimal 2-3 kalimat. Balas HANYA dengan teks bahasa Jepang murni – tanpa bahasa lain. dan tanpa emoji`;
    }
    break;

  case "yasumi":
    if (conversationType === "start") {
      prompt = `Kamu adalah suzuki sensei bahasa Jepang. Mulailah percakapan alami tentang yasumi (liburan) dalam bahasa Jepang.
Tanyakan tentang rencana liburan mereka atau pengalaman liburan terbaru. Balas HANYA dalam bahasa Jepang seperti penutur asli.
Gunakan bahasa Jepang tingkat pemula hingga menengah. Maksimal 2-3 kalimat.
Respon kamu harus berupa teks bahasa Jepang murni saja – tanpa penjelasan, tanpa romaji, tanpa bahasa lain, tanpa emoji!

Contoh format respons: 今度の休みはどこに行きますか？何か楽しい予定がありますか？`;
    } else {
      prompt = `Kamu adalah suzuki sensei bahasa Jepang yang sedang berlatih percakapan yasumi (liburan).

Riwayat percakapan:
${conversationHistory || ""}

Murid berkata: "${userInput}"

Balas secara alami dalam bahasa Jepang tentang liburan. Tanyakan pertanyaan lanjutan, bagikan pengalaman,
atau beri komentar tentang tempat/kegiatan. Gunakan bahasa Jepang tingkat pemula-menengah.
Maksimal 2-3 kalimat. Balas HANYA dengan teks bahasa Jepang murni – tanpa bahasa lain. dan tanpa emoji`;
    }
    break;

  case "ryoukou":
    if (conversationType === "start") {
      prompt = `Kamu adalah suzuki sensei bahasa Jepang. Mulailah percakapan alami tentang ryoukou (perjalanan) dalam bahasa Jepang.
Tanyakan tentang tempat yang ingin mereka kunjungi atau pengalaman perjalanan mereka. Balas HANYA dalam bahasa Jepang seperti penutur asli.
Gunakan bahasa Jepang tingkat pemula hingga menengah. Maksimal 2-3 kalimat.
Respon kamu harus berupa teks bahasa Jepang murni saja – tanpa penjelasan, tanpa romaji, tanpa bahasa lain dan tanpa emoji.

Contoh format respons: どこか旅行に行きたい場所がありますか？今まで一番良かった旅行先はどこですか？`;
    } else {
      prompt = `Kamu adalah suzuki sensei bahasa Jepang yang sedang berlatih percakapan ryoukou (perjalanan).

Riwayat percakapan:
${conversationHistory || ""}

Murid berkata: "${userInput}"

Balas secara alami dalam bahasa Jepang tentang perjalanan. Berikan rekomendasi, tanyakan pengalaman perjalanan,
atau bagikan informasi menarik. Gunakan bahasa Jepang tingkat pemula-menengah.
Maksimal 2-3 kalimat. Balas HANYA dengan teks bahasa Jepang murni – tanpa bahasa lain. dan tanpa emoji`;
    }
    break;

  default:
    return res.status(400).json({ error: "Topik percakapan tidak didukung" });
}


    // Generate respons dari Gemini
    const geminiResponse = await generateGeminiContent(prompt);

    // Simpan progress conversation
    if (req.user && req.user.uid) {
      try {
        const conversationRef = db.ref(`users/${req.user.uid}/conversations/${topic}`);
        const conversationData = {
          lastPractice: admin.database.ServerValue.TIMESTAMP,
          totalSessions: admin.database.ServerValue.increment(1),
          topic: topic
        };
        
        await conversationRef.update(conversationData);
      } catch (saveError) {
        console.error("Error saving conversation progress:", saveError);
        // Tidak perlu return error, karena ini bukan critical failure
      }
    }

    res.json({
      success: true,
      response: geminiResponse,
      topic: topic,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Generate conversation error:", error);
    res.status(500).json({ 
      error: "Failed to generate conversation",
      details: error.message 
    });
  }
});

// Endpoint untuk save conversation 
app.post("/api/conversation/progress", authenticateUser, async (req, res) => {
  try {
    const { topic, duration, completed } = req.body;

    if (!topic || !duration) {
      return res.status(400).json({ error: "Topic and duration are required" });
    }

    const progressRef = db.ref(`users/${req.user.uid}/progress/conversation_${topic}`);
    const snapshot = await progressRef.once("value");
    const currentProgress = snapshot.val() || {};

    const updateData = {
      totalStudyTime: (currentProgress.totalStudyTime || 0) + duration,
      totalSessions: (currentProgress.totalSessions || 0) + 1,
      lastStudy: admin.database.ServerValue.TIMESTAMP,
      topic: topic
    };

    if (completed) {
      updateData.completed = true;
      updateData.completedAt = admin.database.ServerValue.TIMESTAMP;
    }

    await progressRef.update(updateData);

    res.json({
      success: true,
      message: "Conversation progress saved successfully",
      progress: updateData
    });

  } catch (error) {
    console.error("Error saving conversation progress:", error);
    res.status(500).json({ error: "Failed to save conversation progress" });
  }
});
// GET progress conversation list
app.get("/api/conversation/progress", authenticateUser, async (req, res) => {
  try {
    const ref = db.ref(`users/${req.user.uid}/progress`);
    const snapshot = await ref.once("value");
    const data = snapshot.val() || {};
    
    // Hanya ambil yang berawalan conversation_
    const filtered = {};
    Object.keys(data).forEach(key => {
      if (key.startsWith("conversation_")) {
        filtered[key] = data[key];
      }
    });

    res.json(filtered);
  } catch (error) {
    console.error("Error getting conversation progress:", error);
    res.status(500).json({ error: "Failed to get conversation progress" });
  }
});

//ENDPOINT SAVE PROGRESS USER
app.get("/api/progress/:type", authenticateUser, async (req, res, next) => {
  try {
    const { type } = req.params;

    // Validasi ini PENTING. Jika parameternya bukan 'hiragana' atau 'katakana',
    // kita akan lanjut ke route berikutnya (yaitu /:uid).
    if (type !== "hiragana" && type !== "katakana" && type !== "kanji") {
      return next();
    }

    const userRef = db.ref(`users/${req.user.uid}/progress/${type}`);
    const snapshot = await userRef.once("value");

    const progress = snapshot.val() || {
      currentLevel: 1,
      totalQuizzes: 0,
      totalScore: 0,
      averageScore: 0,
      flashcardsStudied: 0,
    };

    res.json({
      success: true,
      progress: progress,
    });
  } catch (error) {
    console.error("Flashcard Progress fetch error:", error);
    res.status(500).json({ error: "Failed to fetch flashcard progress" });
  }
});
// Rute ini akan menangani /api/progress/USER_ID_ANDA
app.get("/api/progress/:uid", authenticateUser, async (req, res) => {
  try {
    const { uid } = req.params;

    // Verify session
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return res.status(401).json({ error: "No session found" });
    }

    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie);
    if (decodedClaims.uid !== uid) {
      return res.status(403).json({ error: "Access denied" });
    }

    const snapshot = await admin.database().ref(`users/${uid}/progress`).once("value");
    const progress = snapshot.val() || {};

    res.json({
      success: true,
      progress: progress,
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

// 3. Endpoint untuk UPDATE PROGRESS ROADMAP CORE POINT PROGRESS
app.post("/api/progress/:uid", authenticateUser, async (req, res) => {
  try {
    const { uid } = req.params;
    const { topic, studyTime, completed } = req.body;

    // Verify session
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return res.status(401).json({ error: "No session found" });
    }

    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie);
    if (decodedClaims.uid !== uid) {
      return res.status(403).json({ error: "Access denied" });
    }

    const progressRef = admin.database().ref(`users/${uid}/progress/${topic}`);
    const snapshot = await progressRef.once("value");
    const currentProgress = snapshot.val() || {};

    const updateData = {
      totalStudyTime: (currentProgress.totalStudyTime || 0) + (studyTime || 0),
      lastStudy: admin.database.ServerValue.TIMESTAMP,
    };

    if (completed) {
      updateData.completed = true;
      updateData.completedAt = admin.database.ServerValue.TIMESTAMP;
    }

    await progressRef.update(updateData);

    res.json({
      success: true,
      message: "Progress updated successfully",
    });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

// ===================================================================
// --- FLASHCARD ROUTES ---
// ===================================================================
const hiraganaLevels = {
  1: ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ"],
  2: ["さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と"],
  3: ["な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ"],
  4: ["ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り"],
  5: ["る", "れ", "ろ", "わ", "を", "ん", "が", "ぎ", "ぐ", "げ"],
  6: ["ご", "ざ", "じ", "ず", "ぜ", "ぞ", "だ", "ぢ", "づ", "で"],
  7: ["ど", "ば", "び", "ぶ", "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぺ"],
  8: ["ぽ", "きゃ", "きゅ", "きょ", "しゃ", "しゅ", "しょ", "ちゃ", "ちゅ", "ちょ"],
  9: ["にゃ", "にゅ", "にょ", "ひゃ", "ひゅ", "ひょ", "みゃ", "みゅ", "みょ", "りゃ"],
  10: ["りゅ", "りょ", "ぎゃ", "ぎゅ", "ぎょ", "じゃ", "じゅ", "じょ", "びゃ", "びゅ"],
  11: ["びょ", "ぴゃ", "ぴゅ", "ぴょ"],
};
const katakanaLevels = {
  1: ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"],
  2: ["サ", "シ", "ス", "セ", "ソ", "タ", "チ", "ツ", "テ", "ト"],
  3: ["ナ", "ニ", "ヌ", "ネ", "ノ", "ハ", "ヒ", "フ", "ヘ", "ホ"],
  4: ["マ", "ミ", "ム", "メ", "モ", "ヤ", "ユ", "ヨ", "ラ", "リ"],
  5: ["ル", "レ", "ロ", "ワ", "ヲ", "ン", "ガ", "ギ", "グ", "ゲ"],
  6: ["ゴ", "ザ", "ジ", "ズ", "ゼ", "ゾ", "ダ", "ヂ", "ヅ", "デ"],
  7: ["ド", "バ", "ビ", "ブ", "ベ", "ボ", "パ", "ピ", "プ", "ペ"],
  8: ["ポ", "キャ", "キュ", "キョ", "シャ", "シュ", "ショ", "チャ", "チュ", "チョ"],
  9: ["ニャ", "ニュ", "ニョ", "ヒャ", "ヒュ", "ヒョ", "ミャ", "ミュ", "ミョ", "リャ"],
  10: ["リュ", "リョ", "ギャ", "ギュ", "ギョ", "ジャ", "ジュ", "ジョ", "ビャ", "ビュ"],
  11: ["ビョ", "ピャ", "ピュ", "ピョ"],
};
const kanjiLevels = {
  1: ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"], // Angka 1–10
  2: ["日", "月", "火", "水", "木", "金", "土", "人", "口", "年"], // Hari, Elemen, Waktu, Orang
  3: ["山", "川", "田", "石", "花", "雨", "空", "天", "気", "風"], // Alam & Cuaca
  4: ["東", "西", "南", "北", "左", "右", "上", "下", "中", "外"], // Arah & Posisi
  5: ["大", "小", "高", "安", "新", "古", "多", "少", "白", "赤"], // Ukuran, Sifat, Warna
};

app.post("/api/flashcards", authenticateUser, async (req, res) => {
  try {
    const { type, level } = req.body;
    const characterSet = type === "hiragana" ? hiraganaLevels[level] : katakanaLevels[level];
    if (!characterSet) {
      return res.status(400).json({ error: `Invalid level or type specified.` });
    }
    const prompt = `Generate a JSON array of flashcards for these specific Japanese ${type} characters: ${characterSet.join(
      ", "
    )}. Each object MUST be in this format: {"character": "...", "romaji": "..."}. Return ONLY the valid JSON array.`;
    const content = await generateGeminiContent(prompt);
    const flashcards = JSON.parse(content);

    const userProgressRef = db.ref(`users/${req.user.uid}/progress/${type}`);
    await userProgressRef.update({
      currentLevel: level,
      lastStudied: admin.database.ServerValue.TIMESTAMP,
      flashcardsStudied: admin.database.ServerValue.increment(flashcards.length),
    });

    res.json({ success: true, flashcards, type, level });
  } catch (error) {
    console.error("Flashcards generation error:", error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});
// TAMBAHKAN ENDPOINT BARU INI UNTUK KANJI
app.post("/api/kanji/flashcards", authenticateUser, async (req, res) => {
  try {
    const { level } = req.body;
    const characterSet = kanjiLevels[level];

    if (!characterSet) {
      return res.status(400).json({ error: `Level Kanji ${level} tidak ditemukan.` });
    }

    const prompt = `Generate a JSON array of flashcards for these specific Kanji: ${characterSet.join(", ")}.
        Each object in the array MUST follow this exact format:
        {
          "kanji": "...",
          "onyomi": "...",
          "kunyomi": "...",
          "romaji": "...",
          "meaning": "..."
        }
        Ensure the readings and meaning (in Bahasa Indonesia) are correct for each Kanji.
        Return ONLY the valid JSON array and nothing else.`;

    const content = await generateGeminiContent(prompt);
    const flashcards = JSON.parse(content);

    // Simpan progress ke database dengan tipe 'kanji'
    const userProgressRef = db.ref(`users/${req.user.uid}/progress/kanji`);
    await userProgressRef.update({
      currentLevel: level,
      lastStudied: admin.database.ServerValue.TIMESTAMP,
      flashcardsStudied: admin.database.ServerValue.increment(flashcards.length),
    });

    res.json({ success: true, flashcards });
  } catch (error) {
    console.error("Kanji Flashcards generation error:", error);
    res.status(500).json({ error: "Failed to generate Kanji flashcards" });
  }
});
app.post("/api/quiz", authenticateUser, async (req, res) => {
  try {
    const { type, flashcards } = req.body;
    const prompt = `Based on these ${type} flashcards: ${JSON.stringify(
      flashcards
    )}, create a 5-question quiz. Format as JSON: {"questions": [{"question": "What is the romaji for: あ?","options": ["a", "i", "u", "e"],"correctAnswer": 0,"character": "あ"}]}. Rules: Test recognition, 3 distractors, correctAnswer is index (0-3). Return only valid JSON.`;
    const content = await generateGeminiContent(prompt);
    const quiz = JSON.parse(content);
    res.json({ success: true, quiz });
  } catch (error) {
    console.error("Quiz generation error:", error);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
});

app.post("/api/quiz/result", authenticateUser, async (req, res) => {
  try {
    const { type, level, score, totalQuestions } = req.body;
    const percentage = Math.round((score / totalQuestions) * 100);

    const userRef = db.ref(`users/${req.user.uid}`);
    const quizRef = userRef.child(`progress/${type}/quizResults`).push();
    await quizRef.set({ level, score, totalQuestions, percentage, date: admin.database.ServerValue.TIMESTAMP });

    const progressRef = userRef.child(`progress/${type}`);
    const snapshot = await progressRef.once("value");
    const currentProgress = snapshot.val() || { currentLevel: 1 };

    const updateData = {
      totalQuizzes: (currentProgress.totalQuizzes || 0) + 1,
      totalScore: (currentProgress.totalScore || 0) + score,
      averageScore: Math.round(((currentProgress.totalScore || 0) + score) / ((currentProgress.totalQuizzes || 0) + 1)),
      lastQuizScore: score,
      lastQuizDate: admin.database.ServerValue.TIMESTAMP,
    };

    if (percentage >= 70) {
      updateData.currentLevel = Number(currentProgress.currentLevel || 1) + 1;
    }

    await progressRef.update(updateData);

    res.json({
      success: true,
      canAdvance: percentage >= 70,
      newLevel: updateData.currentLevel || currentProgress.currentLevel,
    });
  } catch (error) {
    console.error("Quiz result save error:", error);
    res.status(500).json({ error: "Failed to save quiz result" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error stack:", err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
