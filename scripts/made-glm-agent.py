#!/usr/bin/env python3
"""
MADE Agent — GLM-powered coding agent via z.ai API
Usage: made-glm-agent.py [--model MODEL] "your prompt here"
Reads from stdin if no prompt argument given.
Streams output line by line for MADE's agent protocol.
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.error

API_KEY = os.environ.get("ZAI_API_KEY", "b8f161ef90654025a5d25231edb016e2.XAnZrEvNkLnDXPTZ")
BASE_URL = os.environ.get("GLM_BASE_URL", "https://api.z.ai/api/paas/v4")
CODING_URL = "https://api.z.ai/api/coding/paas/v4"

MODELS = {
    "opus": "glm-5.1",
    "sonnet": "glm-5.1",
    "haiku": "glm-4-flash",
    "glm-5.1": "glm-5.1",
    "glm-4-flash": "glm-4-flash",
    "glm-4-plus": "glm-4-plus",
}

SYSTEM_PROMPT = """You are MADE Agent, an expert coding assistant working inside MADE (Multiplayer Agentic Development Environment). 
You help developers write, debug, and review code. You can:
- Write and edit files
- Explain code and concepts
- Debug errors
- Suggest improvements
- Run shell commands (suggest them, the user will execute)

Be concise, practical, and direct. Show code when relevant. No fluff."""

def call_glm_stream(prompt, model="glm-5.1"):
    """Call GLM API with streaming and print output line by line."""
    url = f"{CODING_URL}/chat/completions"
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "stream": True,
        "max_tokens": 4096,
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            buffer = ""
            for chunk in resp:
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        print("", flush=True)
                        return
                    try:
                        obj = json.loads(data)
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            # Print line by line for MADE streaming
                            sys.stdout.write(content)
                            sys.stdout.flush()
                    except json.JSONDecodeError:
                        pass
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[ERROR] API returned {e.code}: {error_body[:200]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="MADE GLM Agent")
    parser.add_argument("--model", default="glm-5.1", help="Model to use")
    parser.add_argument("prompt", nargs="?", help="Prompt (reads stdin if omitted)")
    args = parser.parse_args()
    
    model = MODELS.get(args.model, args.model)
    
    if args.prompt:
        prompt = args.prompt
    else:
        prompt = sys.stdin.read().strip()
    
    if not prompt:
        print("[ERROR] No prompt provided", file=sys.stderr)
        sys.exit(1)
    
    call_glm_stream(prompt, model)

if __name__ == "__main__":
    main()
