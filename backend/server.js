require("dotenv").config();
const axios = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());

/* ---------------- FRONTEND ---------------- */

const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});



/* ---------------- UPLOAD FOLDER ---------------- */

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

/* ---------------- DATABASE ---------------- */

mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("Database connected"))
.catch(err => console.log("DB Connection Error:", err));

/* ---------------- SCHEMAS ---------------- */

const ResumeSchema = mongoose.Schema({
    name: String,
    age: Number,
    resumePath: String
});

const Resume = mongoose.model("Resume", ResumeSchema);

const QuestionSchema = mongoose.Schema({
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume" },
    question: String
});

const Question = mongoose.model("Question", QuestionSchema);

const AnswerSchema = mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    answer: String,
    score: Number,
    feedback: String
});

const Answer = mongoose.model("Answer", AnswerSchema);

/* ---------------- MULTER ---------------- */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

/* ---------------- AI QUESTION GENERATION ---------------- */

async function generateInterviewQuestions(resumeText) {

    try {

        console.log("API KEY:", process.env.OPENROUTER_API_KEY);

        const prompt = `
You are a technical interviewer.

Based on this resume generate 5 technical interview questions.

Resume:
${resumeText.substring(0,1500)}
`;

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "mistralai/mistral-7b-instruct",
                messages: [
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://ai-interview-simulator-kle4.onrender.com"
                }
            }
        );

        console.log("AI RESPONSE:", response.data);

        return response.data.choices[0].message.content;

    } catch (error) {

        console.log("AI ERROR:", error.response?.data || error.message);

        return "AI failed to generate questions";
    }
}

/* ---------------- UPLOAD RESUME ---------------- */

app.post("/upload", upload.single("resume"), async (req, res) => {

    try {

        if (!req.file) {
            return res.json({ message: "No file uploaded" });
        }

        const filepath = req.file.path;

        const fileBuffer = fs.readFileSync(filepath);
        const data = await pdf(fileBuffer);

        const resumeText = data.text.substring(0,1500);

        const questions = await generateInterviewQuestions(resumeText);

        console.log("AI RAW RESPONSE:", questions);

        const newResume = new Resume({
            name: req.body.name,
            age: req.body.age,
            resumePath: filepath
        });

        await newResume.save();

        const questionsArray = questions
            .split("\n")
            .filter(q => q.trim() !== "");

        const questionIds = [];

        for (const q of questionsArray) {

            const newQuestion = new Question({
                resumeId: newResume._id,
                question: q
            });

            await newQuestion.save();

            questionIds.push(newQuestion._id);
        }

        res.json({
            message: "Upload successful",
            interview_questions: questionsArray,
            questionIds
        });

    } catch (error) {

        console.log("ERROR:", error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

/* ---------------- SUBMIT ANSWER ---------------- */

app.post("/submit-answer", async (req, res) => {

    try {

        const { questionId, answer } = req.body;

        if (!questionId || !answer) {

            return res.status(400).json({
                message: "Question ID and answer required"
            });
        }

        const newAnswer = new Answer({
            questionId,
            answer
        });

        await newAnswer.save();

        res.json({
            message: "Answer submitted",
            answerId: newAnswer._id
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

/* ---------------- EVALUATE ANSWER ---------------- */

app.post("/evaluate-answer", async (req, res) => {

    try {

        const { answerId } = req.body;

        const answerData = await Answer
            .findById(answerId)
            .populate("questionId");

        if (!answerData) {

            return res.status(404).json({
                message: "Answer not found"
            });
        }

        const prompt = `
Evaluate this interview answer.

Question: ${answerData.questionId.question}

Answer: ${answerData.answer}

Respond ONLY in JSON format like this:

{
 "score": number between 1 and 10,
 "feedback": "brief feedback"
}
`;

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "google/gemini-2.0-flash-exp",
                messages: [
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://ai-interview-simulator-kle4.onrender.com"
                }
            }
        );

        let evalText = response.data.choices[0].message.content;

        let score = 0;
        let feedback = "No feedback";

        try {

            const parsed = JSON.parse(evalText);

            score = parsed.score;
            feedback = parsed.feedback;

        } catch {

            console.log("AI JSON parsing failed");
        }

        answerData.score = score;
        answerData.feedback = feedback;

        await answerData.save();

        res.json({
            message: "Evaluation done",
            score,
            feedback
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});