# GraphRAG

A document question-answering prototype that combines vector retrieval with a
NetworkX graph of text, tables, and images. A React interface lets you upload
PDF/DOCX files, explore document relationships, and ask questions with citations.

## How retrieval works

Docling extracts document elements. Sentence Transformers embeds them into ChromaDB.
The retriever expands vector-search seeds by two graph hops, reranks candidates
with a cross-encoder, and returns up to eight context blocks. Groq generates an
answer using those blocks. Image descriptions optionally use MLX on Apple Silicon.

Document-specific retrieval filters both vector seeds and graph neighbors by
`doc_id`. Global mode intentionally permits cross-document retrieval. This is
retrieval scoping, not user authorization: the API still uses shared in-process
state and needs an access-control review before multi-user deployment.

Image-analysis failures return `Image description unavailable.` rather than
inventing chart values. Citation rendering is implemented; answer correctness
and citation support have not been measured on a representative benchmark.

## Run locally

The full backend needs Python, Node.js, local model memory, and a MongoDB instance.
The current requirements file is an environment snapshot, including Apple-specific
packages; it is not a verified cross-platform lockfile.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Set `GROQ_API_KEY` and `MONGO_URI` in your local environment or an ignored `.env`.
Run from `backend` so the existing `app` imports resolve:

```sh
cd backend
python -m uvicorn app.api:app --host 127.0.0.1 --port 8000 --reload
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open the URL Vite prints. The Vite configuration proxies `/api` to the backend.
Model downloads and external API calls are part of the full workflow.

## Lightweight regression tests

These tests exercise production retrieval and image-error handling using controlled
model/database doubles. They do not download weights or call external services.

```sh
python -m pip install pytest networkx python-dotenv
PYTHONPATH=backend python -m pytest backend/tests/unit -q
```

The GitHub workflow runs this suite independently of the heavyweight model stack.
The older scripts under `backend/tests` require model weights or services and are
not included in the lightweight suite. Unit passes do not establish end-to-end
PDF parsing, model quality, or live database/API integration.

## Useful next contributions

- Add a licensed document/query benchmark with relevance labels and retrieval metrics.
- Isolate state and authorization per user/session.
- Replace the broad dependency snapshot with tested platform-specific installation files.
- Verify citations against retrieved evidence and expose unsupported answers.

Small changes should include a reproducible failure, a regression test, and explicit
limits on what was verified. Preserve the existing API and document-element schema.
