import urllib.request
import json

url = 'https://itpnfalqjjicesqcjzix.supabase.co/rest/v1/profiles'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkxMDgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1Twijc7afmYr-W236E',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkxMDgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1Twijc7afmYr-W236E',
    'Range': '0-5'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        body = response.read().decode('utf-8')
        profiles = json.loads(body)
        print("Profiles found:")
        for p in profiles:
            print(p.get('email'), p.get('role'))
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
