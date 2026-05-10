#!/usr/bin/env python3
"""
studio.py - Virtual Photo Studio CLI

Dispatches a ComfyUI workflow to Fal.ai, injecting a reference face image
into the IP-Adapter / InstantID node (Identity Lock Rule enforcement).

Usage:
    python studio.py <workflow.json> <reference_image_url>
"""

import argparse
import json
import os
import sys
import time

import requests

QUEUE_ENDPOINT = "https://queue.fal.run/fal-ai/comfy"
POLL_INTERVAL = 3       # seconds between status checks
MAX_POLL_ATTEMPTS = 60  # 3 minutes total


def load_workflow(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def inject_reference_image(workflow: dict, reference_url: str) -> dict:
    """
    Finds every IP-Adapter FaceID or InstantID node and sets inputs.image
    to the reference URL. Raises if no matching node exists — this enforces
    the Identity Lock Rule at runtime so no workflow can silently skip it.
    """
    injected = False
    for node_id, node in workflow.items():
        class_type = node.get("class_type", "")
        if "IPAdapter" in class_type or "InstantID" in class_type:
            node.setdefault("inputs", {})["image"] = reference_url
            injected = True
            print(f"[studio] Injected reference image -> node '{node_id}' ({class_type})")

    if not injected:
        raise ValueError(
            "Identity Lock Rule violation: no IPAdapter or InstantID node found in workflow.\n"
            "Add an IPAdapterFaceID or InstantIDModelLoader node before dispatching."
        )
    return workflow


def submit_workflow(workflow: dict, fal_key: str) -> dict:
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(QUEUE_ENDPOINT, headers=headers, json={"prompt": workflow}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def poll_until_complete(status_url: str, response_url: str, fal_key: str) -> dict:
    headers = {"Authorization": f"Key {fal_key}"}
    for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
        resp = requests.get(status_url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "UNKNOWN")
        print(f"[studio] [{attempt}/{MAX_POLL_ATTEMPTS}] Status: {status}")

        if status == "COMPLETED":
            result = requests.get(response_url, headers=headers, timeout=15)
            result.raise_for_status()
            return result.json()

        if status in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"Job ended with status '{status}'.\n{json.dumps(data, indent=2)}")

        time.sleep(POLL_INTERVAL)

    raise TimeoutError(
        f"Job did not complete after {MAX_POLL_ATTEMPTS * POLL_INTERVAL}s. "
        "Check your Fal.ai dashboard for queue status."
    )


def extract_image_urls(result: dict) -> list:
    urls = []
    # Shape 1: { "images": [{ "url": "..." }] }
    for img in result.get("images", []):
        if isinstance(img, dict) and "url" in img:
            urls.append(img["url"])
    # Shape 2: { "outputs": { "node_id": { "images": [{ "url": "..." }] } } }
    for _node, output in result.get("outputs", {}).items():
        if isinstance(output, dict):
            for img in output.get("images", []):
                if isinstance(img, dict) and "url" in img:
                    urls.append(img["url"])
    return urls


def main():
    parser = argparse.ArgumentParser(
        description="Dispatch a ComfyUI workflow to Fal.ai with identity-locked reference image."
    )
    parser.add_argument("workflow", help="Path to the ComfyUI workflow JSON template")
    parser.add_argument("reference_url", help="URL of the reference face image")
    args = parser.parse_args()

    fal_key = os.environ.get("FAL_KEY")
    if not fal_key:
        print("Error: FAL_KEY environment variable is not set.", file=sys.stderr)
        print("PowerShell: $env:FAL_KEY = 'your-key'", file=sys.stderr)
        sys.exit(1)

    print(f"[studio] Loading workflow: {args.workflow}")
    workflow = load_workflow(args.workflow)

    print(f"[studio] Injecting reference: {args.reference_url}")
    workflow = inject_reference_image(workflow, args.reference_url)

    print(f"[studio] Submitting to Fal.ai...")
    submission = submit_workflow(workflow, fal_key)

    request_id = submission.get("request_id", "unknown")
    status_url = submission.get("status_url")
    response_url = submission.get("response_url")
    print(f"[studio] Queued. Request ID: {request_id}")

    if not status_url or not response_url:
        print("[studio] Unexpected submission response:")
        print(json.dumps(submission, indent=2))
        sys.exit(1)

    result = poll_until_complete(status_url, response_url, fal_key)

    urls = extract_image_urls(result)
    if urls:
        print("\n[studio] Done! Result image(s):")
        for url in urls:
            print(f"  {url}")
    else:
        print("[studio] Done. Raw result:")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
