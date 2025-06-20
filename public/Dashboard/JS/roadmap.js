      // Firebase Configuration
      const firebaseConfig = {
        apiKey: "AIzaSyDpyrC1-1xl6pyCLKBd4mZbW93K1F95FJs",
        authDomain: "nihongo-journey.firebaseapp.com",
        projectId: "nihongo-journey",
        storageBucket: "nihongo-journey.firebasestorage.app",
        messagingSenderId: "966989016758",
        appId: "1:966989016758:web:25d43be34bbc1a1342c017",
        measurementId: "G-2J392RPFMR",
      };

      // Initialize Firebase
      firebase.initializeApp(firebaseConfig);
      const auth = firebase.auth();
      const database = firebase.database();

      let currentUser = null;
      let currentTopic = null;
      let studyStartTime = null;
      let studyTimer = null;

      // Auth State Observer
      auth.onAuthStateChanged((user) => {
        if (user) {
          currentUser = user;
          document.getElementById("userInfo").classList.remove("hidden");
          document.getElementById("userName").textContent = user.displayName || user.email;
          document.getElementById("progressOverview").classList.remove("hidden");
          loadUserProgress();
        } else {
          currentUser = null;
          document.getElementById("userInfo").classList.add("hidden");
          document.getElementById("progressOverview").classList.add("hidden");
        }
      });

      // Sign Out Function
      async function signOut() {
        try {
          await auth.signOut();
          // Clear session cookie di server
          await fetch("/api/auth/signout", { method: "POST" });
          // Arahkan ke halaman utama
          window.location.href = "/";
        } catch (error) {
          console.error("Sign-out error:", error);
        }
      }

      // Load User Progress
      async function loadUserProgress() {
        if (!currentUser) return;

        try {
          const snapshot = await database.ref(`users/${currentUser.uid}/progress`).once("value");
          const progress = snapshot.val() || {};

          const topics = ["introduction", "family", "greetings", "numbers", "birthday", "invitation", "skills", "rent-bike", "konbini", "flavour"];
          let completedLessons = 0;

          topics.forEach((topic) => {
            const node = document.querySelector(`[data-topic="${topic}"]`);
            if (progress[topic] && progress[topic].completed) {
              node.classList.add("completed");
              completedLessons++;
            }
          });

          const totalLessons = topics.length;
          const progressPercentage = (completedLessons / totalLessons) * 100;

          document.getElementById("progressBar").style.width = `${progressPercentage}%`;
          document.getElementById("progressText").textContent = `${Math.round(progressPercentage)}%`;
          document.getElementById("completedLessons").textContent = completedLessons;
          document.getElementById("totalLessons").textContent = totalLessons;
        } catch (error) {
          console.error("Error loading progress:", error);
        }
      }

      // Open Learning Modal
      async function openLearningModal(topic) {
        if (!currentUser) {
          alert("Silakan masuk terlebih dahulu untuk mengakses pembelajaran.");
          return;
        }

        currentTopic = topic;
        document.getElementById("learningModal").classList.remove("hidden");
        document.getElementById("modalTitle").textContent = topic.charAt(0).toUpperCase() + topic.slice(1);
        document.getElementById("loadingContent").classList.remove("hidden");
        document.getElementById("modalContent").classList.add("hidden");
        document.getElementById("quizBtn").classList.add("hidden");

        // Start study timer
        studyStartTime = Date.now();
        studyTimer = setInterval(updateStudyTime, 1000);

        try {
          const response = await fetch("/api/generate-lesson", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ topic }),
          });

          if (response.ok) {
            const data = await response.json();
            document.getElementById("loadingContent").classList.add("hidden");
            document.getElementById("modalContent").classList.remove("hidden");
            document.getElementById("modalContent").innerHTML = data.content;
            document.getElementById("quizBtn").classList.remove("hidden");
          } else {
            throw new Error("Failed to generate lesson");
          }
        } catch (error) {
          console.error("Error loading lesson:", error);
          document.getElementById("loadingContent").innerHTML = '<p class="text-red-500">Gagal memuat konten pembelajaran. Silakan coba lagi.</p>';
        }
      }

      // Update Study Time
      function updateStudyTime() {
        if (studyStartTime) {
          const elapsed = Math.floor((Date.now() - studyStartTime) / 60000);
          document.getElementById("studyTime").textContent = elapsed;
        }
      }

      // Close Modal
      function closeModal() {
        document.getElementById("learningModal").classList.add("hidden");
        if (studyTimer) {
          clearInterval(studyTimer);
          studyTimer = null;
        }

        // Save study progress
        if (currentUser && currentTopic && studyStartTime) {
          const studyDuration = Math.floor((Date.now() - studyStartTime) / 60000);
          if (studyDuration > 0) {
            saveStudyProgress(currentTopic, studyDuration);
          }
        }
      }
