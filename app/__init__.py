"""Voice-to-form POC.

Browser mic -> (this server) -> Deepgram STT -> transcript -> LLM extraction -> form fields.
The API keys stay server-side; the browser only talks to this server.
"""
