import os
from groq import Groq

def test():
    client = Groq()
    models = client.models.list()
    for m in models.data:
        if "vision" in m.id.lower():
            print(m.id)
test()