function updateUserProfile(userProfile) {
    try {
        // Update user photo
        const userPhoto = document.getElementById('userPhoto');
        if (userPhoto && userProfile.picture) {
            userPhoto.src = userProfile.picture;
            userPhoto.alt = userProfile.name || 'User Photo';
        }
        const displayName  = document.getElementById('displayName');
        if (displayName) {
           displayName.textContent =  userProfile.name || 'New User';
        }
        // Update user name
        const userName = document.getElementById('userName');
        if (userName) {
            userName.textContent = userProfile.name || userProfile.email?.split('@')[0] || 'User';
        }
        
        console.log('User profile updated successfully');
        
    } catch (error) {
        console.error('Error updating user profile:', error);
    }
}

      // Save Study Progress
      async function saveStudyProgress(topic, duration) {
        try {
          const progressRef = database.ref(`users/${currentUser.uid}/progress/${topic}`);
          const snapshot = await progressRef.once("value");
          const currentProgress = snapshot.val() || {};

          await progressRef.update({
            totalStudyTime: (currentProgress.totalStudyTime || 0) + duration,
            lastStudy: Date.now(),
          });
        } catch (error) {
          console.error("Error saving progress:", error);
        }
      }

      // Start Quiz
      async function startQuiz() {
        document.getElementById("quizModal").classList.remove("hidden");
        document.getElementById("quizTitle").textContent = `Quiz: ${currentTopic.charAt(0).toUpperCase() + currentTopic.slice(1)}`;
        document.getElementById("quizLoadingContent").classList.remove("hidden");
        document.getElementById("quizContent").classList.add("hidden");

        try {
          const response = await fetch("/api/generate-quiz", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ topic: currentTopic }),
          });

          if (response.ok) {
            const data = await response.json();
            document.getElementById("quizLoadingContent").classList.add("hidden");
            document.getElementById("quizContent").classList.remove("hidden");
            document.getElementById("quizContent").innerHTML = data.content;
          } else {
            throw new Error("Failed to generate quiz");
          }
        } catch (error) {
          console.error("Error loading quiz:", error);
          document.getElementById("quizLoadingContent").innerHTML = '<p class="text-red-500">Gagal memuat quiz. Silakan coba lagi.</p>';
        }
      }

      // Close Quiz Modal
      function closeQuizModal() {
        document.getElementById("quizModal").classList.add("hidden");
      }
      function submitQuiz() {
        const questions = document.querySelectorAll(".question-block");
        let score = 0;
        let totalQuestions = questions.length;

        questions.forEach((questionBlock, index) => {
          const selectedOption = questionBlock.querySelector('input[type="radio"]:checked');
          const feedback = questionBlock.querySelector(".answer-feedback");
          const correctAnswer = feedback.getAttribute("data-correct");

          if (selectedOption) {
            const isCorrect = selectedOption.value === correctAnswer;

            if (isCorrect) {
              score++;
              feedback.querySelector(".correct-feedback").style.display = "block";
              feedback.querySelector(".incorrect-feedback").style.display = "none";
              feedback.classList.remove("hidden");
              feedback.classList.add("bg-green-50");
            } else {
              feedback.querySelector(".correct-feedback").style.display = "none";
              feedback.querySelector(".incorrect-feedback").style.display = "block";
              feedback.classList.remove("hidden");
              feedback.classList.add("bg-red-50");
            }
          } else {
            feedback.querySelector(".correct-feedback").style.display = "none";
            feedback.querySelector(".incorrect-feedback").style.display = "block";
            feedback.classList.remove("hidden");
            feedback.classList.add("bg-red-50");
          }

          // Disable all options for this question
          questionBlock.querySelectorAll('input[type="radio"]').forEach((input) => {
            input.disabled = true;
          });
        });

        // Show score
        const scoreElement = document.getElementById("quizScore");
        scoreElement.querySelector("span").textContent = score;
        scoreElement.classList.remove("hidden");

        // Hide submit button
        event.target.style.display = "none";

        // Save quiz result and mark lesson as completed if score is good
        const percentage = (score / totalQuestions) * 100;
        if (percentage >= 70) {
          // Mark lesson as completed
          if (typeof markLessonCompleted === "function" && currentTopic) {
            markLessonCompleted(currentTopic);
          }

          setTimeout(() => {
            alert("Selamat! Anda telah menyelesaikan quiz dengan baik. Pelajaran ini telah ditandai sebagai selesai.");
          }, 1000);
        }
      }
      // Mark Lesson as Completed
      async function markLessonCompleted(topic) {
        if (!currentUser) return;

        try {
          await database.ref(`users/${currentUser.uid}/progress/${topic}`).update({
            completed: true,
            completedAt: Date.now(),
          });
          loadUserProgress();
        } catch (error) {
          console.error("Error marking lesson as completed:", error);
        }
      }

      // Add click listeners to roadmap nodes
      document.querySelectorAll(".roadmap-node").forEach((node) => {
        node.addEventListener("click", () => {
          const topic = node.getAttribute("data-topic");
          openLearningModal(topic);
        });
      });

      // Add CSS for completed lessons
      const style = document.createElement("style");
style.textContent = `
  .roadmap-node.completed > div:first-child {
    position: relative;
    background: linear-gradient(135deg, #a855f7, #6366f1);
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
    border-radius: 9999px;
    color: white;
    padding: 0.75rem 3.5rem 0.75rem 1.5rem; /* ruang kanan utk icon */
    font-weight: 600;
    transition: all 0.3s ease-in-out;
    overflow: visible;
  }

  /* Check icon bulat */
  .roadmap-node.completed > div:first-child::after {
    content: '✔';
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1rem;
    background: white;
    color: #7c3aed;
    border-radius: 50%;
    width: 1.8rem;
    height: 1.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
    z-index: 1;
  }

  /* Jika ada badge (angka kuning) */
  .roadmap-node.completed .badge {
    position: absolute;
    top: -0.4rem;
    right: 2.4rem; /* geser dari check-icon */
    background: #facc15;
    color: black;
    font-size: 0.75rem;
    font-weight: bold;
    padding: 0.25rem 0.45rem;
    border-radius: 9999px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    z-index: 2;
  }

  /* Hover effect */
  .roadmap-node.completed > div:first-child:hover {
    background: linear-gradient(135deg, #9333ea, #4f46e5);
    transform: scale(1.03);
    cursor: pointer;
  }
`;
document.head.appendChild(style);

