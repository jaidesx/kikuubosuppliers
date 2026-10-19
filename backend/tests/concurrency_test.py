import concurrent.futures
import json
import uuid
import urllib.request
import urllib.error
from collections import Counter

URL = "http://127.0.0.1:8083/api/v1/orders/"
KEY = str(uuid.uuid4())

order = {
    "customer": {
        "name": "Concurrency Test",
        "phone": "0756000000",
        "location": "Kampala",
        "notes": "Automated concurrency test"
    },
    "payment_method": "mtn",
    "items": [
        {"product_id": 1, "quantity": 2}
    ]
}

payload = json.dumps(order).encode()

def submit(_):
    request = urllib.request.Request(
        URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Idempotency-Key": KEY
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())
    except Exception as error:
        return 0, {"error": str(error)}

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(submit, range(10)))

statuses = Counter(status for status, _ in results)
references = {
    body.get("order_reference")
    for _, body in results
    if body.get("order_reference")
}

print("HTTP status distribution:", dict(statuses))
print("Unique order references:", references)

assert len(references) == 1, "Duplicate or missing order references"
assert statuses[201] == 1, "Expected exactly one new order"
assert statuses[200] == 9, "Expected nine successful replays"
assert all(status in (200, 201) for status, _ in results), (
    "Unexpected HTTP errors"
)

print("PASS: 10 simultaneous requests created one logical order")
