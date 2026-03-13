require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();

app.use(express.json());
app.use(cors());

// serve frontend static files

const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

// creating upload folde if it dosent exit

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// connection to database

mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("Database connected"))
.catch(err => console.log("DB Connection Error:", err));

// setup models
const ResumeSchema = new mongoose.Schema({ name: String, age: Number, resumePath: String });
const Resume = mongoose.model("Resume", ResumeSchema);

const QuestionSchema = new mongoose.Schema({
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume" },
    question: String
});
const Question = mongoose.model("Question", QuestionSchema);

const AnswerSchema = new mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    answer: String,
    score: Number,
    feedback: String
});
const Answer = mongoose.model("Answer", AnswerSchema);

// multer part

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// AI question generate function

async function generateInterviewQuestions(resumeText) {
    try {
        const prompt = `You are a technical interviewer. Based on this resume generate exactly 5 technical interview questions. Return ONLY the questions separated by new lines.
Resume:
${resumeText.substring(0,1500)}`;

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "meta-llama/llama-3-8b-instruct",
                messages: [{ role: "user", content: prompt }]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://ai-interview-simulator.up.railway.app",
                    "X-Title": "Interview Simulator"
                },
                timeout: 15000 // Failsafe: stops waiting after 15 seconds
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.log("🚨 AI QUESTION ERROR:", error.response?.data || error.message);
        // THE FALLBACK: NEVER FAIL ON THE FRONTEND AGAIN
        return `Explain your experience with the technologies listed in your resume?
What was the most challenging technical problem you solved in your projects?
How do you approach debugging and troubleshooting complex code issues?
Describe your experience with databases and backend APIs?
How do you ensure your code is optimized for performance?`;
    }
}

// resume upload

app.post("/upload", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) return res.json({ message: "No file uploaded" });

        const filepath = req.file.path;
        const data = await pdf(fs.readFileSync(filepath));
        const resumeText = data.text.substring(0,1500);

        const questionsText = await generateInterviewQuestions(resumeText);

        const newResume = new Resume({
            name: req.body.name,
            age: req.body.age,
            resumePath: filepath
        });
        await newResume.save();

        
        const questionsArray = questionsText
            .split("\n")
            .map(q => q.replace(/^[0-9.\-\s]+/, "").trim())
            .filter(q => q.length > 10 && q.includes("?"))
            .slice(0, 5);

        const questionIds = [];
        for (const q of questionsArray) {
            const newQuestion = new Question({ resumeId: newResume._id, question: q });
            await newQuestion.save();
            questionIds.push(newQuestion._id);
        }

        res.json({ message: "Upload successful", interview_questions: questionsArray, questionIds });

    } catch (error) {
        console.log("UPLOAD ERROR:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// answer submit

app.post("/submit-answer", async (req, res) => {
    try {
        const { questionId, answer } = req.body;
        if (!questionId || !answer) return res.status(400).json({ message: "Question ID and answer required" });

        const newAnswer = new Answer({ questionId, answer });
        await newAnswer.save();

        res.json({ message: "Answer submitted", answerId: newAnswer._id });
    } catch (error) {
        console.log("ANSWER ERROR:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// evaluate answer


app.post("/evaluate-answer", async (req, res) => {
    try {
        const { answerId } = req.body;
        const answerData = await Answer.findById(answerId).populate("questionId");
        if (!answerData) return res.status(404).json({ message: "Answer not found" });

        const prompt = `You are an interview evaluator. Evaluate the answer from 1 to 10. Return ONLY valid JSON. No explanation. Example: {"score":7,"feedback":"Good answer but missing technical depth"}
Question: ${answerData.questionId.question}
Answer: ${answerData.answer}`;

        // Default fallback values if AI completely dies

        let finalScore = 7;
        let finalFeedback = "Answer submitted successfully. AI evaluation took too long, but your response is saved.";

        try {
            const response = await axios.post(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    model: "meta-llama/llama-3-8b-instruct",
                    messages: [{ role: "user", content: prompt }]
                },
                {
                    headers: {
                        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://ai-interview-simulator.up.railway.app"
                    },
                    timeout: 2000 // Shorter timeout so you don't wait forever
                }
            );

            const evalText = response.data.choices[0]?.message?.content;
            if (evalText) {
                const cleaned = evalText.replace(/```json/g, "").replace(/```/g, "").trim();
                const parsed = JSON.parse(cleaned);
                finalScore = parsed.score || 7;
                finalFeedback = parsed.feedback || finalFeedback;
            }
        } catch (aiError) {
            console.log("🚨 AI EVALUATION API CRASHED:", aiError.message);
           
        }

        
        answerData.score = finalScore;
        answerData.feedback = finalFeedback;
        await answerData.save();

        res.json({ message: "Evaluation done", score: finalScore, feedback: finalFeedback });

    } catch (error) {
        console.log("🚨 CRITICAL SERVER ERROR IN EVALUATION:", error);
        res.json({ message: "Emergency fallback", score: 7, feedback: "System overloaded, but recorded your answer." });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));