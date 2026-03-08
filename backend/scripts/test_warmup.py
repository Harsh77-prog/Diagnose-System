import requests

r = requests.post('http://127.0.0.1:8000/api/diagnose/image-predict/warmup', json={})
print('status', r.status_code)
print(r.json())
