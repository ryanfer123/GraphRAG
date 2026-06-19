# Graph-Augmented RAG

A powerful, multimodal Graph-Augmented Retrieval-Augmented Generation (RAG) system. This application parses complex documents (including images and tables), builds an interactive knowledge graph, and uses a Vision-Language Model (Groq) to provide highly accurate, visually-cited answers.

## Architecture
- **Backend:** Python (FastAPI), PyTorch, ChromaDB, Unstructured.io, NetworkX
- **Frontend:** React, Vite, ReactFlow
- **Database:** MongoDB
- **LLM:** Groq API

---

## 🚀 Setup Guide (For Local Development)

Because this application runs heavy Machine Learning embedding models (PyTorch, SentenceTransformers), it requires at least **2GB to 4GB of RAM** to run smoothly. It is highly recommended to run the backend locally rather than on free-tier cloud providers (which typically limit RAM to 512MB).

### 1. Prerequisites
You will need the following installed on your machine:
- **Python 3.9+**
- **Node.js 18+**
- **Git**

You will also need two API keys:
1. **Groq API Key:** For the lightning-fast LLM inference.
2. **MongoDB URI:** For storing the GraphRAG document state and chat history.

### 2. Backend Setup
The backend handles the ML inference, document parsing, and database logic.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ryanfer123/GraphRAG.git
   cd GraphRAG
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
   ```

3. **Install the required Python dependencies:**
   *Note: This will download PyTorch and may take a few minutes depending on your internet connection.*
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure your Environment Variables:**
   Create a new file named `.env` in the root directory of the project and add your keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   MONGO_URI=your_mongodb_connection_string_here
   ```

5. **Start the Python Backend:**
   ```bash
   python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload --env-file .env
   ```
   *The API will now be running at `http://127.0.0.1:8000`.*

---

### 3. Frontend Setup
The frontend is a Vite-powered React application with interactive ReactFlow graphs.

1. **Open a new terminal tab** and navigate to the frontend directory:
   ```bash
   cd Mutli-Modal-Context-Aware-RAG/frontend
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Access the Application:**
   Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5180`). 

---

## 🛠️ Usage
1. **Sign Up / Login:** Create an account on the local dashboard.
2. **Upload a Document:** Navigate to the Dashboard and upload a PDF or DOCX. The backend will parse the text, tables, and images, embed them into ChromaDB, and build a NetworkX knowledge graph.
3. **Explore the Graph:** Click on the generated nodes in the right-hand panel to see semantic relationships and entity extraction.
4. **Chat:** Ask questions about the document. The system will retrieve the most relevant semantic chunks and graph edges, and the LLM will generate an answer with inline citations (e.g., `(Fig. 1)` or `(Page 3)`).

---

## 🌟 Hackathon Stretch Goals Achieved

This project successfully implements all the bonus features requested in the hackathon problem statement:

1. **Agentic Reasoning & Adversarial Robustness:**
   - **Query Decomposition:** Complex, multi-hop user questions (e.g. "Compare revenue in Q1 and Q2") are automatically broken down into atomic sub-queries and routed to Groq (`llama-3.3-70b-versatile`) for highly targeted semantic retrieval.
   - **Robust System Prompt:** The LLM is explicitly instructed to avoid hallucinations and confidently state when a question is unanswerable based on the provided document context, successfully handling "trick" questions.

2. **Cross-Document QA (Global Knowledge Base):**
   - The system maintains a unified ChromaDB collection (`global_collection`) and a global NetworkX graph (`global_graph`).
   - The UI's Sidebar features a "Global Knowledge Base" mode. Selecting it allows users to search across *all* uploaded documents simultaneously!

3. **Explainability Mode:**
   - The LLM generates inline citations for every factual claim.
   - The ChatPanel includes a collapsible "Sources Used" accordion. Clicking this expands a list of `SourceCard` components displaying the exact snippet, type (paragraph/table/image), and page number where the information was sourced.

4. **Real-Time Ingestion (Streaming):**
   - The `/api/upload` endpoint defers the heavy ingestion workload (MLX embedding and Unstructured layout extraction) to FastAPI `BackgroundTasks`.
   - A Server-Sent Events (SSE) `/api/upload/stream/{doc_id}` endpoint broadcasts ingestion progress to the frontend.
   - `UploadCard.jsx` listens to the SSE stream and renders an animated progress bar, giving the user real-time feedback on extraction, graph building, and summarization phases.
