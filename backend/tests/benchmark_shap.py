"""Benchmark latency for 5, 9, and 20 tokens and measure memory RSS."""
import os
import sys
import time
import psutil
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

os.environ["CHILDSAFELENS_MESSAGE_SHAP_ENABLED"] = "true"
from message_explainer import message_explainer_service
from classifier_service import classifier

def run():
    classifier.classify("warmup")

    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss / (1024 * 1024)

    texts = {
        5: "you are an idiot",
        9: "you are an absolute complete idiot and loser",
        20: "this is a very long test message containing twenty distinct words to benchmark kernel shap execution speed on this machine",
    }

    print(f"Memory RSS before explanation: {mem_before:.2f} MB")
    for n_tok, text in texts.items():
        pred_res = classifier.classify(text)
        prediction = {
            "classification_label": pred_res.label,
            "p_bullying": pred_res.probability,
            "category": pred_res.category,
            "model_version": "cyberbullying-cascade-v4",
        }
        start = time.perf_counter()
        res = message_explainer_service.explain_for_incident(text, prediction, stored_snippet=text)
        duration = time.perf_counter() - start
        print(f"Tokens requested: {n_tok}, Actual m={res.get('n_tokens')}, Status: {res.get('status')}, Latency: {duration:.4f} seconds")

    mem_after = process.memory_info().rss / (1024 * 1024)
    print(f"Memory RSS after explanation: {mem_after:.2f} MB")

if __name__ == "__main__":
    run()
