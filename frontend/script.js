async function uploadResume() {
  const name = document.getElementById("name").value;
  const age = document.getElementById("age").value;
  const file = document.getElementById("resumeFile").files[0];

  if (!name || !age || !file) {
    alert("Please fill all fields and upload a resume!");
    return;
  }

  const formData = new FormData();
  formData.append("resume", file);
  formData.append("name", name);
  formData.append("age", age);

  try {
    const res = await fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!data.interview_questions || data.interview_questions.length === 0) {
      alert("No questions returned from AI.");
      return;
    }

    showQuestions(data.interview_questions, data.questionIds);

  } catch (err) {
    console.error(err);
    alert("Error uploading resume. Check backend console.");
  }
}

function showQuestions(questions, questionIds) {
  const container = document.getElementById("questions-section");
  container.innerHTML = "<h2>2. Answer Questions</h2>";

  questions.forEach((q, i) => {
    container.innerHTML += `
      <div class="question">
        <p>${i + 1}. ${q}</p>
        <textarea id="answer${i}" placeholder="Write your answer here"></textarea><br>
        <button onclick="submitAnswer('${questionIds[i]}', ${i})">Submit Answer</button>
        <div id="feedback${i}" class="feedback"></div>
      </div>
    `;
  });
}

async function submitAnswer(questionId, index) {
  const answer = document.getElementById(`answer${index}`).value;
  if (!answer) {
    alert("Please write your answer!");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, answer })
    });
    const data = await res.json();
    const answerId = data.answerId;

    const evalRes = await fetch("http://localhost:3000/evaluate-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId })
    });
    const evalData = await evalRes.json();

    document.getElementById(`feedback${index}`).innerText = 
      `Score: ${evalData.score}, Feedback: ${evalData.feedback}`;

  } catch (err) {
    console.error(err);
    alert("Error submitting answer. Check backend console.");
  }
}