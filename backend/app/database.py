import os
import logging
import certifi
from pymongo import MongoClient

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI")

# We create the client only if the URI is set to prevent crashes in local-only mode
client = None
db = None
documents_collection = None
chat_history_collection = None
users_collection = None

if MONGO_URI:
    try:
        client = MongoClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=2000,
            tlsCAFile=certifi.where()
        )
        db = client.get_database("graphrag")
        documents_collection = db.get_collection("documents")
        chat_history_collection = db.get_collection("chat_history")
        users_collection = db.get_collection("users")
        logger.info("MongoDB connected successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
else:
    logger.warning("MONGO_URI not found in environment. Running without persistent storage.")

def get_documents_collection():
    return documents_collection

def get_chat_history_collection():
    return chat_history_collection

def get_users_collection():
    return users_collection
