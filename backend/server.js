
require("dotenv").config();
const axios = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("database is connected"))
  .catch(err => console.log(err));


const GHschema = mongoose.Schema({
    name: String,
    age: Number,
    resumePath: String
});
const vinu = mongoose.model("vinu", GHschema);


const QuestionSchema = mongoose.Schema({
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "vinu" },
    question: String
});
const Question = mongoose.model("question", QuestionSchema);


const AnswerSchema = mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "question" }, // FIXED: ObjectId + ref
    answer: String,
    score: Number,
    feedback: String
});
const Answer = mongoose.model("answer", AnswerSchema);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });


app.get("/", (req, res) => res.send("hello"));


async function generateInterviewQuestions(resumeText) {
    const prompt = `
You are a technical interviewer.
Based on this resume generate 5 technical interview questions.

Resume:
${resumeText.substring(0,1500)}
`;

    const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            model: "openai/gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data.choices[0].message.content;
}


app.post("/upload", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) return res.json("No file uploaded");

        const filepath = req.file.path;
        const fileBuffer = fs.readFileSync(filepath);
        const data = await pdf(fileBuffer);

        const resumetext = data.text.substring(0,1500);
        const questions = await generateInterviewQuestions(resumetext);

        const newResume = new vinu({
            name: req.body.name,
            age: req.body.age,
            resumePath: filepath
        });
        await newResume.save();

        
        const questionsArray = questions.split("\n").filter(q => q.trim() !== "");
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
            questionIds: questionIds
        });

    } catch (error) {
        console.log("ERROR OCCURRED:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


app.post("/submit-answer", async (req, res) => {
    try {
        const { questionId, answer } = req.body;
        if (!questionId || !answer) return res.status(400).json({ message: "Question ID and answer are required" });

        const newAnswer = new Answer({ questionId, answer });
        await newAnswer.save();

        res.json({ message: "Answer submitted successfully", answerId: newAnswer._id });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


app.post("/evaluate-answer", async (req, res) => {
    try {
        const { answerId } = req.body;

        
        const answerData = await Answer.findById(answerId).populate("questionId");
        if (!answerData) return res.status(404).json({ message: "Answer not found" });

        
        const prompt = `
Evaluate this interview answer.

Question: ${answerData.questionId.question}
Answer: ${answerData.answer}

Respond ONLY in JSON format like this:
{
  "score": <number between 1 and 10>,
  "feedback": "<brief feedback>"
}
`;
        console.log("AI Prompt:\n", prompt); // DEBUG

        // Call AI API
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const evalText = response.data.choices[0].message.content;


        let score = 0;
        let feedback = "No feedback";

        try {
            const evalJson = JSON.parse(evalText);
            score = evalJson.score;
            feedback = evalJson.feedback;
        } catch (err) {
            console.log("Failed to parse AI JSON response, using defaults.", err);
        }

      
        answerData.score = score;
        answerData.feedback = feedback;
        await answerData.save();

       
        res.json({ message: "Evaluation done", score, feedback });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

app.listen(3000, () => console.log("server is running"));