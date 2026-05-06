#!/usr/bin/env python3
"""
MADE Agent — GLM-powered coding agent via z.ai API
Usage: made-glm-agent.py [--model MODEL]
Reads prompt from stdin. Streams output line by line for MADE's agent protocol.
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.error

API_KEY = os.environ.get("GLM_API_KEY", os.environ.get("ZAI_API_KEY", "b8f161ef90654025a5d25231edb016e2.XAnZrEvNkLnDXPTZ"))
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

Your job: help users write, edit, and understand code in their project workspace.

## How to create/edit files
When you need to create or modify a file, output a fenced block like this:

```file:PATH
<file contents here>
```

For example:
```file:index.html
<!DOCTYPE html>
<html>
<head><title>Hello</title></head>
<body><h1>Hello World</h1></body>
</html>
```

## Rules
- Be concise and direct. No fluff, no "Sure!", no "Great question!"
- When asked to create something, CREATE IT using the ```file:``` format above
- Show the complete file contents — don't use "..." or "// rest of code"
- You can create multiple files in one response
- Explain briefly what you did after creating files
- If debugging, show the fix with the file block
- Use markdown for explanations, but code goes in ```file:``` blocks
"""


def call_glm_stream(prompt, model="glm-5.1"):
    """Call GLM API with streaming and print output line by line."""
    url = f"{CODING_URL}/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
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
                            sys.stdout.write(content)
                            sys.stdout.flush()
                    except json.JSONDecodeError:
                        pass
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[ERROR] API returned {e.code}: {error_body[:500]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="MADE GLM Agent")
    parser.add_argument("--model", default="glm-5.1", help="Model to use")
    args = parser.parse_args()

    model = MODELS.get(args.model, args.model)

    # Read prompt from stdin
    prompt = sys.stdin.read().strip()

    if not prompt:
        print("[ERROR] No prompt provided", file=sys.stderr)
        sys.exit(1)

    call_glm_stream(prompt, model)


if __name__ == "__main__":
    main()
