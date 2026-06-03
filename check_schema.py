import urllib.request
import json

url = 'https://itpnfalqjjicesqcjzix.supabase.co/rest/v1/'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E',
    'Accept': 'application/json'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        body = response.read().decode('utf-8')
        schema = json.loads(body)
        paths = schema.get('paths', {})
        rpc_path = '/rpc/get_customers_directory'
        if rpc_path in paths:
            print("Found RPC path in OpenAPI schema!")
            print(json.dumps(paths[rpc_path], indent=2))
        else:
            print("RPC path NOT found in OpenAPI schema!")
except Exception as e:
    print("Error:", e)
