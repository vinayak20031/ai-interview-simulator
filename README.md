# 🚀 AI Interview Simulator

**Live Demo:** [Click here to test the live app!](https://ai-interview-simulator-1-bi89.onrender.com)

> **Note:** This application is hosted on a free tier. If the site has been inactive, it may take **30-45 seconds** to "wake up" and load the initial page. Thank you for your patience!

An intelligent, full-stack web application designed to help candidates prepare for technical interviews. The platform parses user resumes, generates highly tailored interview questions using Large Language Models (LLMs), and evaluates user responses with real-time feedback and scoring.

## 🌟 Features

* **Dynamic Resume Parsing:** Upload a PDF resume, and the system instantly extracts the text to understand your specific skill set and project history.
* **AI Question Generation:** Integrates with the OpenRouter API (Meta Llama-3 8B) to generate 5 targeted, role-specific technical interview questions.
* **Real-Time AI Evaluation:** Submits user answers to the AI for grading on a scale of 1-10, providing actionable, constructive feedback.
* **Production-Ready Fault Tolerance:** Engineered with robust error-handling and fallback mechanisms. If third-party AI APIs time out or fail, the system automatically provides backup questions and gracefully records answers without breaking the UI.
* **Cloud Database:** Stores resumes, generated questions, and user answers securely in MongoDB Atlas.

## 🛠 Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** MongoDB Atlas, Mongoose
* **AI Integration:** OpenRouter API (`meta-llama/llama-3-8b-instruct`)
* **File Handling:** Multer, `pdf-parse`
* **Deployment:** Render (Backend hosting & CI/CD)

## 💻 Run it Locally

Want to run this project on your own machine? Follow these steps:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/vinayak20031/ai-interview-simulator.git](https://github.com/vinayak20031/ai-interview-simulator.git)
   cd ai-interview-simulator/backend