import json
import time
import uuid
import urllib.request
import urllib.error

URL = "http://127.0.0.1:8083/api/v1/orders/"

order = {
    "customer": {
        "name": "Rate Limit Test",
        "phone": "0756000000",
        "location": "Kampala",
        "notes": "Automated test"
    },
    "payment_method": "mtn",
    "items": [{"product_id": 1, "quantity": 1}]
}

payload = json.dumps(order).encode()

statuses = []
retry_after = None

for i in range(35):
    request = urllib.request.Request(
        URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4())
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            statuses.append(response.status)
    except urllib.error.HTTPError as error:
        statuses.append(error.code)
        if error.code == 429:
            retry_after = error.headers.get("Retry-After")

print("Statuses:", statuses)
print("HTTP 429 count:", statuses.count(429))
print("Retry-After:", retry_after)

assert 429 in statuses, "Expected at least one rate-limited request"
assert retry_after is not None, "Missing Retry-After header"
assert all(status in (200, 201, 429) for status in statuses), (
    "Unexpected HTTP error"
)

print("PASS: Rate limiting enforced successfully")
