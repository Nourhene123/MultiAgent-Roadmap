import urllib.request, json, sys

req = urllib.request.Request(
    'http://localhost:8002/api/roadmap/assessment/questions',
    data=json.dumps({'lang': 'fr', 'session_id': 'test_debug_001'}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(req, timeout=12) as r:
        body = r.read().decode()
        print('STATUS:', r.status)
        print('BODY (first 600):', body[:600])
except urllib.error.HTTPError as e:
    print('HTTP ERROR:', e.code)
    print(e.read().decode()[:1500])
except Exception as ex:
    print('CONNECTION ERROR:', type(ex).__name__, ex)
